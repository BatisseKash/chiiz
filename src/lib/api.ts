import type {
  AuthUser,
  Budget,
  BudgetMonthAssignment,
  Category,
  CategorySuggestion,
  HistoricalUploadMonth,
  UnifiedMonthlyCategoryAmount,
  LinkedAccount,
  LinkedPlaidItem,
  PlaidDebug,
  PlaidTransactionsResponse,
  SyncSummary,
} from '../types';

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (
          publicToken: string,
          metadata: {
            institution?: {
              name?: string | null;
            } | null;
          },
        ) => void | Promise<void>;
        onExit?: (error: unknown, metadata: unknown) => void;
      }) => { open: () => void };
    };
  }
}

type ApiErrorResponse = {
  error?: string;
  message?: string;
  details?: {
    error_message?: string;
    error_code?: string | null;
    request_id?: string | null;
    validationErrors?: string[];
    validationErrorCount?: number;
  };
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  const data = contentType.includes('application/json') && raw
    ? (JSON.parse(raw) as T | ApiErrorResponse)
    : null;

  if (!response.ok) {
    const error = data as ApiErrorResponse | null;
    const parts = [
      error?.error,
      error?.details?.error_message,
      error?.details?.error_code ? `Code: ${error.details.error_code}` : null,
      error?.details?.request_id ? `Request ID: ${error.details.request_id}` : null,
      !contentType.includes('application/json')
        ? `Received ${response.status} ${response.statusText} from ${url}. This usually means the server needs to be restarted onto the latest routes.`
        : null,
    ].filter(Boolean);

    throw new Error(parts.join(' • ') || 'Request failed');
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from ${url} but received ${contentType || 'an unknown response type'}.`);
  }

  return data as T;
}

export const fetchDebug = () => request<PlaidDebug>('/api/debug');
export const fetchCategories = (budgetId?: string) =>
  request<{
    activeCategories: Category[];
    suggestedCategories: Category[];
    resolvedBudgetId?: string | null;
    resolvedSetId?: string | null;
  }>(
    budgetId ? `/api/categories?budget_id=${encodeURIComponent(budgetId)}` : '/api/categories',
  );
export const fetchBudgets = () =>
  request<{
    budgets: Budget[];
    budgetMonthAssignments: BudgetMonthAssignment[];
    resolvedBudgetId: string | null;
    categorySets?: Budget[];
    monthAssignments?: BudgetMonthAssignment[];
    resolvedSetId?: string | null;
  }>('/api/budgets');
export const createBudget = (payload: { name: string; isDefault?: boolean }) =>
  request<{ budget: Budget; categorySet?: Budget }>('/api/budgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
export const updateBudget = (
  budgetId: string,
  payload: Partial<{ name: string; isDefault: boolean; status: 'active' | 'archived' }>,
) =>
  request<{ budget: Budget; categorySet?: Budget }>(`/api/budgets/${budgetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
export const duplicateBudget = (budgetId: string) =>
  request<{ budget: Budget; categorySet?: Budget; duplicatedCategoryCount: number }>(
    `/api/budgets/${budgetId}/duplicate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  );
export const deleteBudget = (budgetId: string) =>
  request<{ success: boolean }>(`/api/budgets/${budgetId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
export const assignBudgetMonths = (budgetId: string, months: string[]) =>
  request<{ assignments: BudgetMonthAssignment[] }>(
    `/api/budgets/${budgetId}/assign_months`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ months }),
    },
  );
export const unassignBudgetMonths = (budgetId: string, months: string[]) =>
  request<{ success: boolean }>(`/api/budgets/${budgetId}/assign_months`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ months }),
  });
