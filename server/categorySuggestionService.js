const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

const CATEGORY_ALIASES = new Map([
  ['grocery', 'Groceries'],
  ['groceries', 'Groceries'],
  ['supermarket', 'Groceries'],
  ['restaurant', 'Dining'],
  ['restaurants', 'Dining'],
  ['dining out', 'Dining'],
  ['food', 'Dining'],
  ['food & dining', 'Dining'],
  ['transport', 'Transportation'],
  ['transportation', 'Transportation'],
  ['transit', 'Transportation'],
  ['rideshare', 'Transportation'],
  ['ride share', 'Transportation'],
  ['gas', 'Transportation'],
  ['fuel', 'Transportation'],
  ['shopping', 'Shopping'],
  ['retail', 'Shopping'],
  ['entertainment', 'Entertainment'],
  ['subscriptions', 'Subscriptions'],
  ['subscription', 'Subscriptions'],
  ['utilities', 'Bills & Utilities'],
  ['bills', 'Bills & Utilities'],
  ['bills & utilities', 'Bills & Utilities'],
  ['housing', 'Housing'],
  ['rent', 'Housing'],
  ['mortgage', 'Housing'],
  ['travel', 'Travel'],
  ['health', 'Health'],
  ['healthcare', 'Health'],
  ['medical', 'Health'],
  ['income', 'Income'],
  ['payroll', 'Income'],
  ['salary', 'Income'],
  ['transfers', 'Transfers'],
  ['transfer', 'Transfers'],
]);

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCategoryName(value) {
  const key = normalizeKey(value);

  if (!key) {
    return '';
  }

  if (CATEGORY_ALIASES.has(key)) {
    return CATEGORY_ALIASES.get(key);
  }

  for (const [alias, canonical] of CATEGORY_ALIASES.entries()) {
    if (key.includes(alias)) {
      return canonical;
    }
  }

  return titleCase(key);
}

function inferCategoryType(name, suggestedType) {
  const normalizedType = String(suggestedType || '').toLowerCase();
  if (normalizedType === 'income' || normalizedType === 'expense') {
    return normalizedType;
  }

  const normalizedName = normalizeCategoryName(name).toLowerCase();
  return normalizedName === 'income' ? 'income' : 'expense';
}

function summarizeTransactions(transactions) {
  const merchantMap = new Map();

  for (const transaction of transactions) {
    const merchant = transaction.merchant_name || 'Unknown merchant';
    const key = normalizeKey(merchant);
    const current = merchantMap.get(key) || {
      merchant_name: merchant,
      count: 0,
      total_amount: 0,
      average_amount: 0,
      recent_examples: [],
    };

    current.count += 1;
    current.total_amount += Number(transaction.amount || 0);
    current.average_amount = current.total_amount / current.count;

    if (current.recent_examples.length < 3) {
      current.recent_examples.push({
        amount: Number(transaction.amount || 0),
        date: transaction.date,
        institution_name: transaction.institution_name || null,
      });
    }

    merchantMap.set(key, current);
  }

  return Array.from(merchantMap.values())
    .sort((a, b) => b.count - a.count || b.total_amount - a.total_amount)
    .slice(0, 40);
}

function heuristicSuggestions(summary, existingNames) {
  const textBlob = summary
    .map((item) => item.merchant_name)
    .join(' ')
    .toLowerCase();

  const candidates = [
    {
      match: /(whole foods|trader joe|costco|target|safeway|vons|grocery|market)/,
      name: 'Groceries',
      description: 'Everyday supermarket and grocery spending',
      categoryType: 'expense',
    },
    {
      match: /(restaurant|coffee|cafe|chipotle|doordash|uber eats|grubhub|dining|food)/,
      name: 'Dining',
      description: 'Restaurants, cafes, and food delivery',
      categoryType: 'expense',
    },
    {
      match: /(uber|lyft|shell|chevron|exxon|transit|gas|fuel|parking)/,
      name: 'Transportation',
      description: 'Gas, rideshare, transit, and transportation costs',
      categoryType: 'expense',
    },
    {
      match: /(netflix|spotify|apple|hulu|subscription|adobe)/,
      name: 'Subscriptions',
      description: 'Recurring digital subscriptions and memberships',
      categoryType: 'expense',
    },
    {
      match: /(rent|mortgage|property)/,
      name: 'Housing',
      description: 'Rent, mortgage, and other housing costs',
      categoryType: 'expense',
    },
    {
      match: /(salary|payroll|deposit|direct deposit)/,
      name: 'Income',
      description: 'Paychecks and other regular income deposits',
      categoryType: 'income',
    },
  ];

  return candidates
    .filter((candidate) => candidate.match.test(textBlob))
    .filter((candidate) => !existingNames.has(normalizeKey(candidate.name)))
    .slice(0, 8);
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

function sanitizeSuggestions(rawSuggestions, existingNames) {
  const suggestions = [];
  const seenNames = new Set(existingNames);

  for (const suggestion of rawSuggestions || []) {
    const name = normalizeCategoryName(suggestion.name);
    const key = normalizeKey(name);

    if (!name || seenNames.has(key)) {
      continue;
    }

    seenNames.add(key);
    suggestions.push({
      name,
      description: String(suggestion.description || '').trim() || null,
      categoryType: inferCategoryType(name, suggestion.categoryType),
      rationale: String(suggestion.rationale || '').trim() || null,
    });
  }

  return suggestions.slice(0, 12);
}

async function generateCategorySuggestions({
  transactions,
  existingCategoryNames,
  openAiApiKey,
  model,
}) {
  const summary = summarizeTransactions(transactions);
  const normalizedExistingNames = new Set(existingCategoryNames.map(normalizeKey));

  if (!summary.length) {
    return [];
  }

  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY is missing on the server.');
  }

  const promptPayload = {
    existingCategories: existingCategoryNames,
    topMerchants: summary,
    instruction:
      'Suggest 6 to 12 broad, consumer-friendly budget categories for a budgeting app. Avoid duplicates and near-duplicates. Prefer broad categories like Groceries, Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Travel, Health, Income, Transfers, Subscriptions, and Housing unless the transaction summary strongly suggests otherwise.',
  };

  const response = await fetch(OPENAI_API_URL, {
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
                'You help a personal budgeting app create a small, useful list of budget categories. Return stable, broad, consumer-friendly categories only. Avoid redundant categories such as Food and Dining together unless clearly justified. Prefer intuitive names.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(promptPayload),
            },
          ],
        },
      ],
      max_output_tokens: 1200,
      text: {
        format: {
          type: 'json_schema',
          name: 'budget_category_suggestions',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              suggestedCategories: {
                type: 'array',
                minItems: 1,
                maxItems: 12,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    categoryType: { type: 'string', enum: ['income', 'expense'] },
                    rationale: { type: 'string' },
                  },
                  required: ['name', 'description', 'categoryType', 'rationale'],
                },
              },
            },
            required: ['suggestedCategories'],
          },
        },
      },
    }),
  });

  const responseJson = await response.json();

  if (!response.ok) {
    const errorMessage =
      responseJson?.error?.message ||
      responseJson?.message ||
      'OpenAI category suggestion request failed.';
    throw new Error(errorMessage);
  }

  const parsed = JSON.parse(extractTextOutput(responseJson) || '{}');
  const suggestions = sanitizeSuggestions(parsed.suggestedCategories, normalizedExistingNames);

  if (suggestions.length > 0) {
    return suggestions;
  }

  return heuristicSuggestions(summary, normalizedExistingNames);
}

module.exports = {
  generateCategorySuggestions,
  normalizeCategoryName,
  normalizeKey,
};
