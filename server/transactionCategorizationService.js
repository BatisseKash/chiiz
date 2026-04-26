const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

const FALLBACK_REVIEW = 'Needs Review';

const CATEGORY_HINTS = [
  { name: 'Groceries', keywords: ['grocery', 'market', 'supermarket', 'albertsons', 'whole foods', 'safeway', 'vons', 'trader joe', 'costco'] },
  { name: 'Dining', keywords: ['restaurant', 'coffee', 'cafe', 'starbucks', 'doordash', 'grubhub', 'ubereats', 'chipotle', 'mcdonald', 'food'] },
  { name: 'Transportation', keywords: ['shell', 'chevron', 'exxon', 'uber', 'lyft', 'transit', 'gas', 'fuel', 'parking'] },
  { name: 'Subscriptions', keywords: ['netflix', 'spotify', 'subscription', 'adobe', 'apple.com/bill', 'hulu', 'disney'] },
  { name: 'Bills & Utilities', keywords: ['utility', 'electric', 'water', 'internet', 'cell', 'verizon', 'at&t', 'comcast', 'xfinity'] },
  { name: 'Shopping', keywords: ['amazon', 'target', 'walmart', 'nike', 'shop', 'retail'] },
  { name: 'Entertainment', keywords: ['movie', 'theater', 'concert', 'entertainment'] },
  { name: 'Housing', keywords: ['rent', 'mortgage', 'property'] },
  { name: 'Travel', keywords: ['airlines', 'hotel', 'delta', 'united', 'travel', 'airbnb'] },
  { name: 'Health', keywords: ['pharmacy', 'cvs', 'walgreens', 'medical', 'health', 'doctor'] },
  { name: 'Income', keywords: ['payroll', 'salary', 'direct deposit', 'paycheck', 'income'] },
  { name: 'Transfers', keywords: ['transfer', 'payment', 'credit card payment', 'venmo cashout', 'zelle'] },
];

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickCategoryByName(categories, desiredName) {
  const target = normalizeKey(desiredName);
  return categories.find((category) => normalizeKey(category.category_name) === target) || null;
}

function normalizeMerchantName(transaction) {
  return normalizeKey(
    transaction.merchant_name ||
      transaction.transaction_name ||
      transaction.name ||
      '',
  );
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

function deterministicCategoryForTransaction(transaction, categories) {
  const normalizedMerchant = normalizeMerchantName(transaction);
  const descriptor = [
    transaction.transaction_name,
    transaction.merchant_name,
    transaction.plaid_category_primary,
    transaction.plaid_category_detailed,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const incomeCategory = pickCategoryByName(categories, 'Income');
  const transferCategory = pickCategoryByName(categories, 'Transfers');

  if (Number(transaction.amount || 0) < 0 && incomeCategory) {
    return {
      category: incomeCategory,
      source: 'rule',
      confidence: 0.98,
      reason: 'Negative amount indicates an inflow and maps to Income.',
    };
  }

  if (
    transferCategory &&
    /(transfer|credit card payment|payment thank you|online payment|zelle|venmo)/.test(descriptor)
  ) {
    return {
      category: transferCategory,
      source: 'rule',
      confidence: 0.92,
      reason: 'Transaction descriptor strongly suggests a transfer or account payment.',
    };
  }

  for (const hint of CATEGORY_HINTS) {
    const category = pickCategoryByName(categories, hint.name);
    if (!category) {
      continue;
    }

    if (hint.keywords.some((keyword) => normalizedMerchant.includes(normalizeKey(keyword)) || descriptor.includes(normalizeKey(keyword)))) {
      return {
        category,
        source: 'rule',
        confidence: 0.86,
        reason: `Merchant patterns closely match ${hint.name}.`,
      };
    }
  }

  return null;
}

async function requestOpenAiBatch({
  openAiApiKey,
  model,
  categories,
  transactions,
}) {
  const payload = {
    categories: categories.map((category) => ({
      name: category.category_name,
      type: category.category_type,
      description: category.description || null,
    })),
    transactions: transactions.map((transaction) => ({
      transactionId: transaction.id,
      merchantName: transaction.merchant_name,
      transactionName: transaction.transaction_name,
      amount: Number(transaction.amount || 0),
      plaidCategoryPrimary: transaction.plaid_category_primary || null,
      plaidCategoryDetailed: transaction.plaid_category_detailed || null,
      accountType: transaction.account?.account_type || null,
      institutionName: transaction.institution_name || null,
    })),
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
                'Classify each transaction into exactly one of the provided accepted user categories. Never invent new categories. If none fit with confidence, return "Needs Review". Prefer stable, intuitive consumer budgeting choices. Use merchant names and descriptors heavily.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(payload),
            },
          ],
        },
      ],
      max_output_tokens: 2200,
      text: {
        format: {
          type: 'json_schema',
          name: 'transaction_categorization_batch',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    transactionId: { type: 'string' },
                    categoryName: { type: 'string' },
                    confidence: { type: 'number' },
                    reason: { type: 'string' },
                  },
                  required: ['transactionId', 'categoryName', 'confidence', 'reason'],
                },
              },
            },
            required: ['results'],
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
      'OpenAI transaction categorization request failed.';
    throw new Error(errorMessage);
  }

  return JSON.parse(extractTextOutput(responseJson) || '{}');
}

