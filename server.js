require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const XLSX = require('xlsx');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const {
  generateCategorySuggestions,
  normalizeKey,
} = require('./server/categorySuggestionService');

// Sanitize a user-supplied category name: trim whitespace and collapse internal
// spaces, but do NOT remap aliases — the user's chosen label is preserved as-is.
function sanitizeCategoryName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}
const { createPlaidSyncService } = require('./server/plaidSyncService');
const {
  createTransactionCategorizationService,
} = require('./server/transactionCategorizationService');

const app = express();
const distDir = path.join(__dirname, 'dist');
const hasClientBuild = fs.existsSync(path.join(distDir, 'index.html'));

app.use(express.json({ limit: '25mb' }));
if (hasClientBuild) {
  app.use(express.static(distDir));
}

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET || !process.env.PLAID_ENV) {
  console.error('Missing Plaid environment variables.');
  process.exit(1);
}

const plaidEnv = PlaidEnvironments[process.env.PLAID_ENV];
if (!plaidEnv) {
  console.error(`Invalid PLAID_ENV: ${process.env.PLAID_ENV}`);
  process.exit(1);
}

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: plaidEnv,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  }),
);

const PLAID_PRODUCTS = ['transactions'];
const PLAID_COUNTRY_CODES = ['US'];
const SERVER_BOOT_ID = new Date().toISOString();
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boozhciuxaqfbxvjbnsi.supabase.co';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_Iv92hI6SYFob2nPxD-9Cxw_1LtqdWhQ';
const SUPABASE_SERVER_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  SUPABASE_PUBLISHABLE_KEY;
const APP_SECRET =
  process.env.APP_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.PLAID_SECRET ||
  'chiiz-local-secret';
const TOKEN_ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(`${APP_SECRET}:plaid-token-key`)
  .digest();
const SESSION_SIGNING_KEY = crypto
  .createHash('sha256')
  .update(`${APP_SECRET}:session-signing-key`)
  .digest('hex');
const SESSION_COOKIE_NAME = 'chiiz_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 60);
const PASSWORD_RESET_FROM_EMAIL =
  process.env.PASSWORD_RESET_FROM_EMAIL || process.env.RESET_PASSWORD_FROM_EMAIL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const IS_LOCALHOST =
  process.env.APP_BASE_URL?.includes('localhost') ||
  process.env.APP_BASE_URL?.includes('127.0.0.1') ||
  !process.env.APP_BASE_URL;
const itemHealthCache = new Map();
const MAX_UPLOAD_ROWS = 1000;
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const REQUIRED_UPLOAD_HEADERS = ['Date', 'CategoryType', 'CategoryName', 'Amount'];
const VALID_CATEGORY_TYPES = ['income', 'expense'];

function normalizeUploadHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

function parseAmount(value) {
  if (typeof value === 'number') {
    return value;
  }
  const cleaned = String(value || '')
    .trim()
    .replace(/\$/g, '')
    .replace(/,/g, '');
  return Number(cleaned);
}

function parseUploadDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsedExcel = XLSX.SSF.parse_date_code(value);
    if (
      parsedExcel &&
      Number.isInteger(parsedExcel.y) &&
      Number.isInteger(parsedExcel.m) &&
      Number.isInteger(parsedExcel.d)
    ) {
      const excelDate = new Date(Date.UTC(parsedExcel.y, parsedExcel.m - 1, parsedExcel.d));
      if (Number.isFinite(excelDate.getTime())) {
        return excelDate.toISOString().slice(0, 10);
      }
    }
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function decodeUploadFileBody(body = {}) {
  const fileName = String(body.fileName || '').trim();
  const fileContentBase64 = String(body.fileContentBase64 || '').trim();
  if (!fileName || !fileContentBase64) {
    const error = new Error(
      'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
    );
    error.statusCode = 400;
    throw error;
  }
  if (!/\.(csv|xlsx|xls)$/i.test(fileName)) {
    const error = new Error('Only CSV, XLSX, and XLS files are supported.');
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(fileContentBase64, 'base64');
  if (!buffer.length) {
    const error = new Error('The selected file is empty.');
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > MAX_UPLOAD_FILE_SIZE_BYTES) {
    const error = new Error('File is too large. Maximum upload size is 10MB.');
    error.statusCode = 400;
    throw error;
  }

  return { fileName, buffer };
}

function parseHistoricalUploadBuffer(fileBuffer) {
  let workbook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch (error) {
    const parseError = new Error(
      'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
    );
    parseError.statusCode = 400;
    throw parseError;
  }

  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) {
    const error = new Error('The uploaded file does not contain any sheets.');
    error.statusCode = 400;
    throw error;
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerRow = Array.isArray(matrix[0]) ? matrix[0] : [];
  const headerLookup = new Map();
  headerRow.forEach((header, index) => {
    const normalized = normalizeUploadHeader(header);
    if (normalized && !headerLookup.has(normalized)) {
      headerLookup.set(normalized, index);
    }
  });

  const missing = REQUIRED_UPLOAD_HEADERS.filter(
    (header) => !headerLookup.has(normalizeUploadHeader(header)),
  );
  if (missing.length) {
    const error = new Error(
      'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
    );
    error.statusCode = 400;
    error.validationErrors = missing.map((header) => `Missing required column: ${header}`);
    throw error;
  }

  const indices = {
    date: headerLookup.get(normalizeUploadHeader('Date')),
    categoryType: headerLookup.get(normalizeUploadHeader('CategoryType')),
    categoryName: headerLookup.get(normalizeUploadHeader('CategoryName')),
    amount: headerLookup.get(normalizeUploadHeader('Amount')),
  };

  const nonEmptyRows = matrix
    .slice(1)
    .filter((row) =>
      [indices.date, indices.categoryType, indices.categoryName, indices.amount].some((columnIndex) => {
        const cell = Array.isArray(row) ? row[columnIndex] : '';
        return String(cell || '').trim() !== '';
      }),
    );

  const truncated = nonEmptyRows.length > MAX_UPLOAD_ROWS;
  const rawRows = nonEmptyRows.slice(0, MAX_UPLOAD_ROWS).map((row) => ({
    Date: Array.isArray(row) ? row[indices.date] : '',
    CategoryType: Array.isArray(row) ? row[indices.categoryType] : '',
    CategoryName: Array.isArray(row) ? row[indices.categoryName] : '',
    Amount: Array.isArray(row) ? row[indices.amount] : '',
  }));

  return {
    rawRows,
    totalRows: nonEmptyRows.length,
    truncated,
  };
}

function validateHistoricalRows(rows) {
  const errors = [];
  const cleaned = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // spreadsheet header is row 1
    const normalizedDate = parseUploadDate(row.Date);
    const categoryType = String(row.CategoryType || '')
      .trim()
      .toLowerCase();
    const categoryName = sanitizeCategoryName(row.CategoryName);
    const amount = parseAmount(row.Amount);

    if (!normalizedDate) {
      errors.push(`Row ${rowNum}: invalid Date (use YYYY-MM-DD)`);
    }
    if (!VALID_CATEGORY_TYPES.includes(categoryType)) {
      errors.push(`Row ${rowNum}: CategoryType must be Income or Expense`);
    }
    if (!categoryName) {
      errors.push(`Row ${rowNum}: CategoryName is required`);
    }
    if (!Number.isFinite(amount)) {
      errors.push(`Row ${rowNum}: Amount must be a number`);
    }

    if (
      normalizedDate &&
      VALID_CATEGORY_TYPES.includes(categoryType) &&
      categoryName &&
      Number.isFinite(amount)
    ) {
      cleaned.push({
        date: normalizedDate,
        monthKey: normalizedDate.slice(0, 7),
        categoryType,
        categoryName,
        amount,
      });
    }
  });

  return { errors, cleaned };
}

function buildHistoricalTemplateBuffer() {
  const rows = [
    {
      Date: '2021-01-01',
      CategoryType: 'Income',
      CategoryName: 'Salary',
      Amount: 4153,
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: REQUIRED_UPLOAD_HEADERS,
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });
}

async function ensureCategoryForHistoricalImport({
  userId,
  categorySetId,
  categoryType,
  categoryName,
  categoryCache,
  createdCategoryKeys,
}) {
  const cacheKey = `${categoryType}|${normalizeKey(categoryName)}`;
  if (categoryCache.has(cacheKey)) {
    return categoryCache.get(cacheKey);
  }

  const inserted = await insertCategories([
    {
      user_id: userId,
      category_set_id: categorySetId,
      category_name: categoryName,
      category_type: categoryType,
      forecasted_amount: 0,
      source: 'user',
      status: 'active',
      accepted_at: new Date().toISOString(),
      description: null,
      suggestion_rationale: null,
    },
  ]);

  const category = inserted[0];
  categoryCache.set(cacheKey, category);
  createdCategoryKeys.add(cacheKey);
  return category;
}

async function importHistoricalRowsForUser(userId, cleanedRows) {
  const groupedByComposite = new Map();
  for (const row of cleanedRows) {
    const key = `${row.date}|${row.categoryType}|${normalizeKey(row.categoryName)}`;
    const current = groupedByComposite.get(key) || {
      ...row,
      amount: 0,
    };
    current.amount += Number(row.amount);
    groupedByComposite.set(key, current);
  }
  const groupedRows = [...groupedByComposite.values()];

  const monthToSetCache = new Map();
  for (const row of groupedRows) {
    const monthKey = row.monthKey;
    if (!monthToSetCache.has(monthKey)) {
      const resolvedSetId = await resolveCategorySetIdForMonth(userId, monthKey);
      monthToSetCache.set(monthKey, resolvedSetId);
    }
  }

  const existingCategories = await fetchCategoriesForUser(userId, 'active', null);
  const categoryCache = new Map();
  for (const category of existingCategories) {
    const cacheKey = `${category.categoryType}|${normalizeKey(category.name)}`;
    categoryCache.set(cacheKey, category);
  }
  const createdCategoryKeys = new Set();
  const categoryKeysLinked = new Set();
  const importedTransactions = [];
  const nowIso = new Date().toISOString();

  groupedRows.forEach((row, index) => {
    const monthKey = row.monthKey;
    const categorySetId = monthToSetCache.get(monthKey);
    importedTransactions.push({ row, monthKey, categorySetId, index });
  });

  const preparedTransactions = [];
  for (const entry of importedTransactions) {
    const { row, monthKey, categorySetId, index } = entry;
    const category = await ensureCategoryForHistoricalImport({
      userId,
      categorySetId,
      categoryType: row.categoryType,
      categoryName: row.categoryName,
      categoryCache,
      createdCategoryKeys,
    });

    const categoryKey = `${row.categoryType}|${normalizeKey(row.categoryName)}`;
    categoryKeysLinked.add(categoryKey);

    const normalizedAmount = Math.abs(Number(row.amount || 0));
    const storedAmount = row.categoryType === 'income' ? -normalizedAmount : normalizedAmount;
    const importIdentity = `${userId}|${row.date}|${row.categoryType}|${normalizeKey(row.categoryName)}|${index}`;
    const importIdHash = crypto.createHash('sha1').update(importIdentity).digest('hex').slice(0, 20);

    preparedTransactions.push({
      user_id: userId,
      account_id: null,
      plaid_transaction_id: `upload_${importIdHash}`,
      institution_name: 'Historical Upload',
      merchant_name: row.categoryName,
      transaction_name: `Upload: ${row.categoryName}`,
      normalized_merchant_name: normalizeKey(row.categoryName) || null,
      date: row.date,
      amount: storedAmount,
      category_id: category.id,
      categorization_source: 'user',
      categorization_confidence: 1,
      categorization_reason: `Imported from Upload Data for ${monthKey}.`,
      categorized_at: nowIso,
      ignored_from_budget: false,
    });
  }

  if (preparedTransactions.length) {
    await supabaseRequest(
      '/rest/v1/transactions?on_conflict=plaid_transaction_id',
      {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(preparedTransactions),
      },
    );
  }

  const monthsAffected = new Set(cleanedRows.map((row) => row.monthKey));

  return {
    rowsImported: cleanedRows.length,
    monthsAffected: monthsAffected.size,
    categoriesLinked: categoryKeysLinked.size,
    categoriesCreated: createdCategoryKeys.size,
  };
}