export const fetchTransactions = (params?: {
  monthKey?: string;
  page?: number;
  pageSize?: number;
  reviewTab?: 'needs_review' | 'confirmed' | 'all';
  categoryId?: string;
  categoryType?: 'income' | 'expense';
}) => {
  const search = new URLSearchParams();
  if (params?.monthKey) {
    search.set('month', params.monthKey);
  }
  if (typeof params?.page === 'number') {
    search.set('page', String(params.page));
  }
  if (typeof params?.pageSize === 'number') {
    search.set('page_size', String(params.pageSize));
  }
  if (params?.reviewTab) {
    search.set('review_tab', params.reviewTab);
  }
  if (params?.categoryId) {
    search.set('category_id', params.categoryId);
  }
  if (params?.categoryType) {
    search.set('category_type', params.categoryType);
  }
  const qs = search.toString();
  return request<PlaidTransactionsResponse>(`/api/transactions${qs ? `?${qs}` : ''}`);
};
export const fetchAccounts = () =>
  request<{ accounts?: LinkedAccount[] }>('/api/accounts');
export const createManualTransaction = (payload: {
  merchant: string;
  accountId: string;
  transactionType: 'income' | 'expense';
  categoryId?: string | null;
  date: string;
  amount: number;
}) =>
  request<{ transaction: PlaidTransactionsResponse['transactions'][number] }>('/api/transactions/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
export const deleteManualTransaction = (transactionId: string) =>
  request<{ success: boolean }>(`/api/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
export const fetchLinkedAccounts = () =>
  request<{ items: LinkedPlaidItem[]; total_items: number; total_accounts: number }>(
    '/api/linked_accounts',
  );
export const loginUser = (payload: { email: string; password: string }) =>
  request<{ user: AuthUser; sync: SyncSummary }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const signupUser = (payload: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}) =>
  request<{ user: AuthUser; sync: SyncSummary }>('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const requestPasswordReset = (payload: { email: string }) =>
  request<{ success: boolean; message: string; dev_reset_link?: string | null }>(
    '/api/auth/forgot_password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

export const resetPassword = (payload: { token: string; password: string }) =>
  request<{ success: boolean; message: string }>('/api/auth/reset_password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const restoreSession = () => request<{ user: AuthUser }>('/api/auth/session');

export const logoutUser = () =>
  request<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

export const syncLinkedAccounts = () =>
  request<{ success: boolean; sync: SyncSummary; categorization?: { categorizedCount: number; needsReviewCount: number } }>('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

export const categorizeTransactions = (force = false) =>
  request<{
    success: boolean;
    categorization: {
      categorizedCount: number;
      needsReviewCount: number;
      skippedCount: number;
      totalConsidered: number;
      skippedReason?: string;
    };
  }>('/api/transactions/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });

export const overrideTransactionCategory = (
  transactionId: string,
  categoryId: string | null,
  ignored = false,
) =>
  request<{ success: boolean }>(`/api/transactions/${transactionId}/category`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId, ignored }),
  });

export const generateAiCategories = (payload?: { budgetId?: string; categorySetId?: string; month?: string }) =>
  request<{ suggestedCategories: Category[]; generatedCount: number }>(
    '/api/categories/suggestions/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    },
  );

export const acceptSuggestedCategories = (ids: string[]) =>
  request<{ acceptedCategories: Category[]; skippedDuplicates: string[] }>(
    '/api/categories/accept',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    },
  );

export const createCategory = (payload: {
  budgetId?: string;
  categorySetId?: string;
  name: string;
  description?: string | null;
  budget: number;
  categoryType: 'income' | 'expense';
}) =>
  request<{ category: Category }>('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const fetchCategorySuggestions = (params?: {
  categoryType?: 'income' | 'expense';
  query?: string;
  limit?: number;
}) => {
  const search = new URLSearchParams();
  if (params?.categoryType) {
    search.set('categoryType', params.categoryType);
  }
  if (params?.query) {
    search.set('query', params.query);
  }
  if (typeof params?.limit === 'number') {
    search.set('limit', String(params.limit));
  }

  const qs = search.toString();
  return request<{ suggestions: CategorySuggestion[] }>(
    `/api/category_suggestions${qs ? `?${qs}` : ''}`,
  );
};

export const createCustomCategorySuggestion = (payload: {
  name: string;
  categoryType: 'income' | 'expense';
}) =>
  request<{ suggestion: CategorySuggestion; created: boolean }>('/api/category_suggestions/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const askChiiz = (payload: {
  question: string;
  monthKey?: string | null;
  accountId?: string | null;
}) =>
  request<{
    answer: string;
    highlights?: {
      type: 'largest_transaction';
      amount: number;
      categoryName: string;
      merchantName: string;
      date: string;
    } | null;
    followUps?: string[];
    context?: {
      monthKey: string | null;
      accountLabel: string;
      transactionCount: number;
    };
  }>('/api/ask_chiiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// Backward-compatible API aliases during rename.
export const fetchCategorySets = fetchBudgets;
export const createCategorySet = createBudget;
export const updateCategorySet = updateBudget;
export const duplicateCategorySet = duplicateBudget;
export const deleteCategorySet = deleteBudget;
export const assignCategorySetMonths = assignBudgetMonths;
export const unassignCategorySetMonths = unassignBudgetMonths;

export const updateCategory = (
  categoryId: string,
  payload: Partial<{
    name: string;
    description: string | null;
    budget: number;
    categoryType: 'income' | 'expense';
    status: 'active' | 'suggested' | 'archived';
  }>,
) =>
  request<{ category: Category }>(`/api/categories/${categoryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const deleteCategory = (categoryId: string) =>
  request<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

type UploadApiError = Error & {
  validationErrors?: string[];
  validationErrorCount?: number;
};

async function uploadRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

  if (!response.ok) {
    const error = new Error(
      String(data.error || data.message || 'Upload request failed.'),
    ) as UploadApiError;
    const details = (data.details || {}) as {
      validationErrors?: string[];
      validationErrorCount?: number;
    };
    error.validationErrors = Array.isArray(details.validationErrors)
      ? details.validationErrors
      : [];
    error.validationErrorCount = Number(details.validationErrorCount || 0);
    throw error;
  }

  return data as T;
}

export const downloadHistoricalTemplate = async () => {
  const response = await fetch('/api/upload_data/template');
  if (!response.ok) {
    throw new Error('Failed to download template.');
  }

  return response.blob();
};

export const fetchHistoricalUploadMonths = () =>
  request<{ months: HistoricalUploadMonth[] }>('/api/upload_data/months');

export const fetchUnifiedMonthlyCategoryAmounts = () =>
  request<{ rows: UnifiedMonthlyCategoryAmount[] }>('/api/unified_monthly_category_amounts');

export const previewHistoricalUpload = (payload: {
  fileName: string;
  fileContentBase64: string;
}) =>
  uploadRequest<{
    ready: boolean;
    rowsReady: number;
    totalRowsParsed: number;
    monthsDetected: number;
    categoriesDetected: number;
    warning: string | null;
  }>('/api/upload_data/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const importHistoricalUpload = (payload: {
  fileName: string;
  fileContentBase64: string;
}) =>
  uploadRequest<{
    success: boolean;
    warning: string | null;
    rowsImported: number;
    monthsAffected: number;
    categoriesLinked: number;
    categoriesCreated: number;
    totalRowsParsed: number;
    months: HistoricalUploadMonth[];
  }>('/api/upload_data/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

const createLinkToken = () =>
  request<{ link_token: string }>('/api/create_link_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

const exchangePublicToken = (publicToken: string, institutionName?: string | null) =>
  request<{ success: boolean; initial_sync: SyncSummary['synced_items'][number] }>(
    '/api/exchange_token',
    {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      public_token: publicToken,
      institution_name: institutionName || null,
    }),
  },
  );

export async function launchPlaidLink() {
  if (!window.Plaid) {
    throw new Error('Plaid Link failed to load.');
  }

  const token = await createLinkToken();

  return new Promise<{ success: boolean; initial_sync: SyncSummary['synced_items'][number] }>(
    (resolve, reject) => {
    let completed = false;

    const handler = window.Plaid!.create({
      token: token.link_token,
      onSuccess: async (publicToken, metadata) => {
        try {
          const result = await exchangePublicToken(publicToken, metadata?.institution?.name);
          completed = true;
          resolve(result);
        } catch (error) {
          completed = true;
          reject(error);
        }
      },
      onExit: (error) => {
        if (!completed) {
          completed = true;
          reject(
            error instanceof Error
              ? error
              : new Error('Plaid Link exited before completing.'),
          );
        }
      },
    });

    handler.open();
    },
  );
}