function createTransactionCategorizationService({
  supabaseRequest,
  openAiApiKey,
  openAiModel,
}) {
  async function fetchActiveCategories(userId) {
    const params = new URLSearchParams({
      select: 'id,category_name,description,category_type,status',
      user_id: `eq.${userId}`,
      status: 'eq.active',
      order: 'created_at.asc',
    });

    return supabaseRequest(`/rest/v1/categories?${params.toString()}`, {
      method: 'GET',
    });
  }

  async function fetchMerchantMappings(userId) {
    const params = new URLSearchParams({
      select: 'id,normalized_merchant_name,category_id,source,usage_count',
      user_id: `eq.${userId}`,
    });

    return supabaseRequest(`/rest/v1/merchant_category_mappings?${params.toString()}`, {
      method: 'GET',
    });
  }

  async function fetchTransactionsForCategorization(userId, onlyUncategorized = true) {
    const params = new URLSearchParams({
      select:
        'id,plaid_transaction_id,merchant_name,transaction_name,normalized_merchant_name,amount,date,institution_name,plaid_category_primary,plaid_category_detailed,category_id,categorization_source,ignored_from_budget,account:accounts(account_type)',
      user_id: `eq.${userId}`,
      ignored_from_budget: 'is.false',
      order: 'date.desc,created_at.desc',
      limit: '250',
    });

    if (onlyUncategorized) {
      params.set('category_id', 'is.null');
    }

    return supabaseRequest(`/rest/v1/transactions?${params.toString()}`, {
      method: 'GET',
    });
  }

  async function updateTransactionAssignment(userId, transactionId, payload) {
    const params = new URLSearchParams({
      id: `eq.${transactionId}`,
      user_id: `eq.${userId}`,
    });

    await supabaseRequest(`/rest/v1/transactions?${params.toString()}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
  }

  async function upsertMerchantMapping(
    userId,
    normalizedMerchantName,
    categoryId,
    source,
    mappingByMerchant,
  ) {
    if (!normalizedMerchantName || !categoryId) {
      return;
    }

    const current = mappingByMerchant.get(normalizedMerchantName);
    const nextUsageCount = Number(current?.usage_count || 0) + 1;
    const params = new URLSearchParams({
      on_conflict: 'user_id,normalized_merchant_name',
    });

    const rows = await supabaseRequest(
      `/rest/v1/merchant_category_mappings?${params.toString()}`,
      {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([
        {
          id: current?.id,
          user_id: userId,
          normalized_merchant_name: normalizedMerchantName,
          category_id: categoryId,
          source,
          usage_count: nextUsageCount,
          updated_at: new Date().toISOString(),
        },
      ]),
      },
    );

    const saved = rows?.[0];
    mappingByMerchant.set(normalizedMerchantName, {
      id: saved?.id || current?.id || null,
      normalized_merchant_name: normalizedMerchantName,
      category_id: categoryId,
      source,
      usage_count: Number(saved?.usage_count || nextUsageCount),
    });
  }

  async function categorizeTransactions({
    userId,
    onlyUncategorized = true,
  }) {
    const [activeCategories, mappings, transactions] = await Promise.all([
      fetchActiveCategories(userId),
      fetchMerchantMappings(userId),
      fetchTransactionsForCategorization(userId, onlyUncategorized),
    ]);

    if (!activeCategories.length) {
      return {
        categorizedCount: 0,
        needsReviewCount: 0,
        skippedCount: transactions.length,
        totalConsidered: transactions.length,
        skippedReason: 'No accepted categories available.',
      };
    }

    if (!transactions.length) {
      return {
        categorizedCount: 0,
        needsReviewCount: 0,
        skippedCount: 0,
        totalConsidered: 0,
      };
    }

    const mappingByMerchant = new Map(
      mappings.map((mapping) => [mapping.normalized_merchant_name, mapping]),
    );
    const categoryById = new Map(activeCategories.map((category) => [category.id, category]));

    let skippedCount = 0;
    const assigned = [];
    const gptCandidates = [];

    for (const transaction of transactions) {
      if (transaction.categorization_source === 'user') {
        skippedCount += 1;
        continue;
      }

      const normalizedMerchantName =
        transaction.normalized_merchant_name || normalizeMerchantName(transaction);

      const mapping = mappingByMerchant.get(normalizedMerchantName);
      if (mapping && categoryById.has(mapping.category_id)) {
        assigned.push({
          transactionId: transaction.id,
          normalizedMerchantName,
          categoryId: mapping.category_id,
          source: 'mapped',
          confidence: 0.97,
          reason: 'Matched an existing merchant mapping.',
        });
        continue;
      }

      const deterministic = deterministicCategoryForTransaction(transaction, activeCategories);
      if (deterministic) {
        assigned.push({
          transactionId: transaction.id,
          normalizedMerchantName,
          categoryId: deterministic.category.id,
          source: deterministic.source,
          confidence: deterministic.confidence,
          reason: deterministic.reason,
        });
        continue;
      }

      gptCandidates.push({
        ...transaction,
        normalized_merchant_name: normalizedMerchantName,
      });
    }

    const gptAssignments = [];

    if (gptCandidates.length && openAiApiKey) {
      for (const group of chunk(gptCandidates, 25)) {
        const result = await requestOpenAiBatch({
          openAiApiKey,
          model: openAiModel,
          categories: activeCategories,
          transactions: group,
        });

        for (const entry of result.results || []) {
          const transaction = group.find((candidate) => candidate.id === entry.transactionId);
          if (!transaction) {
            continue;
          }

          const category =
            entry.categoryName === FALLBACK_REVIEW
              ? null
              : pickCategoryByName(activeCategories, entry.categoryName);

          gptAssignments.push({
            transactionId: transaction.id,
            normalizedMerchantName: transaction.normalized_merchant_name,
            categoryId: category?.id || null,
            source: category ? 'ai' : 'needs_review',
            confidence: Number(entry.confidence || 0),
            reason: entry.reason || null,
          });
        }
      }
    } else {
      for (const transaction of gptCandidates) {
        gptAssignments.push({
          transactionId: transaction.id,
          normalizedMerchantName: transaction.normalized_merchant_name,
          categoryId: null,
          source: 'needs_review',
          confidence: 0,
          reason: 'No reliable rule or mapping was available.',
        });
      }
    }

    const allAssignments = [...assigned, ...gptAssignments];

    let categorizedCount = 0;
    let needsReviewCount = 0;

    for (const assignment of allAssignments) {
      await updateTransactionAssignment(userId, assignment.transactionId, {
        category_id: assignment.categoryId,
        categorization_source: assignment.source,
        categorization_confidence: assignment.confidence,
        categorization_reason: assignment.reason,
        categorized_at: new Date().toISOString(),
      });

      if (assignment.categoryId) {
        categorizedCount += 1;
        if (assignment.normalizedMerchantName && assignment.source !== 'needs_review') {
          try {
            await upsertMerchantMapping(
              userId,
              assignment.normalizedMerchantName,
              assignment.categoryId,
              assignment.source === 'user'
                ? 'user'
                : assignment.source === 'rule'
                  ? 'rule'
                  : 'ai',
              mappingByMerchant,
            );
          } catch (error) {
            console.error(
              'Merchant mapping upsert failed during categorization:',
              error.details || error.message,
            );
          }
        }
      } else {
        needsReviewCount += 1;
      }
    }

      return {
        categorizedCount,
        needsReviewCount,
        skippedCount,
        totalConsidered: transactions.length,
      };
  }

  async function overrideTransactionCategory({
    userId,
    transactionId,
    categoryId,
    ignored,
  }) {
    const activeCategories = ignored ? [] : await fetchActiveCategories(userId);
    const targetCategory = !ignored && categoryId
      ? activeCategories.find((category) => category.id === categoryId)
      : null;

    if (!ignored && categoryId && !targetCategory) {
      const error = new Error('Selected category does not exist.');
      error.statusCode = 400;
      throw error;
    }

    const transactionParams = new URLSearchParams({
      select: 'id,merchant_name,transaction_name,normalized_merchant_name',
      id: `eq.${transactionId}`,
      user_id: `eq.${userId}`,
      limit: '1',
    });

    const rows = await supabaseRequest(`/rest/v1/transactions?${transactionParams.toString()}`, {
      method: 'GET',
    });

    const transaction = rows[0];
    if (!transaction) {
      const error = new Error('Transaction not found.');
      error.statusCode = 404;
      throw error;
    }

    const normalizedMerchantName =
      transaction.normalized_merchant_name || normalizeMerchantName(transaction);

    const payload = ignored
      ? {
          category_id: null,
          ignored_from_budget: true,
          categorization_source: 'user',
          categorization_confidence: 1,
          categorization_reason: 'Ignored by the user for budget calculations.',
          categorized_at: new Date().toISOString(),
          normalized_merchant_name: normalizedMerchantName,
        }
      : {
          category_id: categoryId || null,
          ignored_from_budget: false,
          categorization_source: categoryId ? 'user' : 'needs_review',
          categorization_confidence: categoryId ? 1 : 0,
          categorization_reason: categoryId
            ? 'Manually assigned by the user.'
            : 'Marked for manual review by the user.',
          categorized_at: new Date().toISOString(),
          normalized_merchant_name: normalizedMerchantName,
        };

    await updateTransactionAssignment(userId, transactionId, payload);

    if (!ignored && categoryId && normalizedMerchantName) {
      const mappingByMerchant = new Map(
        (await fetchMerchantMappings(userId)).map((mapping) => [
          mapping.normalized_merchant_name,
          mapping,
        ]),
      );
      await upsertMerchantMapping(
        userId,
        normalizedMerchantName,
        categoryId,
        'user',
        mappingByMerchant,
      );
    }
  }

  return {
    categorizeTransactions,
    overrideTransactionCategory,
  };
}

module.exports = {
  createTransactionCategorizationService,
  normalizeMerchantName,
};