async function fetchHistoricalUploadMonths(userId) {
  const params = new URLSearchParams({
    select: 'id,date,amount,category:categories(category_name,category_type)',
    user_id: `eq.${userId}`,
    plaid_transaction_id: 'like.upload_%',
    order: 'date.desc',
    limit: '10000',
  });

  const rows = await supabaseRequest(`/rest/v1/transactions?${params.toString()}`, {
    method: 'GET',
  });

  const byMonth = new Map();
  for (const row of rows) {
    const monthKey = String(row.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      continue;
    }

    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, {
        id: `server-${monthKey}`,
        monthKey,
        income: 0,
        spending: 0,
        categoryNames: new Set(),
        source: 'csv',
      });
    }

    const monthEntry = byMonth.get(monthKey);
    const amountRaw = Number(row.amount || 0);
    if (row.category?.category_type === 'income') {
      monthEntry.income += Math.abs(amountRaw);
    } else {
      monthEntry.spending += Math.abs(amountRaw);
    }
    const categoryName = row.category?.category_name;
    if (categoryName) {
      monthEntry.categoryNames.add(categoryName);
    }
  }

  return [...byMonth.values()]
    .sort((left, right) => right.monthKey.localeCompare(left.monthKey))
    .map((entry) => ({
      id: entry.id,
      monthKey: entry.monthKey,
      income: entry.income,
      spending: entry.spending,
      categoryCount: entry.categoryNames.size,
      source: entry.source,
    }));
}

async function fetchUnifiedMonthlyCategoryAmountsForUser(userId) {
  const transactionRows = await supabaseRequest(
    `/rest/v1/transactions?${new URLSearchParams({
      select: 'date,amount,category_id,ignored_from_budget,category:categories(id,category_name,category_type)',
      user_id: `eq.${userId}`,
      category_id: 'not.is.null',
      order: 'date.asc',
      limit: '10000',
    }).toString()}`,
    { method: 'GET' },
  );

  const transactionAggregated = new Map();
  for (const row of transactionRows) {
    if (row.ignored_from_budget || !row.category?.id) {
      continue;
    }
    const monthKey = String(row.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      continue;
    }

    const categoryType = String(row.category.category_type || '').toLowerCase();
    const amountRaw = Number(row.amount || 0);
    let normalizedAmount = 0;
    if (categoryType === 'income') {
      normalizedAmount = amountRaw < 0 ? Math.abs(amountRaw) : 0;
    } else {
      normalizedAmount = amountRaw;
    }
    if (!normalizedAmount) {
      continue;
    }

    const key = `${monthKey}|${row.category.id}`;
    const current = transactionAggregated.get(key) || {
      monthKey,
      categoryId: row.category.id,
      categoryName: row.category.category_name || 'Uncategorized',
      categoryType: categoryType === 'income' ? 'income' : 'expense',
      amount: 0,
      sourceUsed: 'transactions',
    };
    current.amount += normalizedAmount;
    transactionAggregated.set(key, current);
  }

  return [...transactionAggregated.values()].sort((left, right) =>
    left.monthKey === right.monthKey
      ? left.categoryName.localeCompare(right.categoryName)
      : left.monthKey.localeCompare(right.monthKey),
  );
}

function serializePlaidError(err) {
  const plaidError = err.response?.data;

  if (plaidError && typeof plaidError === 'object' && !Array.isArray(plaidError)) {
    return {
      status_code: err.response?.status || 500,
      error_type: plaidError.error_type || 'PLAID_ERROR',
      error_code: plaidError.error_code || null,
      error_message: plaidError.error_message || err.message,
      display_message: plaidError.display_message || null,
      documentation_url: plaidError.documentation_url || null,
      request_id: plaidError.request_id || null,
      raw: plaidError,
    };
  }

  return {
    status_code: err.response?.status || 500,
    error_type: 'INTERNAL_SERVER_ERROR',
    error_code: null,
    error_message: err.message || 'Unknown server error',
    display_message: null,
    documentation_url: null,
    request_id: null,
    raw: null,
  };
}

function sendPlaidError(res, defaultMessage, err) {
  const details = serializePlaidError(err);

  console.error(defaultMessage, details);

  return res.status(details.status_code).json({
    error: defaultMessage,
    details,
  });
}

function sanitizeProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    created_at: profile.created_at,
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key.toString('hex'));
    });
  });

  return `${salt}:${derivedKey}`;
}

async function verifyPassword(password, passwordHash) {
  const [salt, storedKey] = String(passwordHash || '').split(':');

  if (!salt || !storedKey) {
    return false;
  }

  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });

  const storedBuffer = Buffer.from(storedKey, 'hex');

  return (
    storedBuffer.length === derivedKey.length &&
    crypto.timingSafeEqual(storedBuffer, derivedKey)
  );
}

async function supabaseRequest(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${endpoint}`, {
      ...options,
      headers: {
        apikey: SUPABASE_SERVER_KEY,
        Authorization: `Bearer ${SUPABASE_SERVER_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (networkError) {
    const error = new Error(
      'Unable to reach Supabase. Check SUPABASE_URL and SUPABASE server key variables.',
    );
    error.statusCode = 503;
    error.details = {
      code: networkError?.cause?.code || null,
      message: networkError?.message || 'Network error while contacting Supabase',
    };
    throw error;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || 'Supabase request failed');
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeAuthInput(body = {}) {
  return {
    firstName: String(body.first_name || '').trim(),
    lastName: String(body.last_name || '').trim(),
    email: String(body.email || '')
      .trim()
      .toLowerCase(),
    password: String(body.password || ''),
  };
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function createPasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function resolveAppBaseUrl(req) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }

  if (IS_LOCALHOST) {
    return 'http://localhost:5173';
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol =
    typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0].trim()
      : req.protocol || 'https';
  const host = req.get('host');
  if (!host) {
    return '';
  }

  return `${protocol}://${host}`;
}

async function sendPasswordResetEmail({ toEmail, resetLink }) {
  if (!RESEND_API_KEY || !PASSWORD_RESET_FROM_EMAIL) {
    return { delivered: false };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: PASSWORD_RESET_FROM_EMAIL,
      to: [toEmail],
      subject: 'Reset your Chiiz password',
      html:
        `<p>We received a request to reset your Chiiz password.</p>` +
        `<p><a href="${resetLink}">Click here to create a new password</a></p>` +
        `<p>This link expires in ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes.</p>`,
    }),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error('Failed to send password reset email.');
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }

  return { delivered: true };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signValue(value) {
  return crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(value).digest('hex');
}

function createSessionToken(userId) {
  const payload = JSON.stringify({
    sub: userId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });
  const encoded = base64UrlEncode(payload);
  const signature = signValue(encoded);
  return `${encoded}.${signature}`;
}

function readSessionToken(token) {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || signValue(encoded) !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload?.sub || !payload?.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, part) => {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName) {
      return cookies;
    }

    cookies[rawName] = decodeURIComponent(rest.join('=') || '');
    return cookies;
  }, {});
}

function setSessionCookie(res, userId) {
  const token = createSessionToken(userId);
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];

  if (!IS_LOCALHOST) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const session = readSessionToken(cookies[SESSION_COOKIE_NAME]);

  if (!session?.sub) {
    return res.status(401).json({
      error: 'You must be logged in to continue.',
    });
  }

  req.userId = session.sub;
  return next();
}

