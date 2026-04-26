export type View = 'dashboard' | 'categories' | 'transactions' | 'performance' | 'settings' | 'upload';

export type AuthUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  created_at: string;
};

export type Category = {
  id: string;
  budgetId?: string | null;
  categorySetId?: string | null;
  name: string;
  description?: string | null;
  budget: number;
  actual: number;
  categoryType: 'income' | 'expense';
  source: 'user' | 'ai';
  status: 'active' | 'suggested' | 'archived';
  suggestionRationale?: string | null;
  acceptedAt?: string | null;
  createdAt?: string;
};

export type Budget = {
  id: string;
  name: string;
  isDefault: boolean;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type BudgetMonthAssignment = {
  id: string;
  budgetId: string;
  monthKey: string;
};

// Backward-compatible aliases during transition.
export type CategorySet = Budget;
export type CategorySetMonthAssignment = BudgetMonthAssignment;

export type SummaryMetric = {
  label: string;
  value: string;
  change: string;
};

export type PlaidDebug = {
  server_boot_id?: string;
  plaid_env: string;
  app_base_url?: string | null;
  is_localhost?: boolean;
  products?: string[];
  country_codes?: string[];
  linked_item_count?: number;
};

export type PlaidTransaction = {
  id: string;
  transaction_id: string;
  name?: string | null;
  transaction_name?: string | null;
  merchant_name?: string | null;
  institution_name?: string | null;
  account_name?: string | null;
  account_type?: string | null;
  plaid_account_id?: string | null;
  location_city?: string | null;
  location_region?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_type?: 'income' | 'expense' | null;
  categorization_source?: 'ai' | 'rule' | 'mapped' | 'user' | 'needs_review' | null;
  categorization_confidence?: number | null;
  categorization_reason?: string | null;
  categorized_at?: string | null;
  ignored_from_budget?: boolean;
  amount: number;
  date: string;
  iso_currency_code?: string | null;
  counterparties?: Array<{
    logo_url?: string | null;
    name?: string | null;
  }>;
};

export type PlaidTransactionsResponse = {
  transactions: PlaidTransaction[];
  pagination?: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
  counts?: {
    needs_review: number;
    confirmed: number;
    total: number;
  };
};

export type LinkedAccount = {
  id: string;
  plaid_account_id: string;
  account_name: string | null;
  account_type: string | null;
  institution_name?: string | null;
  created_at: string;
};

export type LinkedPlaidItem = {
  id: string;
  plaid_item_id: string;
  institution_name: string | null;
  created_at: string;
  last_cursor: string | null;
  status: 'healthy' | 'pending_initial_sync' | 'repair_required' | 'sync_error';
  status_message: string | null;
  accounts: LinkedAccount[];
};

export type HistoricalUploadMonth = {
  id: string;
  monthKey: string;
  income: number;
  spending: number;
  categoryCount: number;
  source: 'csv' | 'manual';
};

export type UnifiedMonthlyCategoryAmount = {
  monthKey: string;
  categoryId: string;
  categoryName: string;
  categoryType: 'income' | 'expense';
  amount: number;
  sourceUsed: 'historical_upload' | 'transactions';
};

export type SyncIssue = {
  plaid_item_id: string;
  institution_name: string | null;
  message: string;
  code?: string | null;
  request_id?: string | null;
  requires_relink?: boolean;
};

export type SyncSummary = {
  total_items: number;
  synced_items: Array<{
    plaid_item_id: string;
    institution_name: string | null;
    accounts_synced: number;
    transactions_added: number;
    transactions_modified: number;
    transactions_removed: number;
    next_cursor: string | null;
    status: string;
  }>;
  failed_items: SyncIssue[];
};

export type CategorySuggestion = {
  id: string;
  userId: string | null;
  name: string;
  categoryType: 'income' | 'expense';
  isDefault: boolean;
  createdAt: string;
};
