import type { UnifiedMonthlyCategoryAmount } from '../types';

export const GAMBLING_EXPENSE_CATEGORY_NAME = 'Gambling (Expense)';
export const GAMBLING_WINNINGS_CATEGORY_NAME = 'Gambling (Income)';
export const GAMBLING_WINNING_CATEGORY_LEGACY_NAME = 'Gambling Winning';
export const GAMBLING_WINNINGS_CATEGORY_ALT_NAME = 'Gambling Winnings';
export const GAMBLING_EXPENSE_CATEGORY_ALT_NAME = 'Gambling Expense';
export const GAMBLING_EXPENSE_CATEGORY_LEGACY_NAME = 'Gambling';

type NetResult = {
  expenseDisplayAmount: number;
  winningsDisplayAmount: number;
};

function normalizeAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCategoryName(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function isGamblingExpenseCategoryName(value: string) {
  const normalized = normalizeCategoryName(value);
  return (
    normalized === normalizeCategoryName(GAMBLING_EXPENSE_CATEGORY_NAME) ||
    normalized === normalizeCategoryName(GAMBLING_EXPENSE_CATEGORY_ALT_NAME) ||
    normalized === normalizeCategoryName(GAMBLING_EXPENSE_CATEGORY_LEGACY_NAME)
  );
}

export function isGamblingWinningsCategoryName(value: string) {
  const normalized = normalizeCategoryName(value);
  return (
    normalized === normalizeCategoryName(GAMBLING_WINNINGS_CATEGORY_NAME) ||
    normalized === normalizeCategoryName(GAMBLING_WINNINGS_CATEGORY_ALT_NAME) ||
    normalized === normalizeCategoryName(GAMBLING_WINNING_CATEGORY_LEGACY_NAME)
  );
}

// Special monthly-only logic:
// Net Gambling (Expense) against Gambling (Income) for each month.
export function getMonthlyGamblingNetAmounts(
  gamblingExpenseTotal: number,
  gamblingWinningsTotal: number,
): NetResult {
  const net = gamblingWinningsTotal - gamblingExpenseTotal;

  if (net > 0) {
    return { expenseDisplayAmount: 0, winningsDisplayAmount: net };
  }
  if (net < 0) {
    return { expenseDisplayAmount: Math.abs(net), winningsDisplayAmount: 0 };
  }
  return { expenseDisplayAmount: 0, winningsDisplayAmount: 0 };
}

export function applyGamblingMonthlyNetting(
  rows: UnifiedMonthlyCategoryAmount[],
): UnifiedMonthlyCategoryAmount[] {
  if (!rows.length) {
    return rows;
  }

  const nextRows = rows.map((row) => ({ ...row }));
  const monthIndex = new Map<
    string,
    {
      expenseIndexes: number[];
      winningsIndexes: number[];
      expenseTotal: number;
      winningsTotal: number;
    }
  >();

  for (let index = 0; index < nextRows.length; index += 1) {
    const row = nextRows[index];
    if (!monthIndex.has(row.monthKey)) {
      monthIndex.set(row.monthKey, {
        expenseIndexes: [],
        winningsIndexes: [],
        expenseTotal: 0,
        winningsTotal: 0,
      });
    }

    const entry = monthIndex.get(row.monthKey)!;
    if (row.categoryType === 'expense' && isGamblingExpenseCategoryName(row.categoryName)) {
      entry.expenseIndexes.push(index);
      entry.expenseTotal += normalizeAmount(row.amount);
    } else if (row.categoryType === 'income' && isGamblingWinningsCategoryName(row.categoryName)) {
      entry.winningsIndexes.push(index);
      entry.winningsTotal += normalizeAmount(row.amount);
    }
  }

  for (const entry of monthIndex.values()) {
    if (!entry.expenseIndexes.length && !entry.winningsIndexes.length) {
      continue;
    }

    const net = getMonthlyGamblingNetAmounts(entry.expenseTotal, entry.winningsTotal);

    for (const index of entry.expenseIndexes) {
      nextRows[index].amount = 0;
    }
    for (const index of entry.winningsIndexes) {
      nextRows[index].amount = 0;
    }

    if (entry.expenseIndexes.length > 0) {
      nextRows[entry.expenseIndexes[0]].amount = net.expenseDisplayAmount;
    }
    if (entry.winningsIndexes.length > 0) {
      nextRows[entry.winningsIndexes[0]].amount = net.winningsDisplayAmount;
    }
  }

  return nextRows;
}

// Test cases requested for monthly netting behavior:
export const GAMBLING_MONTHLY_NETTING_TEST_CASES = [
  {
    name: 'A: winnings > expenses',
    expense: 100,
    winnings: 125,
    expectedExpenseDisplay: 0,
    expectedWinningsDisplay: 25,
  },
  {
    name: 'B: winnings < expenses',
    expense: 100,
    winnings: 90,
    expectedExpenseDisplay: 10,
    expectedWinningsDisplay: 0,
  },
  {
    name: 'C: winnings = expenses',
    expense: 100,
    winnings: 100,
    expectedExpenseDisplay: 0,
    expectedWinningsDisplay: 0,
  },
] as const;