function encryptAccessToken(accessToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOKEN_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(accessToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptAccessToken(value) {
  const [ivHex, authTagHex, encryptedHex] = String(value || '').split(':');

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Stored Plaid token is invalid.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    TOKEN_ENCRYPTION_KEY,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function reportItemHealth(plaidItemId, status) {
  itemHealthCache.set(plaidItemId, status);
}

const plaidSyncService = createPlaidSyncService({
  plaidClient,
  supabaseRequest,
  decryptAccessToken,
  reportItemHealth,
});
const transactionCategorizationService = createTransactionCategorizationService({
  supabaseRequest,
  openAiApiKey: OPENAI_API_KEY,
  openAiModel: OPENAI_MODEL,
});

async function fetchProfileById(userId) {
  const params = new URLSearchParams({
    select: 'id,first_name,last_name,email,created_at',
    id: `eq.${userId}`,
    limit: '1',
  });

  const data = await supabaseRequest(`/rest/v1/profiles?${params.toString()}`, {
    method: 'GET',
  });

  return data?.[0] || null;
}

async function fetchLinkedAccountsForUser(userId) {
  const items = await plaidSyncService.fetchPlaidItemsForUser(userId);
  const accountParams = new URLSearchParams({
    select: 'id,plaid_item_id,plaid_account_id,account_name,account_type,created_at',
    user_id: `eq.${userId}`,
    order: 'created_at.asc',
  });
  const accounts = await supabaseRequest(`/rest/v1/accounts?${accountParams.toString()}`, {
    method: 'GET',
  });

  return items.map((item) => ({
    id: item.id,
    plaid_item_id: item.plaid_item_id,
    institution_name: item.institution_name,
    created_at: item.created_at,
    last_cursor: item.last_cursor,
    status:
      itemHealthCache.get(item.plaid_item_id)?.status ||
      (item.last_cursor ? 'healthy' : 'pending_initial_sync'),
    status_message: itemHealthCache.get(item.plaid_item_id)?.message || null,
    accounts: accounts.filter((account) => account.plaid_item_id === item.id),
  }));
}

function formatStoredTransaction(row) {
  return {
    transaction_id: row.plaid_transaction_id,
    id: row.id,
    merchant_name: row.merchant_name,
    name: row.transaction_name || row.merchant_name,
    transaction_name: row.transaction_name || null,
    amount: Number(row.amount || 0),
    date: row.date,
    institution_name: row.institution_name || null,
    account_name: row.account?.account_name || null,
    account_type: row.account?.account_type || null,
    plaid_account_id: row.account?.plaid_account_id || null,
    location_city: row.location_city || null,
    location_region: row.location_region || null,
    category_id: row.category?.id || null,
    category_name: row.category?.category_name || null,
    category_type: row.category?.category_type || null,
    categorization_source: row.categorization_source || null,
    categorization_confidence:
      row.categorization_confidence === null || row.categorization_confidence === undefined
        ? null
        : Number(row.categorization_confidence),
    categorization_reason: row.categorization_reason || null,
    categorized_at: row.categorized_at || null,
    ignored_from_budget: Boolean(row.ignored_from_budget),
    iso_currency_code: 'USD',
    counterparties: [],
  };
}

function formatCategoryRow(row) {
  return {
    id: row.id,
    budgetId: row.category_set_id || null,
    categorySetId: row.category_set_id || null,
    name: row.category_name,
    description: row.description || null,
    budget: Number(row.forecasted_amount || 0),
    actual: 0,
    categoryType: row.category_type,
    source: row.source,
    status: row.status,
    suggestionRationale: row.suggestion_rationale || null,
    acceptedAt: row.accepted_at || null,
    createdAt: row.created_at,
  };
}

function formatCategorySuggestionRow(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.category_name,
    categoryType: row.category_type,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
  };
}

function formatCategorySetRow(row) {
  return {
    id: row.id,
    name: row.name,
    isDefault: Boolean(row.is_default),
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatMonthStart(monthValue) {
  const normalized = String(monthValue || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return null;
  }
  return `${normalized}-01`;
}

function monthRangeFromKey(monthKey) {
  const normalized = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return null;
  }
  const [year, month] = normalized.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return {
    monthKey: normalized,
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(start),
  };
}

function extractTextOutput(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('\n');
}

function usd(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function buildAskChiizContext({
  transactions,
  accountId,
}) {
  const filtered = transactions.filter((row) => {
    if (accountId && accountId !== 'all' && row.account?.plaid_account_id !== accountId) {
      return false;
    }
    return true;
  });

  const nonIgnored = filtered.filter((row) => !row.ignored_from_budget);
  const spendingRows = nonIgnored.filter((row) => Number(row.amount || 0) > 0);
  const incomeRows = nonIgnored.filter((row) => Number(row.amount || 0) < 0);

  const totalSpending = spendingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalIncome = incomeRows.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);

  const byCategory = new Map();
  for (const row of spendingRows) {
    const categoryName = row.category?.category_name || 'Uncategorized';
    const current = byCategory.get(categoryName) || 0;
    byCategory.set(categoryName, current + Number(row.amount || 0));
  }
  const topCategories = [...byCategory.entries()]
    .map(([name, amount]) => ({ name, amount: Number(amount || 0) }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 6);

  const largestTransaction = [...spendingRows]
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0];

  const byInstitution = new Map();
  for (const row of filtered) {
    const institution = row.institution_name || 'Linked accounts';
    byInstitution.set(institution, (byInstitution.get(institution) || 0) + 1);
  }
  const topInstitution = [...byInstitution.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const accountLabel = accountId && accountId !== 'all'
    ? (() => {
        const match = filtered.find((row) => row.account?.plaid_account_id === accountId);
        const institution = match?.institution_name || 'Account';
        const accountName = match?.account?.account_name || null;
        return accountName ? `${institution} · ${accountName}` : institution;
      })()
    : topInstitution || 'All accounts';

  return {
    monthLabel: 'All available history',
    monthKey: null,
    accountLabel,
    transactionCount: filtered.length,
    totalSpending,
    totalIncome,
    topCategories,
    largestTransaction: largestTransaction
      ? {
          amount: Number(largestTransaction.amount || 0),
          merchantName:
            largestTransaction.transaction_name ||
            largestTransaction.merchant_name ||
            'Unknown merchant',
          categoryName: largestTransaction.category?.category_name || 'Uncategorized',
          date: String(largestTransaction.date || ''),
        }
      : null,
    // Keep a larger sample so the assistant can answer questions about prior months,
    // not only the currently selected month in the UI.
    recentTransactions: nonIgnored.slice(0, 500).map((row) => ({
      merchantName: row.transaction_name || row.merchant_name || 'Unknown merchant',
      date: row.date,
      amount: Number(row.amount || 0),
      categoryName: row.category?.category_name || 'Uncategorized',
      institutionName: row.institution_name || null,
    })),
  };
}

async function fetchAllAskChiizTransactions(userId) {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];

  while (true) {
    const transactionParams = new URLSearchParams({
      select:
        'id,merchant_name,transaction_name,date,amount,institution_name,ignored_from_budget,account:accounts(account_name,plaid_account_id),category:categories(category_name)',
      user_id: `eq.${userId}`,
      order: 'date.desc,created_at.desc',
      limit: String(pageSize),
      offset: String(offset),
    });

    const page = await supabaseRequest(
      `/rest/v1/transactions?${transactionParams.toString()}`,
      { method: 'GET' },
    );
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows;
}

async function requestAskChiizOpenAi({
  question,
  context,
  budgetSummary,
  openAiApiKey,
  model,
}) {
  if (!openAiApiKey) {
    return null;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are Chiiz AI, a friendly personal finance assistant. Answer ONLY using the provided data context. Be concise, numerically accurate, and never invent transactions or categories. If data is insufficient, say so clearly and suggest one helpful follow-up.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                question,
                context,
                budgetSummary,
              }),
            },
          ],
        },
      ],
      max_output_tokens: 450,
    }),
  });

  const responseJson = await response.json();
  if (!response.ok) {
    const message =
      responseJson?.error?.message ||
      responseJson?.message ||
      'OpenAI ask response failed.';
    throw new Error(message);
  }

  return extractTextOutput(responseJson).trim();
}

function deterministicAskChiizAnswer({ question, context, budgetSummary }) {
  const normalizedQuestion = normalizeKey(question);
  const followUps = [
    'Show my top 5 merchants this month.',
    'Break down my biggest spending category.',
    'Compare this month vs last month spending.',
  ];

  if (!context.transactionCount) {
    return {
      answer: `I don’t see transactions for ${context.monthLabel} in the selected account context yet. Try syncing your accounts, then ask again.`,
      highlights: null,
      followUps,
    };
  }

  if (
    (normalizedQuestion.includes('largest') || normalizedQuestion.includes('biggest')) &&
    normalizedQuestion.includes('transaction')
  ) {
    if (!context.largestTransaction) {
      return {
        answer: `I could not find a spending transaction in ${context.monthLabel}.`,
        highlights: null,
        followUps,
      };
    }
    return {
      answer: `Your largest single transaction in ${context.monthLabel} was ${usd(context.largestTransaction.amount)} at ${context.largestTransaction.merchantName}.`,
      highlights: {
        type: 'largest_transaction',
        amount: context.largestTransaction.amount,
        categoryName: context.largestTransaction.categoryName,
        merchantName: context.largestTransaction.merchantName,
        date: context.largestTransaction.date,
      },
      followUps,
    };
  }

  if (
    normalizedQuestion.includes('biggest expense category') ||
    (normalizedQuestion.includes('biggest') && normalizedQuestion.includes('category'))
  ) {
    const top = context.topCategories[0];
    if (!top) {
      return {
        answer: `I don't have enough categorized spending data to identify the biggest expense category in ${context.monthLabel}.`,
        highlights: null,
        followUps,
      };
    }
    return {
      answer: `Your biggest expense category in ${context.monthLabel} is ${top.name} at ${usd(top.amount)}.`,
      highlights: null,
      followUps,
    };
  }

  if (
    normalizedQuestion.includes('on track') &&
    normalizedQuestion.includes('budget') &&
    budgetSummary?.plannedExpenseBudget > 0
  ) {
    const spent = Number(context.totalSpending || 0);
    const planned = Number(budgetSummary.plannedExpenseBudget || 0);
    const delta = spent - planned;
    const pct = planned > 0 ? (spent / planned) * 100 : 0;
    const direction = delta <= 0 ? 'under' : 'over';
    return {
      answer: `For ${context.monthLabel}, you’ve spent ${usd(spent)} against a planned expense budget of ${usd(planned)} (${Math.round(pct)}%). You are ${usd(Math.abs(delta))} ${direction} budget so far.`,
      highlights: null,
      followUps,
    };
  }

  return {
    answer: `For ${context.monthLabel}, I see ${context.transactionCount} transactions with ${usd(context.totalSpending)} spending and ${usd(context.totalIncome)} income in ${context.accountLabel}. Ask me things like “largest transaction”, “biggest category”, or “am I on track with budget?”`,
    highlights: null,
    followUps,
  };
}

async function ensureDefaultCategorySet(userId) {
  const params = new URLSearchParams({
    select: 'id,user_id,name,is_default,status,created_at,updated_at',
    user_id: `eq.${userId}`,
    order: 'created_at.asc',
  });

  let sets = await supabaseRequest(`/rest/v1/category_sets?${params.toString()}`, {
    method: 'GET',
  });

  if (!sets.length) {
    sets = await supabaseRequest('/rest/v1/category_sets', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify([
        {
          user_id: userId,
          name: 'Default Budget',
          is_default: true,
          status: 'active',
        },
      ]),
    });
  }

  let defaultSet = sets.find((set) => set.is_default);
  if (!defaultSet) {
    const promoted = await supabaseRequest(
      `/rest/v1/category_sets?user_id=eq.${userId}&id=eq.${sets[0].id}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          is_default: true,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    defaultSet = promoted?.[0] || sets[0];
  }

  await supabaseRequest(
    `/rest/v1/categories?user_id=eq.${userId}&category_set_id=is.null`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        category_set_id: defaultSet.id,
      }),
    },
  );

  const refreshed = await supabaseRequest(`/rest/v1/category_sets?${params.toString()}`, {
    method: 'GET',
  });

  return {
    sets: refreshed.map(formatCategorySetRow),
    defaultSetId: defaultSet.id,
  };
}

async function fetchCategorySetsForUser(userId) {
  const ensured = await ensureDefaultCategorySet(userId);
  const assignmentParams = new URLSearchParams({
    select: 'id,category_set_id,month_key',
    user_id: `eq.${userId}`,
    order: 'month_key.asc',
  });
  const assignments = await supabaseRequest(
    `/rest/v1/category_set_month_assignments?${assignmentParams.toString()}`,
    {
      method: 'GET',
    },
  );

  return {
    categorySets: ensured.sets,
    monthAssignments: assignments.map((row) => ({
      id: row.id,
      budgetId: row.category_set_id,
      categorySetId: row.category_set_id,
      monthKey: String(row.month_key).slice(0, 7),
    })),
    defaultSetId: ensured.defaultSetId,
  };
}

async function fetchCategorySetById(userId, categorySetId) {
  const params = new URLSearchParams({
    select: 'id,user_id,name,is_default,status,created_at,updated_at',
    id: `eq.${categorySetId}`,
    user_id: `eq.${userId}`,
    limit: '1',
  });
  const rows = await supabaseRequest(`/rest/v1/category_sets?${params.toString()}`, {
    method: 'GET',
  });
  return rows[0] || null;
}

async function requireCategorySetForUser(userId, categorySetId) {
  const row = await fetchCategorySetById(userId, categorySetId);
  if (!row) {
    const error = new Error('Category set not found.');
    error.statusCode = 404;
    throw error;
  }
  return row;
}

async function resolveValidCategorySetId(userId, requestedSetId, monthValue) {
  if (requestedSetId) {
    const existing = await fetchCategorySetById(userId, requestedSetId);
    if (existing?.id) {
      return existing.id;
    }
  }

  return resolveCategorySetIdForMonth(userId, monthValue || null);
}

async function resolveCategorySetIdForMonth(userId, monthValue) {
  const monthStart = formatMonthStart(monthValue) || formatMonthStart(new Date().toISOString().slice(0, 7));
  const assignmentParams = new URLSearchParams({
    select: 'category_set_id',
    user_id: `eq.${userId}`,
    month_key: `eq.${monthStart}`,
    limit: '1',
  });
  const assignments = await supabaseRequest(
    `/rest/v1/category_set_month_assignments?${assignmentParams.toString()}`,
    {
      method: 'GET',
    },
  );
  if (assignments[0]?.category_set_id) {
    return assignments[0].category_set_id;
  }

  const { defaultSetId } = await ensureDefaultCategorySet(userId);
  return defaultSetId;
}

async function fetchCategoriesForUser(userId, status, categorySetId) {
  const params = new URLSearchParams({
    select:
      'id,category_set_id,category_name,description,category_type,forecasted_amount,source,status,suggestion_rationale,accepted_at,created_at',
    user_id: `eq.${userId}`,
    order: 'created_at.asc',
  });

  if (status) {
    params.set('status', `eq.${status}`);
  }
  if (categorySetId) {
    params.set('category_set_id', `eq.${categorySetId}`);
  }

  const rows = await supabaseRequest(`/rest/v1/categories?${params.toString()}`, {
    method: 'GET',
  });

  return rows.map(formatCategoryRow);
}

async function fetchCategoryById(userId, categoryId) {
  const params = new URLSearchParams({
    select:
      'id,category_set_id,category_name,description,category_type,forecasted_amount,source,status,suggestion_rationale,accepted_at,created_at',
    id: `eq.${categoryId}`,
    user_id: `eq.${userId}`,
    limit: '1',
  });

  const rows = await supabaseRequest(`/rest/v1/categories?${params.toString()}`, {
    method: 'GET',
  });

  return rows[0] || null;
}

function scoreCategorySuggestion(name, query) {
  const normalizedName = String(name || '').toLowerCase();
  const normalizedQuery = String(query || '').toLowerCase();
  if (!normalizedQuery) {
    return 1;
  }

  if (normalizedName === normalizedQuery) {
    return 100;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 70;
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 45;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let tokenHits = 0;
  for (const token of tokens) {
    if (normalizedName.includes(token)) {
      tokenHits += 1;
    }
  }

  if (tokenHits === 0) {
    return 0;
  }
  return 20 + tokenHits * 8;
}

async function fetchCategorySuggestionsForUser(userId, categoryType, query, limit) {
  const params = new URLSearchParams({
    select: 'id,user_id,category_name,category_type,is_default,created_at',
    category_type: `eq.${categoryType}`,
    or: `(user_id.is.null,user_id.eq.${userId})`,
    order: 'is_default.desc,category_name.asc',
  });

  const rows = await supabaseRequest(`/rest/v1/category_suggestions?${params.toString()}`, {
    method: 'GET',
  });

  const deduped = new Map();
  for (const row of rows || []) {
    const key = normalizeKey(row.category_name);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }
    // Prefer user-defined suggestions over global defaults for identical names.
    if (!existing.user_id && row.user_id) {
      deduped.set(key, row);
    }
  }

  const queryValue = sanitizeCategoryName(query || '');
  const scored = [...deduped.values()]
    .map((row) => ({
      row,
      score: scoreCategorySuggestion(row.category_name, queryValue),
    }))
    .filter((entry) => (queryValue ? entry.score > 0 : true))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.row.is_default !== right.row.is_default) {
        return left.row.is_default ? -1 : 1;
      }
      return String(left.row.category_name).localeCompare(String(right.row.category_name));
    })
    .slice(0, limit);

  return scored.map((entry) => formatCategorySuggestionRow(entry.row));
}

async function createOrGetUserCategorySuggestion(userId, name, categoryType) {
  const sanitizedName = sanitizeCategoryName(name);
  const params = new URLSearchParams({
    select: 'id,user_id,category_name,category_type,is_default,created_at',
    user_id: `eq.${userId}`,
    category_type: `eq.${categoryType}`,
    category_name: `ilike.${sanitizedName}`,
    limit: '1',
  });

  const existing = await supabaseRequest(`/rest/v1/category_suggestions?${params.toString()}`, {
    method: 'GET',
  });

  if (existing[0]) {
    return { suggestion: formatCategorySuggestionRow(existing[0]), created: false };
  }

  const inserted = await supabaseRequest('/rest/v1/category_suggestions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: userId,
        category_name: sanitizedName,
        category_type: categoryType,
        is_default: false,
      },
    ]),
  });

  return {
    suggestion: formatCategorySuggestionRow(inserted[0]),
    created: true,
  };
}

async function archiveSuggestedCategories(userId) {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    status: 'eq.suggested',
  });

  await supabaseRequest(`/rest/v1/categories?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      status: 'archived',
    }),
  });
}

async function insertCategories(rows) {
  if (!rows.length) {
    return [];
  }

  const response = await supabaseRequest('/rest/v1/categories', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  });

  return response.map(formatCategoryRow);
}

async function updateCategory(userId, categoryId, payload) {
  const params = new URLSearchParams({
    id: `eq.${categoryId}`,
    user_id: `eq.${userId}`,
  });

  const rows = await supabaseRequest(`/rest/v1/categories?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  return rows[0] ? formatCategoryRow(rows[0]) : null;
}

if (process.env.PLAID_ENV === 'production' && IS_LOCALHOST) {
  console.warn(
    'PLAID_ENV is set to production while the app appears to be running locally. ' +
      'If you are testing locally, use sandbox or development credentials instead.',
  );
}

if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    'SUPABASE_SECRET_KEY is not set. Backend requests are using a publishable key and may fail under RLS.',
  );
}

app.get('/api/debug', async (req, res) => {
  let linkedItems = 0;

  try {
    const cookies = parseCookies(req.headers.cookie);
    const session = readSessionToken(cookies[SESSION_COOKIE_NAME]);

    if (session?.sub) {
      linkedItems = (await plaidSyncService.fetchPlaidItemsForUser(session.sub)).length;
    }
  } catch (error) {
    console.error('Debug linked item lookup failed:', error.message);
  }

  res.json({
    server_boot_id: SERVER_BOOT_ID,
    plaid_env: process.env.PLAID_ENV,
    app_base_url: process.env.APP_BASE_URL || null,
    has_client_id: !!process.env.PLAID_CLIENT_ID,
    has_secret: !!process.env.PLAID_SECRET,
    linked_item_count: linkedItems,
    products: PLAID_PRODUCTS,
    country_codes: PLAID_COUNTRY_CODES,
    is_localhost: IS_LOCALHOST,
  });
});

app.post(['/api/auth/forgot_password', '/auth/forgot_password'], async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.',
      });
    }

    const profileParams = new URLSearchParams({
      select: 'id,email',
      email: `eq.${email}`,
      limit: '1',
    });
    const profileRows = await supabaseRequest(`/rest/v1/profiles?${profileParams.toString()}`, {
      method: 'GET',
    });
    const profile = profileRows?.[0] || null;

    let devResetLink = null;
    if (profile) {
      const token = createPasswordResetToken();
      const tokenHash = hashValue(token);
      const expiresAt = new Date(
        Date.now() + Math.max(5, PASSWORD_RESET_TOKEN_TTL_MINUTES) * 60 * 1000,
      ).toISOString();

      await supabaseRequest(
        `/rest/v1/password_reset_tokens?user_id=eq.${profile.id}&consumed_at=is.null`,
        {
          method: 'PATCH',
          headers: {
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            consumed_at: new Date().toISOString(),
          }),
        },
      );

      await supabaseRequest('/rest/v1/password_reset_tokens', {
        method: 'POST',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify([
          {
            user_id: profile.id,
            token_hash: tokenHash,
            expires_at: expiresAt,
          },
        ]),
      });

      const appBaseUrl = resolveAppBaseUrl(req);
      if (!appBaseUrl) {
        throw new Error(
          'Unable to build reset URL. Set APP_BASE_URL to your web app URL and try again.',
        );
      }

      const resetLink = `${appBaseUrl}/?reset_token=${encodeURIComponent(token)}`;
      const emailResult = await sendPasswordResetEmail({
        toEmail: profile.email,
        resetLink,
      });

      if (!emailResult.delivered && IS_LOCALHOST) {
        devResetLink = resetLink;
        console.warn(
          'Password reset email was not sent because RESEND_API_KEY or PASSWORD_RESET_FROM_EMAIL is missing.',
        );
      }
    }

    const response = {
      success: true,
      message:
        'If an account with that email exists, we sent a password reset link.',
    };
    if (devResetLink) {
      response.dev_reset_link = devResetLink;
    }

    return res.json(response);
  } catch (err) {
    console.error('Forgot password error:', err.details || err.message);
    return res.status(err.statusCode || 500).json({
      error: 'Failed to process forgot password request.',
    });
  }
});

app.post(['/api/auth/reset_password', '/auth/reset_password'], async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(400).json({
        error: 'Reset token and new password are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long.',
      });
    }

    const tokenHash = hashValue(token);
    const tokenParams = new URLSearchParams({
      select: 'id,user_id,expires_at,consumed_at',
      token_hash: `eq.${tokenHash}`,
      limit: '1',
    });
    const tokenRows = await supabaseRequest(
      `/rest/v1/password_reset_tokens?${tokenParams.toString()}`,
      {
        method: 'GET',
      },
    );
    const resetToken = tokenRows?.[0] || null;

    if (!resetToken) {
      return res.status(400).json({
        error: 'This password reset link is invalid.',
      });
    }

    const isConsumed = !!resetToken.consumed_at;
    const isExpired = new Date(resetToken.expires_at).getTime() <= Date.now();
    if (isConsumed || isExpired) {
      return res.status(400).json({
        error: 'This password reset link has expired. Please request a new link.',
      });
    }

    const newPasswordHash = await hashPassword(password);

    const updatedProfiles = await supabaseRequest(
      `/rest/v1/profiles?id=eq.${resetToken.user_id}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          password_hash: newPasswordHash,
        }),
      },
    );
    if (!updatedProfiles?.length) {
      return res.status(404).json({
        error: 'Account not found for this password reset link.',
      });
    }

    await supabaseRequest(
      `/rest/v1/password_reset_tokens?user_id=eq.${resetToken.user_id}&consumed_at=is.null`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          consumed_at: new Date().toISOString(),
        }),
      },
    );

    return res.json({
      success: true,
      message: 'Password updated successfully. You can now log in.',
    });
  } catch (err) {
    console.error('Reset password error:', err.details || err.message);
    return res.status(err.statusCode || 500).json({
      error: 'Failed to reset password.',
    });
  }
});

app.post(['/api/auth/signup', '/auth/signup'], async (req, res) => {
  try {
    const { firstName, lastName, email, password } = normalizeAuthInput(req.body);

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        error: 'First name, last name, email, and password are required.',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long.',
      });
    }

    const passwordHash = await hashPassword(password);
    const data = await supabaseRequest('/rest/v1/profiles', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify([
        {
          first_name: firstName,
          last_name: lastName,
          email,
          password_hash: passwordHash,
        },
      ]),
    });

    const profile = data?.[0];
    setSessionCookie(res, profile.id);

    return res.status(201).json({
      user: sanitizeProfile(profile),
      sync: {
        total_items: 0,
        synced_items: [],
        failed_items: [],
      },
    });
  } catch (err) {
    if (err.details?.code === '23505') {
      return res.status(409).json({
        error: 'An account with that email already exists.',
      });
    }

    console.error('Signup error:', err.details || err.message);

    return res.status(err.statusCode || 500).json({
      error: 'Failed to create account.',
    });
  }
});

app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  try {
    const { email, password } = normalizeAuthInput(req.body);

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    const params = new URLSearchParams({
      select: 'id,first_name,last_name,email,password_hash,created_at',
      email: `eq.${email}`,
      limit: '1',
    });

    const data = await supabaseRequest(`/rest/v1/profiles?${params.toString()}`, {
      method: 'GET',
    });

    const profile = data?.[0];
    const isValid = await verifyPassword(password, profile?.password_hash);

    if (!profile || !isValid) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    setSessionCookie(res, profile.id);

    let sync = {
      total_items: 0,
      synced_items: [],
      failed_items: [],
    };
    let categorization = {
      categorizedCount: 0,
      needsReviewCount: 0,
      skippedCount: 0,
      totalConsidered: 0,
      skippedReason: null,
    };

    try {
      sync = await plaidSyncService.syncAllUserItems(profile.id);
    } catch (syncError) {
      console.error(
        `Login sync warning for user ${profile.id}:`,
        syncError.details || syncError.message,
      );
    }

    try {
      categorization = await transactionCategorizationService.categorizeTransactions({
        userId: profile.id,
        onlyUncategorized: true,
      });
    } catch (categorizationError) {
      console.error(
        `Login categorization warning for user ${profile.id}:`,
        categorizationError.details || categorizationError.message,
      );
    }

    return res.json({
      user: sanitizeProfile(profile),
      sync,
      categorization,
    });
  } catch (err) {
    console.error('Login error:', err.details || err.message);

    return res.status(err.statusCode || 500).json({
      error: 'Failed to log in.',
    });
  }
});

app.post(['/api/auth/logout', '/auth/logout'], (req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true });
});

app.get(['/api/auth/session', '/auth/session'], requireAuth, async (req, res) => {
  try {
    const profile = await fetchProfileById(req.userId);

    if (!profile) {
      clearSessionCookie(res);
      return res.status(401).json({
        error: 'Session no longer exists.',
      });
    }

    return res.json({
      user: sanitizeProfile(profile),
    });
  } catch (error) {
    console.error('Session lookup failed:', error.message);
    return res.status(500).json({
      error: 'Failed to restore session.',
    });
  }
});

app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const requestedSetId = req.query?.budget_id
      ? String(req.query.budget_id)
      : req.query?.category_set_id
      ? String(req.query.category_set_id)
      : await resolveCategorySetIdForMonth(req.userId, req.query?.month || null);
    const [activeCategories, suggestedCategories] = await Promise.all([
      fetchCategoriesForUser(req.userId, 'active', requestedSetId),
      fetchCategoriesForUser(req.userId, 'suggested', requestedSetId),
    ]);

    return res.json({
      activeCategories,
      suggestedCategories,
      resolvedBudgetId: requestedSetId,
      resolvedSetId: requestedSetId,
    });
  } catch (error) {
    console.error('Categories lookup failed:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch categories.',
    });
  }
});

app.get('/api/category_suggestions', requireAuth, async (req, res) => {
  try {
    const categoryType = req.query?.categoryType === 'income' ? 'income' : 'expense';
    const query = sanitizeCategoryName(req.query?.query || '');
    const parsedLimit = Number(req.query?.limit || 20);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 50)) : 20;

    const suggestions = await fetchCategorySuggestionsForUser(
      req.userId,
      categoryType,
      query,
      limit,
    );

    return res.json({ suggestions });
  } catch (error) {
    console.error('Category suggestions lookup failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to fetch category suggestions.',
    });
  }
});

app.post('/api/category_suggestions/custom', requireAuth, async (req, res) => {
  try {
    const categoryType = req.body?.categoryType === 'income' ? 'income' : 'expense';
    const name = sanitizeCategoryName(req.body?.name || '');
    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const result = await createOrGetUserCategorySuggestion(req.userId, name, categoryType);
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    console.error('Custom category suggestion creation failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to create custom category suggestion.',
    });
  }
});

app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    const requestedSetId = await resolveValidCategorySetId(
      req.userId,
      req.body?.budgetId
        ? String(req.body.budgetId)
        : req.body?.categorySetId
        ? String(req.body.categorySetId)
        : null,
      req.body?.month || null,
    );
    const categoryName = sanitizeCategoryName(req.body?.name);
    const description = String(req.body?.description || '').trim() || null;
    const categoryType = req.body?.categoryType === 'income' ? 'income' : 'expense';
    const budget = Number(req.body?.budget || 0);

    if (!categoryName) {
      return res.status(400).json({
        error: 'Category name is required.',
      });
    }

    const existingActive = await fetchCategoriesForUser(req.userId, 'active', requestedSetId);
    if (existingActive.some((category) => normalizeKey(category.name) === normalizeKey(categoryName))) {
      return res.status(409).json({
        error: 'A category with that name already exists.',
      });
    }

    const inserted = await insertCategories([
      {
        user_id: req.userId,
        category_set_id: requestedSetId,
        category_name: categoryName,
        description,
        category_type: categoryType,
        forecasted_amount: Number.isFinite(budget) ? budget : 0,
        source: 'user',
        status: 'active',
        accepted_at: new Date().toISOString(),
      },
    ]);

    return res.status(201).json({
      category: inserted[0],
    });
  } catch (error) {
    console.error('Category creation failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to create category.',
    });
  }
});

app.patch('/api/categories/:categoryId', requireAuth, async (req, res) => {
  try {
    const category = await fetchCategoryById(req.userId, req.params.categoryId);

    if (!category) {
      return res.status(404).json({
        error: 'Category not found.',
      });
    }

    const updates = {};

    if (typeof req.body?.name === 'string') {
      const sanitizedName = sanitizeCategoryName(req.body.name);
      if (!sanitizedName) {
        return res.status(400).json({
          error: 'Category name is required.',
        });
      }

      const siblings = await fetchCategoriesForUser(req.userId, category.status, category.categorySetId || null);
      const duplicate = siblings.some(
        (entry) =>
          entry.id !== category.id && normalizeKey(entry.name) === normalizeKey(sanitizedName),
      );

      if (duplicate) {
        return res.status(409).json({
          error: 'A category with that name already exists in this budget.',
        });
      }

      updates.category_name = sanitizedName;
    }

    if (typeof req.body?.description === 'string') {
      updates.description = String(req.body.description).trim() || null;
    }

    if (req.body?.categoryType === 'income' || req.body?.categoryType === 'expense') {
      updates.category_type = req.body.categoryType;
    }

    if (req.body?.status === 'active' || req.body?.status === 'suggested' || req.body?.status === 'archived') {
      updates.status = req.body.status;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'budget')) {
      const budget = Number(req.body.budget || 0);
      updates.forecasted_amount = Number.isFinite(budget) ? budget : 0;
    }

    if (updates.status === 'active' && !category.accepted_at) {
      updates.accepted_at = new Date().toISOString();
    }

    const updated = await updateCategory(req.userId, req.params.categoryId, updates);

    return res.json({
      category: updated,
    });
  } catch (error) {
    console.error('Category update failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to update category.',
    });
  }
});

app.delete('/api/categories/:categoryId', requireAuth, async (req, res) => {
  try {
    const archived = await updateCategory(req.userId, req.params.categoryId, {
      status: 'archived',
    });

    if (!archived) {
      return res.status(404).json({
        error: 'Category not found.',
      });
    }

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error('Category delete failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to remove category.',
    });
  }
});

app.get(['/api/budgets', '/api/category_sets'], requireAuth, async (req, res) => {
  try {
    const data = await fetchCategorySetsForUser(req.userId);
    const resolvedSetId = await resolveCategorySetIdForMonth(req.userId, req.query?.month || null);

    return res.json({
      budgets: data.categorySets,
      budgetMonthAssignments: data.monthAssignments,
      resolvedBudgetId: resolvedSetId,
      categorySets: data.categorySets,
      monthAssignments: data.monthAssignments,
      resolvedSetId,
    });
  } catch (error) {
    console.error('Category sets lookup failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to fetch category sets.',
    });
  }
});

app.post(['/api/budgets', '/api/category_sets'], requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Category set name is required.' });
    }

    const isDefault = Boolean(req.body?.isDefault);
    const existingForUser = await fetchCategorySetsForUser(req.userId);
    const shouldBeDefault = isDefault || existingForUser.categorySets.length === 0;
    if (isDefault) {
      await supabaseRequest(`/rest/v1/category_sets?user_id=eq.${req.userId}&is_default=is.true`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_default: false, updated_at: new Date().toISOString() }),
      });
    }

    const rows = await supabaseRequest('/rest/v1/category_sets', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          user_id: req.userId,
          name,
          is_default: shouldBeDefault,
          status: 'active',
        },
      ]),
    });

    return res.status(201).json({
      budget: formatCategorySetRow(rows[0]),
      categorySet: formatCategorySetRow(rows[0]),
    });
  } catch (error) {
    console.error('Category set creation failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to create category set.',
    });
  }
});

app.patch(['/api/budgets/:categorySetId', '/api/category_sets/:categorySetId'], requireAuth, async (req, res) => {
  try {
    const categorySetId = String(req.params.categorySetId);
    const existing = await fetchCategorySetById(req.userId, categorySetId);
    if (!existing) {
      return res.status(404).json({ error: 'Category set not found.' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (typeof req.body?.name === 'string') {
      const name = String(req.body.name).trim();
      if (!name) {
        return res.status(400).json({ error: 'Category set name is required.' });
      }
      updates.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isDefault')) {
      const isDefault = Boolean(req.body.isDefault);
      if (!isDefault && existing.is_default) {
        return res.status(400).json({
          error: 'A default category set is required. Mark another set as default first.',
        });
      }
      updates.is_default = isDefault;
      if (isDefault) {
        await supabaseRequest(
          `/rest/v1/category_sets?user_id=eq.${req.userId}&is_default=is.true&id=neq.${categorySetId}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ is_default: false, updated_at: new Date().toISOString() }),
          },
        );
      }
    }
    if (req.body?.status === 'active' || req.body?.status === 'archived') {
      if (req.body.status === 'archived' && existing.is_default) {
        return res.status(400).json({
          error: 'Default category set cannot be archived. Mark another set as default first.',
        });
      }
      updates.status = req.body.status;
    }

    const rows = await supabaseRequest(
      `/rest/v1/category_sets?user_id=eq.${req.userId}&id=eq.${categorySetId}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(updates),
      },
    );

    return res.json({
      budget: formatCategorySetRow(rows[0]),
      categorySet: formatCategorySetRow(rows[0]),
    });
  } catch (error) {
    console.error('Category set update failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to update category set.',
    });
  }
});

app.post(['/api/budgets/:categorySetId/duplicate', '/api/category_sets/:categorySetId/duplicate'], requireAuth, async (req, res) => {
  try {
    const sourceSetId = String(req.params.categorySetId);
    const sourceSet = await requireCategorySetForUser(req.userId, sourceSetId);
    const baseName = `${sourceSet.name} - Duplicate`;
    const allSets = await fetchCategorySetsForUser(req.userId);
    const names = new Set(allSets.categorySets.map((set) => set.name.toLowerCase()));
    let duplicateName = baseName;
    let suffix = 2;
    while (names.has(duplicateName.toLowerCase())) {
      duplicateName = `${baseName} ${suffix}`;
      suffix += 1;
    }

    const createdSets = await supabaseRequest('/rest/v1/category_sets', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          user_id: req.userId,
          name: duplicateName,
          is_default: false,
          status: 'active',
        },
      ]),
    });
    const duplicatedSet = createdSets[0];
    const sourceCategories = await fetchCategoriesForUser(req.userId, 'active', sourceSetId);

    if (sourceCategories.length) {
      await insertCategories(
        sourceCategories.map((category) => ({
          user_id: req.userId,
          category_set_id: duplicatedSet.id,
          category_name: category.name,
          description: category.description || null,
          category_type: category.categoryType,
          forecasted_amount: Number(category.budget || 0),
          source: category.source || 'user',
          status: 'active',
          accepted_at: new Date().toISOString(),
          suggestion_rationale: null,
        })),
      );
    }

    return res.status(201).json({
      budget: formatCategorySetRow(duplicatedSet),
      categorySet: formatCategorySetRow(duplicatedSet),
      duplicatedCategoryCount: sourceCategories.length,
    });
  } catch (error) {
    console.error('Category set duplication failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to duplicate category set.',
    });
  }
});

app.delete(['/api/budgets/:categorySetId', '/api/category_sets/:categorySetId'], requireAuth, async (req, res) => {
  try {
    const categorySetId = String(req.params.categorySetId);
    const list = await fetchCategorySetsForUser(req.userId);
    const activeSets = list.categorySets.filter((entry) => entry.status !== 'archived');
    const target = list.categorySets.find((entry) => entry.id === categorySetId);
    if (!target) {
      return res.status(404).json({ error: 'Category set not found.' });
    }
    if (activeSets.length <= 1) {
      return res.status(400).json({
        error: 'At least one category set must exist. Create another set before deleting this one.',
      });
    }

    const fallback = activeSets.find((entry) => entry.id !== categorySetId);
    await supabaseRequest(
      `/rest/v1/category_set_month_assignments?user_id=eq.${req.userId}&category_set_id=eq.${categorySetId}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ category_set_id: fallback.id, updated_at: new Date().toISOString() }),
      },
    );
    await supabaseRequest(
      `/rest/v1/categories?user_id=eq.${req.userId}&category_set_id=eq.${categorySetId}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ category_set_id: fallback.id }),
      },
    );
    if (target.isDefault) {
      await supabaseRequest(
        `/rest/v1/category_sets?user_id=eq.${req.userId}&id=eq.${fallback.id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ is_default: true, updated_at: new Date().toISOString() }),
        },
      );
    }
    await supabaseRequest(
      `/rest/v1/category_sets?user_id=eq.${req.userId}&id=eq.${categorySetId}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Category set delete failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to delete category set.',
    });
  }
});

app.post(['/api/budgets/:categorySetId/assign_months', '/api/category_sets/:categorySetId/assign_months'], requireAuth, async (req, res) => {
  try {
    const categorySetId = String(req.params.categorySetId);
    await requireCategorySetForUser(req.userId, categorySetId);
    const months = Array.isArray(req.body?.months) ? req.body.months.map(formatMonthStart) : [];
    const monthKeys = [...new Set(months.filter(Boolean))];
    if (!monthKeys.length) {
      return res.status(400).json({ error: 'At least one month is required.' });
    }

    const rows = await supabaseRequest(
      '/rest/v1/category_set_month_assignments?on_conflict=user_id,month_key',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(
          monthKeys.map((monthKey) => ({
            user_id: req.userId,
            category_set_id: categorySetId,
            month_key: monthKey,
            updated_at: new Date().toISOString(),
          })),
        ),
      },
    );

    return res.json({
      assignments: rows.map((row) => ({
        id: row.id,
        budgetId: row.category_set_id,
        categorySetId: row.category_set_id,
        monthKey: String(row.month_key).slice(0, 7),
      })),
    });
  } catch (error) {
    console.error('Month assignment failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to assign months.',
    });
  }
});

app.delete(['/api/budgets/:categorySetId/assign_months', '/api/category_sets/:categorySetId/assign_months'], requireAuth, async (req, res) => {
  try {
    const categorySetId = String(req.params.categorySetId);
    await requireCategorySetForUser(req.userId, categorySetId);
    const months = Array.isArray(req.body?.months) ? req.body.months.map(formatMonthStart) : [];
    const monthKeys = [...new Set(months.filter(Boolean))];
    if (!monthKeys.length) {
      return res.json({ success: true });
    }

    const inClause = `(${monthKeys.join(',')})`;
    await supabaseRequest(
      `/rest/v1/category_set_month_assignments?user_id=eq.${req.userId}&category_set_id=eq.${categorySetId}&month_key=in.${encodeURIComponent(inClause)}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Month unassignment failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to unassign months.',
    });
  }
});

app.post('/api/categories/accept', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const selectedSuggestions = (await fetchCategoriesForUser(req.userId, 'suggested')).filter(
      (category) => ids.length === 0 || ids.includes(category.id),
    );
    const activeCategories = await fetchCategoriesForUser(req.userId, 'active');
    const activeNamesBySet = new Map();
    for (const category of activeCategories) {
      const setId = String(category.categorySetId || '');
      if (!activeNamesBySet.has(setId)) {
        activeNamesBySet.set(setId, new Set());
      }
      activeNamesBySet.get(setId).add(normalizeKey(category.name));
    }

    const accepted = [];
    const skipped = [];

    for (const suggestion of selectedSuggestions) {
      const setId = String(suggestion.categorySetId || '');
      if (!activeNamesBySet.has(setId)) {
        activeNamesBySet.set(setId, new Set());
      }
      const activeNames = activeNamesBySet.get(setId);
      const key = normalizeKey(suggestion.name);
      if (activeNames.has(key)) {
        await updateCategory(req.userId, suggestion.id, {
          status: 'archived',
        });
        skipped.push(suggestion.name);
        continue;
      }

      const updated = await updateCategory(req.userId, suggestion.id, {
        status: 'active',
      });
      activeNames.add(key);
      if (updated) {
        accepted.push(updated);
      }
    }

    return res.json({
      acceptedCategories: accepted,
      skippedDuplicates: skipped,
    });
  } catch (error) {
    console.error('Category acceptance failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to accept suggested categories.',
    });
  }
});

app.post('/api/categories/suggestions/generate', requireAuth, async (req, res) => {
  try {
    const requestedSetId = await resolveValidCategorySetId(
      req.userId,
      req.body?.budgetId
        ? String(req.body.budgetId)
        : req.body?.categorySetId
        ? String(req.body.categorySetId)
        : null,
      req.body?.month || null,
    );
    const categoryParams = new URLSearchParams({
      select: 'category_name,status',
      user_id: `eq.${req.userId}`,
      category_set_id: `eq.${requestedSetId}`,
      status: 'in.(active,suggested)',
    });
    const transactionParams = new URLSearchParams({
      select: 'merchant_name,amount,date,institution_name',
      user_id: `eq.${req.userId}`,
      order: 'date.desc',
      limit: '250',
    });

    const [existingCategories, recentTransactions] = await Promise.all([
      supabaseRequest(`/rest/v1/categories?${categoryParams.toString()}`, {
        method: 'GET',
      }),
      supabaseRequest(`/rest/v1/transactions?${transactionParams.toString()}`, {
        method: 'GET',
      }),
    ]);

    if (!recentTransactions.length) {
      return res.status(400).json({
        error: 'No transactions are available yet. Link accounts and sync transactions first.',
      });
    }

    const suggestions = await generateCategorySuggestions({
      transactions: recentTransactions,
      existingCategoryNames: existingCategories.map((category) => category.category_name),
      openAiApiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL,
    });

    await supabaseRequest(
      `/rest/v1/categories?user_id=eq.${req.userId}&category_set_id=eq.${requestedSetId}&status=eq.suggested`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: 'archived',
        }),
      },
    );

    const inserted = await insertCategories(
      suggestions.map((suggestion) => ({
        user_id: req.userId,
        category_set_id: requestedSetId,
        category_name: suggestion.name,
        description: suggestion.description,
        category_type: suggestion.categoryType,
        forecasted_amount: 0,
        source: 'ai',
        status: 'active',
        accepted_at: new Date().toISOString(),
        suggestion_rationale: suggestion.rationale,
      })),
    );

    return res.json({
      suggestedCategories: inserted,
      generatedCount: inserted.length,
    });
  } catch (error) {
    console.error('AI category generation failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to generate category suggestions.',
    });
  }
});

app.get('/api/upload_data/template', requireAuth, async (req, res) => {
  try {
    const workbookBuffer = buildHistoricalTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="chiiz-transactions-template.xlsx"',
    );
    return res.send(workbookBuffer);
  } catch (error) {
    console.error('Template download failed:', error.details || error.message);
    return res.status(500).json({
      error: 'Failed to generate template.',
    });
  }
});

app.get('/api/upload_data/months', requireAuth, async (req, res) => {
  try {
    const months = await fetchHistoricalUploadMonths(req.userId);
    return res.json({ months });
  } catch (error) {
    console.error('Uploaded months fetch failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to fetch uploaded months.',
    });
  }
});

app.get('/api/unified_monthly_category_amounts', requireAuth, async (req, res) => {
  try {
    const rows = await fetchUnifiedMonthlyCategoryAmountsForUser(req.userId);
    return res.json({ rows });
  } catch (error) {
    console.error('Unified monthly amounts fetch failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to fetch unified monthly category amounts.',
    });
  }
});

app.post('/api/upload_data/preview', requireAuth, async (req, res) => {
  try {
    const { buffer } = decodeUploadFileBody(req.body);
    const { rawRows, totalRows, truncated } = parseHistoricalUploadBuffer(buffer);
    const validation = validateHistoricalRows(rawRows);

    if (!validation.cleaned.length && !validation.errors.length) {
      return res.status(400).json({
        error:
          'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
        details: {
          validationErrors: ['The file does not contain any data rows.'],
        },
      });
    }

    if (validation.errors.length) {
      return res.status(400).json({
        error:
          'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
        details: {
          validationErrors: validation.errors.slice(0, 25),
          validationErrorCount: validation.errors.length,
        },
      });
    }

    const monthsDetected = new Set(validation.cleaned.map((row) => row.monthKey));
    const categoriesDetected = new Set(
      validation.cleaned.map(
        (row) => `${row.categoryType}|${normalizeKey(row.categoryName)}`,
      ),
    );

    return res.json({
      ready: true,
      rowsReady: validation.cleaned.length,
      totalRowsParsed: totalRows,
      monthsDetected: monthsDetected.size,
      categoriesDetected: categoriesDetected.size,
      warning: truncated ? 'Your file had more than 1000 rows. Only the first 1000 were imported.' : null,
    });
  } catch (error) {
    console.error('Upload preview failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error:
        error.message ||
        'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
      details: {
        validationErrors: error.validationErrors || [],
      },
    });
  }
});

app.post('/api/upload_data/import', requireAuth, async (req, res) => {
  try {
    const { buffer } = decodeUploadFileBody(req.body);
    const { rawRows, totalRows, truncated } = parseHistoricalUploadBuffer(buffer);
    const validation = validateHistoricalRows(rawRows);

    if (!validation.cleaned.length && !validation.errors.length) {
      return res.status(400).json({
        error:
          'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
        details: {
          validationErrors: ['The file does not contain any data rows.'],
        },
      });
    }

    if (validation.errors.length) {
      return res.status(400).json({
        error:
          'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
        details: {
          validationErrors: validation.errors.slice(0, 25),
          validationErrorCount: validation.errors.length,
        },
      });
    }

    const summary = await importHistoricalRowsForUser(req.userId, validation.cleaned);
    const months = await fetchHistoricalUploadMonths(req.userId);

    return res.json({
      success: true,
      warning: truncated ? 'Your file had more than 1000 rows. Only the first 1000 were imported.' : null,
      ...summary,
      totalRowsParsed: totalRows,
      months,
    });
  } catch (error) {
    console.error('Upload import failed:', error.details || error.message);
    const detailsMessage = String(error?.details?.message || error?.message || '');
    const accountIdConstraintFailure =
      detailsMessage.includes('null value in column "account_id" of relation "transactions"') ||
      detailsMessage.includes('transactions_account_id_fkey');
    if (accountIdConstraintFailure) {
      return res.status(400).json({
        error:
          'Import failed because your database schema is out of date. Please run migration `supabase/migrations/20260408101500_manual_transactions_account_nullable.sql` so historical/manual transactions can be stored without an account.',
      });
    }
    return res.status(error.statusCode || 500).json({
      error:
        error.message ||
        'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
      details: {
        validationErrors: error.validationErrors || [],
      },
    });
  }
});

app.post('/api/create_link_token', requireAuth, async (req, res) => {
  try {
    const request = {
      user: {
        client_user_id: req.userId,
      },
      client_name: 'Chiiz',
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: 'en',
    };

    // When an Item later needs repair, this route can be extended to create
    // update-mode link tokens for that specific stored plaid_item.
    if (process.env.PLAID_REDIRECT_URI) {
      request.redirect_uri = process.env.PLAID_REDIRECT_URI;
    }

    if (process.env.PLAID_ANDROID_PACKAGE_NAME) {
      request.android_package_name = process.env.PLAID_ANDROID_PACKAGE_NAME;
    }

    const response = await plaidClient.linkTokenCreate(request);

    return res.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
      plaid_env: process.env.PLAID_ENV,
      server_boot_id: SERVER_BOOT_ID,
    });
  } catch (err) {
    return sendPlaidError(res, 'Failed to create link token', err);
  }
});

app.post('/api/exchange_token', requireAuth, async (req, res) => {
  try {
    const { public_token: publicToken, institution_name: institutionName } = req.body || {};

    if (!publicToken) {
      return res.status(400).json({
        error: 'Missing public_token in request body',
      });
    }

    const exchange = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const plaidItemId = exchange.data.item_id;
    const encryptedAccessToken = encryptAccessToken(exchange.data.access_token);

    const storedItems = await supabaseRequest('/rest/v1/plaid_items?on_conflict=plaid_item_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([
        {
          user_id: req.userId,
          plaid_item_id: plaidItemId,
          access_token_encrypted: encryptedAccessToken,
          institution_name: institutionName || 'Linked institution',
          last_cursor: null,
        },
      ]),
    });

    const plaidItem = storedItems?.[0];

    const initialSync = await plaidSyncService.syncPlaidItem({
      userId: req.userId,
      plaidItem,
    });
    const categorization = await transactionCategorizationService.categorizeTransactions({
      userId: req.userId,
      onlyUncategorized: true,
    });

    return res.json({
      success: true,
      item_id: plaidItemId,
      message: 'Account linked and synced successfully',
      plaid_env: process.env.PLAID_ENV,
      server_boot_id: SERVER_BOOT_ID,
      initial_sync: initialSync,
      categorization,
    });
  } catch (err) {
    return sendPlaidError(res, 'Failed to exchange public token', err);
  }
});

async function handleSyncRequest(req, res) {
  try {
    const sync = await plaidSyncService.syncAllUserItems(req.userId);
    const categorization = await transactionCategorizationService.categorizeTransactions({
      userId: req.userId,
      onlyUncategorized: true,
    });

    return res.json({
      success: true,
      sync,
      categorization,
    });
  } catch (error) {
    console.error('Manual sync failed:', error.message);
    return res.status(500).json({
      error: 'Failed to sync linked accounts.',
    });
  }
}

app.get('/api/sync', requireAuth, handleSyncRequest);
app.post('/api/sync', requireAuth, handleSyncRequest);

app.get('/api/linked_accounts', requireAuth, async (req, res) => {
  try {
    const items = await fetchLinkedAccountsForUser(req.userId);

    return res.json({
      items,
      total_items: items.length,
      total_accounts: items.reduce((sum, item) => sum + item.accounts.length, 0),
    });
  } catch (error) {
    console.error('Linked accounts lookup failed:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch linked accounts.',
    });
  }
});

app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    const params = new URLSearchParams({
      select: 'id,plaid_item_id,plaid_account_id,account_name,account_type,created_at',
      user_id: `eq.${req.userId}`,
      order: 'created_at.asc',
    });

    const accounts = await supabaseRequest(`/rest/v1/accounts?${params.toString()}`, {
      method: 'GET',
    });

    return res.json({
      accounts: accounts.map((account) => ({
        id: account.id,
        plaid_item_id: account.plaid_item_id,
        plaid_account_id: account.plaid_account_id,
        account_name: account.account_name,
        account_type: account.account_type,
        institution_name: null,
        created_at: account.created_at,
      })),
    });
  } catch (error) {
    console.error('Accounts error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch accounts',
    });
  }
});

app.post('/api/transactions/manual', requireAuth, async (req, res) => {
  try {
    const merchant = String(req.body?.merchant || '').trim();
    const accountId = req.body?.accountId ? String(req.body.accountId) : 'cash';
    const transactionType = String(req.body?.transactionType || 'expense')
      .trim()
      .toLowerCase();
    const categoryId = req.body?.categoryId ? String(req.body.categoryId) : null;
    const dateValue = String(req.body?.date || '').trim();
    const amountValue = Number(req.body?.amount || 0);

    if (!merchant) {
      return res.status(400).json({ error: 'Merchant is required.' });
    }
    if (!dateValue || Number.isNaN(Date.parse(dateValue))) {
      return res.status(400).json({ error: 'A valid date is required.' });
    }
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      return res.status(400).json({ error: 'Amount must be a non-zero number.' });
    }
    if (transactionType !== 'income' && transactionType !== 'expense') {
      return res.status(400).json({ error: 'Transaction type must be income or expense.' });
    }

    let accountRecord = null;
    if (accountId !== 'cash') {
      const accountParams = new URLSearchParams({
        select: 'id,account_name,account_type,plaid_account_id,item:plaid_items(institution_name)',
        id: `eq.${accountId}`,
        user_id: `eq.${req.userId}`,
        limit: '1',
      });
      const accounts = await supabaseRequest(`/rest/v1/accounts?${accountParams.toString()}`, {
        method: 'GET',
      });
      accountRecord = accounts?.[0] || null;
      if (!accountRecord) {
        return res.status(400).json({ error: 'Selected account is invalid.' });
      }
    }

    let storedAmount = transactionType === 'income' ? -Math.abs(amountValue) : Math.abs(amountValue);
    let categoryRecord = null;
    if (categoryId) {
      categoryRecord = await fetchCategoryById(req.userId, categoryId);
      if (!categoryRecord || categoryRecord.status !== 'active') {
        return res.status(400).json({ error: 'Selected category is invalid.' });
      }
      if (categoryRecord.category_type === 'income') {
        storedAmount = -Math.abs(amountValue);
      }
    }

    const normalizedMerchant = normalizeKey(merchant);
    const manualId = `manual_${req.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isoDate = new Date(dateValue).toISOString().slice(0, 10);

    const inserted = await supabaseRequest('/rest/v1/transactions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          user_id: req.userId,
          account_id: accountRecord?.id || null,
          plaid_transaction_id: manualId,
          institution_name:
            accountRecord?.item?.institution_name || (accountId === 'cash' ? 'Cash' : 'Manual Entry'),
          merchant_name: merchant,
          transaction_name: merchant,
          normalized_merchant_name: normalizedMerchant || null,
          date: isoDate,
          amount: storedAmount,
          category_id: categoryId || null,
          categorization_source: categoryId ? 'user' : 'needs_review',
          categorization_confidence: categoryId ? 1 : 0,
          categorization_reason: categoryId
            ? 'Manual transaction category selected by user.'
            : 'Manual transaction awaiting category assignment.',
          categorized_at: new Date().toISOString(),
          ignored_from_budget: false,
        },
      ]),
    });

    const transactionParams = new URLSearchParams({
      select:
        'id,plaid_transaction_id,merchant_name,transaction_name,date,amount,created_at,institution_name,location_city,location_region,categorization_source,categorization_confidence,categorization_reason,categorized_at,ignored_from_budget,account:accounts(account_name,account_type,plaid_account_id),category:categories(id,category_name)',
      id: `eq.${inserted[0].id}`,
      user_id: `eq.${req.userId}`,
      limit: '1',
    });
    const rows = await supabaseRequest(`/rest/v1/transactions?${transactionParams.toString()}`, {
      method: 'GET',
    });

    return res.status(201).json({
      transaction: rows[0] ? formatStoredTransaction(rows[0]) : null,
    });
  } catch (error) {
    console.error('Manual transaction creation failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to create manual transaction.',
    });
  }
});

app.delete('/api/transactions/:transactionId', requireAuth, async (req, res) => {
  try {
    const transactionId = String(req.params.transactionId || '').trim();
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction id is required.' });
    }

    const params = new URLSearchParams({
      select: 'id,plaid_transaction_id',
      id: `eq.${transactionId}`,
      user_id: `eq.${req.userId}`,
      limit: '1',
    });
    const existing = await supabaseRequest(`/rest/v1/transactions?${params.toString()}`, {
      method: 'GET',
    });
    const row = existing?.[0] || null;

    if (!row) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    if (!String(row.plaid_transaction_id || '').startsWith('manual_')) {
      return res.status(403).json({ error: 'Only manually added transactions can be removed.' });
    }

    await supabaseRequest(
      `/rest/v1/transactions?${new URLSearchParams({
        id: `eq.${transactionId}`,
        user_id: `eq.${req.userId}`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Manual transaction deletion failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to delete transaction.',
    });
  }
});

app.post('/api/transactions/categorize', requireAuth, async (req, res) => {
  try {
    const categorization = await transactionCategorizationService.categorizeTransactions({
      userId: req.userId,
      onlyUncategorized: req.body?.force ? false : true,
    });

    return res.json({
      success: true,
      categorization,
    });
  } catch (error) {
    console.error('Transaction categorization failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to categorize transactions.',
    });
  }
});

app.patch('/api/transactions/:transactionId/category', requireAuth, async (req, res) => {
  try {
    const categoryId = req.body?.categoryId ? String(req.body.categoryId) : null;
    const ignored = req.body?.ignored === true || req.body?.ignored === 'true';

    await transactionCategorizationService.overrideTransactionCategory({
      userId: req.userId,
      transactionId: req.params.transactionId,
      categoryId,
      ignored,
    });

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error('Transaction category override failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to update transaction category.',
    });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const ignoreCategoryFilterValue = '__ignore__';
    const categoryTypeFilterRaw = String(req.query?.category_type || '').trim().toLowerCase();
    const categoryTypeFilter =
      categoryTypeFilterRaw === 'income' || categoryTypeFilterRaw === 'expense'
        ? categoryTypeFilterRaw
        : null;
    const monthKey = /^\d{4}-\d{2}$/.test(String(req.query?.month || ''))
      ? String(req.query.month)
      : null;
    const monthRange = monthKey ? monthRangeFromKey(monthKey) : null;
    const reviewTabRaw = String(req.query?.review_tab || '').trim();
    const reviewTab =
      reviewTabRaw === 'needs_review' || reviewTabRaw === 'confirmed' ? reviewTabRaw : 'all';
    const categoryIdFilterRaw = String(req.query?.category_id || '').trim();
    const categoryIdFilter = categoryIdFilterRaw || null;
    const pageSizeRaw = Number(req.query?.page_size || 25);
    const allowedPageSizes = new Set([10, 25, 50, 100]);
    const pageSize = allowedPageSizes.has(pageSizeRaw) ? pageSizeRaw : 25;
    const pageRaw = Number(req.query?.page || 1);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

    const params = new URLSearchParams({
      select:
        'id,plaid_transaction_id,merchant_name,transaction_name,date,amount,created_at,institution_name,location_city,location_region,categorization_source,categorization_confidence,categorization_reason,categorized_at,ignored_from_budget,account:accounts(account_name,account_type,plaid_account_id),category:categories(id,category_name,category_type)',
      user_id: `eq.${req.userId}`,
      order: 'date.desc,created_at.desc',
    });
    if (monthRange) {
      params.set('and', `(date.gte.${monthRange.startIso},date.lt.${monthRange.endIso})`);
    }

    const rows = await supabaseRequest(`/rest/v1/transactions?${params.toString()}`, {
      method: 'GET',
    });
    const formattedAllRows = rows.map(formatStoredTransaction);
    const monthTotalCount = formattedAllRows.length;
    const typeFilteredRows = categoryTypeFilter
      ? rows.filter((row) => {
          // Keep ignored rows visible in Confirmed even though they have no category type.
          if (Boolean(row.ignored_from_budget)) {
            return true;
          }
          const explicitType = String(row.category?.category_type || '').toLowerCase();
          if (explicitType === 'income' || explicitType === 'expense') {
            return explicitType === categoryTypeFilter;
          }
          // Fallback for uncategorized rows: infer likely type by amount sign so
          // credits (negative) can still appear under income filters.
          const amountValue = Number(row.amount || 0);
          const inferredType = amountValue < 0 ? 'income' : 'expense';
          return inferredType === categoryTypeFilter;
        })
      : rows;
    const formattedRows = typeFilteredRows.map(formatStoredTransaction);
    const categoryFilteredRows = categoryIdFilter
      ? formattedRows.filter((transaction) =>
          categoryIdFilter === ignoreCategoryFilterValue
            ? Boolean(transaction.ignored_from_budget)
            : transaction.category_id === categoryIdFilter,
        )
      : formattedRows;
    const isConfirmedTransaction = (transaction) => {
      const source = String(transaction.categorization_source || '').toLowerCase();
      const sourceIsConfirmed =
        source === 'user' || source === 'rule' || source === 'mapped' || source === 'ai';
      return Boolean(transaction.ignored_from_budget) || Boolean(transaction.category_id) || sourceIsConfirmed;
    };

    const confirmedRows = categoryFilteredRows.filter(isConfirmedTransaction);
    const needsReviewRows = categoryFilteredRows.filter((transaction) => !isConfirmedTransaction(transaction));
    const sourceRows =
      reviewTab === 'needs_review'
        ? needsReviewRows
        : reviewTab === 'confirmed'
          ? confirmedRows
          : categoryFilteredRows;
    const totalCount = sourceRows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const pagedRows = sourceRows.slice(startIndex, startIndex + pageSize);

    return res.json({
      transactions:
        monthRange || reviewTab !== 'all' || Boolean(categoryIdFilter) || Boolean(categoryTypeFilter)
          ? pagedRows
          : categoryFilteredRows,
      pagination:
        monthRange || reviewTab !== 'all' || Boolean(categoryIdFilter) || Boolean(categoryTypeFilter)
          ? {
              page: safePage,
              page_size: pageSize,
              total_count: totalCount,
              total_pages: totalPages,
            }
          : undefined,
      counts:
        monthRange || reviewTab !== 'all' || Boolean(categoryIdFilter) || Boolean(categoryTypeFilter)
          ? {
              needs_review: needsReviewRows.length,
              confirmed: confirmedRows.length,
              // Show total transactions in the selected month regardless of
              // category-type/category filters so this matches month-level DB totals.
              total: monthTotalCount,
            }
          : undefined,
    });
  } catch (error) {
    console.error('Transactions error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch transactions',
    });
  }
});

app.post(['/api/ask_chiiz', '/api/ask chiiz', '/api/ask-chiiz'], requireAuth, async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) {
      return res.status(400).json({
        error: 'Question is required.',
      });
    }

    const monthKey = /^\d{4}-\d{2}$/.test(String(req.body?.monthKey || ''))
      ? String(req.body.monthKey)
      : null;
    const accountId =
      req.body?.accountId && String(req.body.accountId) !== 'all'
        ? String(req.body.accountId)
        : null;

    const transactionRows = await fetchAllAskChiizTransactions(req.userId);

    const context = buildAskChiizContext({
      transactions: transactionRows,
      accountId,
    });

    const resolvedCategorySetId = await resolveCategorySetIdForMonth(req.userId, monthKey || null);
    const activeCategories = await fetchCategoriesForUser(req.userId, 'active', resolvedCategorySetId);
    const plannedExpenseBudget = activeCategories
      .filter((category) => category.categoryType === 'expense')
      .reduce((sum, category) => sum + Number(category.budget || 0), 0);

    const budgetSummary = {
      categorySetId: resolvedCategorySetId,
      plannedExpenseBudget,
    };

    const deterministic = deterministicAskChiizAnswer({
      question,
      context,
      budgetSummary,
    });

    let aiAnswer = null;
    try {
      aiAnswer = await requestAskChiizOpenAi({
        question,
        context,
        budgetSummary,
        openAiApiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL,
      });
    } catch (error) {
      console.error('Ask Chiiz OpenAI fallback:', error.message || error);
    }

    return res.json({
      answer: aiAnswer || deterministic.answer,
      highlights: deterministic.highlights || null,
      followUps: deterministic.followUps || [],
      context: {
        monthKey: context.monthKey,
        accountLabel: context.accountLabel,
        transactionCount: context.transactionCount,
      },
    });
  } catch (error) {
    console.error('Ask Chiiz failed:', error.details || error.message);
    return res.status(error.statusCode || 500).json({
      error: 'Failed to process Ask Chiiz request.',
    });
  }
});

app.get('/api/item', requireAuth, async (req, res) => {
  try {
    const items = await fetchLinkedAccountsForUser(req.userId);
    return res.json({
      items,
    });
  } catch (error) {
    console.error('Item error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch linked items',
    });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  return sendPlaidError(res, 'Unhandled server error', err);
});

app.get(/^(?!\/api).*/, (req, res) => {
  if (!hasClientBuild) {
    return res.status(503).send(
      'Frontend build not found. Run "npm run build" for production or "npm run dev:client" during development.',
    );
  }

  return res.sendFile(path.join(distDir, 'index.html'));
});

if (require.main === module) {
  app.listen(3000, () => {
    console.log(`Server running on http://localhost:3000 (boot ${SERVER_BOOT_ID})`);
    console.log('Plaid sync uses stored encrypted access tokens and transactions/sync cursors.');
    console.log('TODO: add webhook-triggered sync and persisted item health tracking for production.');
  });
}

module.exports = app;
