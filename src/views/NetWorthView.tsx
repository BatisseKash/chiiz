import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  addNetWorthHistorySnapshots,
  createManualNetWorthAccount,
  fetchNetWorthAccounts,
  fetchNetWorthHistory,
  fetchNetWorthSummary,
  updateManualNetWorthAccount,
} from '../lib/api';
import type { NetWorthAccount, NetWorthSnapshot, NetWorthSummary } from '../types';

type TabId = 'overview' | 'accounts' | 'history';

type NetWorthViewProps = {
  onOpenLinkedAccounts?: () => void;
};

type ManualAccountFormState = {
  name: string;
  institutionName: string;
  type: 'asset' | 'liability';
  subtype: string;
  balance: string;
  balanceDate: string;
};

type HistoryFormRow = {
  id: string;
  snapshotDate: string;
  totalAssets: string;
  totalLiabilities: string;
  changeAmount: string;
};

const EMPTY_SUMMARY: NetWorthSummary = {
  net_worth: 0,
  total_assets: 0,
  total_liabilities: 0,
  checking_savings: 0,
  investments: 0,
  account_count: 0,
  snapshot_date: new Date().toISOString().slice(0, 10),
  has_balances: false,
};

const assetColors = ['#667EEA', '#8B5CF6', '#F5A623', '#2DCC8F', '#06B6D4', '#A0AEC0'];

const emptyManualAccountForm = (): ManualAccountFormState => ({
  name: '',
  institutionName: '',
  type: 'asset',
  subtype: '',
  balance: '',
  balanceDate: new Date().toISOString().slice(0, 10),
});

const newHistoryFormRow = (): HistoryFormRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  snapshotDate: new Date().toISOString().slice(0, 10),
  totalAssets: '',
  totalLiabilities: '',
  changeAmount: '',
});

function fmt(value: number | null | undefined): string {
  return '$' + Math.round(Number(value || 0)).toLocaleString('en-US');
}

function formatDateLabel(value: string) {
  const [year, month, day = 1] = String(value || '').split('-').map(Number);
  if (!year || !month) {
    return 'Unknown date';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatSnapshotDate(value: string) {
  const [year, month, day = 1] = String(value || '').split('-').map(Number);
  if (!year || !month) {
    return 'Latest sync';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function accountLabel(account: NetWorthAccount) {
  const name = account.name || 'Linked account';
  if (!account.mask || name.includes(account.mask)) {
    return name;
  }
  return `${name} ...${account.mask}`;
}

function accountSubtitle(account: NetWorthAccount) {
  const pieces = [
    account.subtype || account.plaid_type || 'Account',
    account.institution_name || 'Linked institution',
  ];
  return pieces.filter(Boolean).join(' · ');
}

function accountIcon(account: NetWorthAccount) {
  const plaidType = String(account.plaid_type || '').toLowerCase();
  if (account.type === 'liability') {
    return plaidType === 'loan' ? '📋' : '💳';
  }
  if (plaidType === 'investment' || plaidType === 'brokerage') {
    return '📈';
  }
  return '🏦';
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { previousNetWorth?: number | null } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value || 0);
  const previous = payload[0].payload?.previousNetWorth ?? null;
  const change = previous === null ? null : value - previous;
  return (
    <div
      className="rounded-[10px] px-3 py-2.5 text-sm shadow-lg"
      style={{ background: 'var(--color-text-primary)', color: '#fff', fontFamily: 'var(--font-body)' }}
    >
      <p className="font-display text-[15px] font-bold leading-tight">{fmt(value)}</p>
      <p className="mt-0.5 text-[12px] text-[#9090A8]">{label}</p>
      {change !== null ? (
        <p
          className="mt-0.5 text-[11px] font-semibold"
          style={{ color: change >= 0 ? '#6EE7B7' : '#FCA5A5' }}
        >
          {change >= 0 ? '▲ +' : '▼ '}
          {fmt(Math.abs(change))}
        </p>
      ) : null}
    </div>
  );
}

function AccountRow({
  account,
  pct,
  color,
  onEdit,
}: {
  account: NetWorthAccount;
  pct: number;
  color?: string;
  onEdit?: (account: NetWorthAccount) => void;
}) {
  const isLiability = account.type === 'liability';
  const balance = Math.abs(Number(account.balance || 0));
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-b-0 last:pb-0">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-lg"
        style={{
          background: isLiability ? '#FEE2E2' : `${color || 'var(--color-accent)'}22`,
        }}
      >
        {accountIcon(account)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[13.5px] font-semibold text-[var(--color-text-primary)]">
            {accountLabel(account)}
          </p>
          {account.source === 'manual' ? (
            <span className="shrink-0 rounded-full bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-accent-dark)]">
              Manual
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">
          {accountSubtitle(account)}
        </p>
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-[var(--color-border)]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: isLiability ? 'var(--color-negative)' : color || 'var(--color-accent)',
            }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className="font-display text-[14px] font-bold"
          style={{ color: isLiability ? 'var(--color-negative)' : 'var(--color-text-primary)' }}
        >
          {isLiability ? '-' : ''}
          {fmt(balance)}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
          {pct}% of {isLiability ? 'liabilities' : 'assets'}
        </p>
        {account.source === 'manual' && onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(account)}
            className="mt-1 text-[11px] font-semibold text-[var(--color-accent)] transition hover:text-[var(--color-accent-dark)]"
          >
            Update
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NetWorthView({ onOpenLinkedAccounts }: NetWorthViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [summary, setSummary] = useState<NetWorthSummary>(EMPTY_SUMMARY);
  const [accounts, setAccounts] = useState<NetWorthAccount[]>([]);
  const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [editingManualAccount, setEditingManualAccount] = useState<NetWorthAccount | null>(null);
  const [manualForm, setManualForm] = useState<ManualAccountFormState>(() => emptyManualAccountForm());
  const [savingManualAccount, setSavingManualAccount] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyDraftRows, setHistoryDraftRows] = useState<HistoryFormRow[]>(() => [newHistoryFormRow()]);
  const [savingHistoryRows, setSavingHistoryRows] = useState(false);

  const loadNetWorth = async () => {
    const [summaryResult, accountsResult, historyResult] = await Promise.all([
      fetchNetWorthSummary(),
      fetchNetWorthAccounts(),
      fetchNetWorthHistory(),
    ]);
    setSummary(summaryResult);
    setAccounts(accountsResult.accounts || []);
    setHistory(historyResult.snapshots || []);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const [summaryResult, accountsResult, historyResult] = await Promise.all([
          fetchNetWorthSummary(),
          fetchNetWorthAccounts(),
          fetchNetWorthHistory(),
        ]);
        if (cancelled) {
          return;
        }
        setSummary(summaryResult);
        setAccounts(accountsResult.accounts || []);
        setHistory(historyResult.snapshots || []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load net worth.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openManualAccountModal = (account?: NetWorthAccount) => {
    if (account) {
      setEditingManualAccount(account);
      setManualForm({
        name: account.name || '',
        institutionName:
          account.institution_name && account.institution_name !== 'Manual entry'
            ? account.institution_name
            : '',
        type: account.type === 'liability' ? 'liability' : 'asset',
        subtype: account.subtype || '',
        balance:
          account.balance === null || account.balance === undefined
            ? ''
            : String(Math.abs(Number(account.balance || 0))),
        balanceDate: account.balance_date || new Date().toISOString().slice(0, 10),
      });
    } else {
      setEditingManualAccount(null);
      setManualForm(emptyManualAccountForm());
    }
    setManualModalOpen(true);
  };

  const closeManualAccountModal = () => {
    if (savingManualAccount) {
      return;
    }
    setManualModalOpen(false);
    setEditingManualAccount(null);
    setManualForm(emptyManualAccountForm());
  };

  const saveManualAccount = async () => {
    if (!manualForm.name.trim() || !manualForm.balance.trim()) {
      return;
    }

    setSavingManualAccount(true);
    setError(null);
    try {
      const payload = {
        name: manualForm.name.trim(),
        institutionName: manualForm.institutionName.trim() || null,
        type: manualForm.type,
        subtype: manualForm.subtype.trim() || null,
        balance: Number(manualForm.balance),
        balanceDate: manualForm.balanceDate,
      };

      if (editingManualAccount) {
        await updateManualNetWorthAccount(editingManualAccount.id, payload);
      } else {
        await createManualNetWorthAccount(payload);
      }
      await loadNetWorth();
      setManualModalOpen(false);
      setEditingManualAccount(null);
      setManualForm(emptyManualAccountForm());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save manual account.');
    } finally {
      setSavingManualAccount(false);
    }
  };

  const openHistoryModal = () => {
    setHistoryDraftRows([newHistoryFormRow()]);
    setHistoryModalOpen(true);
  };

  const closeHistoryModal = () => {
    if (savingHistoryRows) {
      return;
    }
    setHistoryModalOpen(false);
    setHistoryDraftRows([newHistoryFormRow()]);
  };

  const saveHistoryRows = async () => {
    const preparedRows = historyDraftRows
      .filter((row) => row.snapshotDate.trim() && row.totalAssets.trim())
      .map((row) => ({
        snapshotDate: row.snapshotDate,
        totalAssets: Number(row.totalAssets),
        totalLiabilities: row.totalLiabilities.trim() ? Number(row.totalLiabilities) : null,
        changeAmount: row.changeAmount.trim() ? Number(row.changeAmount) : null,
      }));

    if (!preparedRows.length) {
      return;
    }

    setSavingHistoryRows(true);
    setError(null);
    try {
      await addNetWorthHistorySnapshots({ rows: preparedRows });
      await loadNetWorth();
      setHistoryModalOpen(false);
      setHistoryDraftRows([newHistoryFormRow()]);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Failed to add net worth history.');
    } finally {
      setSavingHistoryRows(false);
    }
  };

  const assets = useMemo(
    () => accounts.filter((account) => account.type === 'asset'),
    [accounts],
  );
  const liabilities = useMemo(
    () => accounts.filter((account) => account.type === 'liability'),
    [accounts],
  );
  const hasBalances = summary.has_balances && accounts.length > 0;

  const chartData = useMemo(() => {
    const rows = history.length
      ? history
      : hasBalances
        ? [
            {
              id: 'current',
              snapshot_date: summary.snapshot_date,
              total_assets: summary.total_assets,
              total_liabilities: summary.total_liabilities,
              net_worth: summary.net_worth,
            },
          ]
        : [];

    return rows.map((row, index) => ({
      month: formatDateLabel(row.snapshot_date),
      netWorth: Number(row.net_worth || 0),
      previousNetWorth: index > 0 ? Number(rows[index - 1].net_worth || 0) : null,
    }));
  }, [hasBalances, history, summary]);

  const historyRows = useMemo(() => {
    const rows = history.length
      ? history
      : hasBalances
        ? [
            {
              id: 'current',
              snapshot_date: summary.snapshot_date,
              total_assets: summary.total_assets,
              total_liabilities: summary.total_liabilities,
              net_worth: summary.net_worth,
            },
          ]
        : [];
    return [...rows].reverse();
  }, [hasBalances, history, summary]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
          Net Worth
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          All your assets and liabilities in one place · {loading ? 'Loading...' : `Updated ${formatSnapshotDate(summary.snapshot_date)}`}
        </p>
      </div>

      {error ? (
        <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !hasBalances ? (
        <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">No Plaid account balances available yet.</p>
          <p className="mt-1 text-amber-800">
            Link bank or investment accounts, or add a manual account to start building your net worth history.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenLinkedAccounts}
              className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
            >
              Go to Linked Accounts
            </button>
            <button
              type="button"
              onClick={() => openManualAccountModal()}
              className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
            >
              Add Manual Account
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5 xl:divide-x xl:divide-y-0">
          <div className="px-6 py-5 xl:px-7">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-primary)]" />
              Net Worth
            </div>
            <p className="mt-2 font-display text-[2.6rem] font-bold leading-none tracking-[-0.04em] text-[var(--color-text-primary)]">
              {fmt(summary.net_worth)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
              As of {formatSnapshotDate(summary.snapshot_date)}
            </p>
          </div>

          <div className="px-6 py-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              Total Assets
            </div>
            <p className="mt-2 font-display text-[1.9rem] font-bold leading-none tracking-[-0.04em] text-[var(--color-accent-dark)]">
              {fmt(summary.total_assets)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
              Across {assets.length} account{assets.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="px-6 py-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-negative)]" />
              Total Liabilities
            </div>
            <p className="mt-2 font-display text-[1.9rem] font-bold leading-none tracking-[-0.04em] text-[var(--color-negative)]">
              -{fmt(summary.total_liabilities)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
              Across {liabilities.length} account{liabilities.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="px-6 py-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#06B6D4' }} />
              Checking &amp; Savings
            </div>
            <p
              className="mt-2 font-display text-[1.9rem] font-bold leading-none tracking-[-0.04em]"
              style={{ color: '#0E9DBB' }}
            >
              {fmt(summary.checking_savings)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">Depository cash balances</p>
          </div>

          <div className="px-6 py-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#667EEA' }} />
              Investments
            </div>
            <p
              className="mt-2 font-display text-[1.9rem] font-bold leading-none tracking-[-0.04em]"
              style={{ color: '#667EEA' }}
            >
              {fmt(summary.investments)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">Investment and brokerage balances</p>
          </div>
        </div>
      </div>

      <div className="flex border-b-2 border-[var(--color-border)]">
        {(['overview', 'accounts', 'history'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-0.5 border-b-2 px-5 py-2.5 text-[13.5px] font-medium capitalize transition-colors duration-150 font-body ${
              activeTab === tab
                ? 'border-[var(--color-accent)] font-bold text-[var(--color-text-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab === 'overview' ? 'Overview' : tab === 'accounts' ? 'Accounts' : 'History'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <p className="font-display text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
              Net Worth Over Time
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">Monthly snapshots for the past 12 months</p>
          </div>
          <div className="p-5">
            {chartData.length ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--color-border)"
                      strokeDasharray="4 3"
                      vertical={false}
                      strokeOpacity={0.8}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'var(--font-body)' }}
                      axisLine={false}
                      tickLine={false}
                      dy={6}
                    />
                    <YAxis
                      tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      domain={['dataMin - 5000', 'dataMax + 5000']}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1.5, strokeDasharray: '4 3' }} />
                    <Area
                      type="monotone"
                      dataKey="netWorth"
                      stroke="var(--color-accent)"
                      strokeWidth={2.5}
                      fill="url(#nwGradient)"
                      dot={false}
                      activeDot={{ r: 5, fill: 'var(--color-accent)', stroke: '#fff', strokeWidth: 2.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                Net worth history will appear after account balances sync.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'accounts' ? (
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              Assets - {fmt(summary.total_assets)} total
            </p>
            <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="px-5 py-1">
                {assets.length ? (
                  assets.map((account, index) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      pct={
                        summary.total_assets > 0
                          ? Math.round((Math.abs(Number(account.balance || 0)) / summary.total_assets) * 1000) / 10
                          : 0
                      }
                      color={assetColors[index % assetColors.length]}
                      onEdit={openManualAccountModal}
                    />
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">No asset accounts synced yet.</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              Liabilities - {fmt(summary.total_liabilities)} total
            </p>
            <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="px-5 py-1">
                {liabilities.length ? (
                  liabilities.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      pct={
                        summary.total_liabilities > 0
                          ? Math.round((Math.abs(Number(account.balance || 0)) / summary.total_liabilities) * 1000) / 10
                          : 0
                      }
                      onEdit={openManualAccountModal}
                    />
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">No liability accounts synced yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenLinkedAccounts}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)] font-body"
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Link another account
            </button>
            <button
              type="button"
              onClick={() => openManualAccountModal()}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)] font-body"
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add manual account
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'history' ? (
        <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                Net Worth History
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">Monthly snapshots of your total net worth</p>
            </div>
            <button
              type="button"
              onClick={openHistoryModal}
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)]"
            >
              Add Net Worth History
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                  <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Month</th>
                  <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Assets</th>
                  <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Liabilities</th>
                  <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Change</th>
                  <th className="px-5 py-3 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Net Worth</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.length ? (
                  historyRows.map((row, reversedIndex) => {
                    const chronological = [...historyRows].reverse();
                    const originalIndex = chronological.findIndex((entry) => entry.snapshot_date === row.snapshot_date);
                    const previous = originalIndex > 0 ? chronological[originalIndex - 1] : null;
                    const change =
                      row.change_amount !== null && row.change_amount !== undefined
                        ? Number(row.change_amount || 0)
                        : previous
                          ? Number(row.net_worth || 0) - Number(previous.net_worth || 0)
                          : null;
                    const isUp = change !== null && change >= 0;
                    return (
                      <tr
                        key={row.id || `${row.snapshot_date}-${reversedIndex}`}
                        className="border-b border-[var(--color-border)] transition hover:bg-[var(--color-surface-alt)] last:border-b-0"
                      >
                        <td className="px-5 py-3 text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {formatDateLabel(row.snapshot_date)}
                        </td>
                        <td className="px-5 py-3 text-[13px] font-semibold text-[var(--color-accent-dark)]">
                          {fmt(row.total_assets)}
                        </td>
                        <td className="px-5 py-3 text-[13px] font-semibold text-[var(--color-negative)]">
                          -{fmt(row.total_liabilities)}
                        </td>
                        <td className="px-5 py-3">
                          {change !== null ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                              style={{
                                background: isUp ? 'var(--color-accent-light)' : '#FEE2E2',
                                color: isUp ? 'var(--color-accent-dark)' : 'var(--color-negative)',
                              }}
                            >
                              {isUp ? '▲ +' : '▼ '}
                              {fmt(Math.abs(change))}
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right font-display text-[13.5px] font-bold text-[var(--color-text-primary)]">
                          {fmt(row.net_worth)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                      Net worth history will appear after account balances sync.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {manualModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-text-primary)]/28 p-4">
          <div className="w-full max-w-[520px] rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <h3 className="font-display text-[1.8rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                {editingManualAccount ? 'Update Manual Account' : 'Add Manual Account'}
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Save a balance for accounts that are not available through Plaid.
              </p>
            </div>

            <form
              className="space-y-3 px-5 py-5"
              onSubmit={(event) => {
                event.preventDefault();
                void saveManualAccount();
              }}
            >
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Account Name
                </span>
                <input
                  value={manualForm.name}
                  onChange={(event) => setManualForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                  placeholder="Coinbase Wallet"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Institution
                </span>
                <input
                  value={manualForm.institutionName}
                  onChange={(event) =>
                    setManualForm((current) => ({ ...current, institutionName: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                  placeholder="Coinbase"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Type
                  </span>
                  <select
                    value={manualForm.type}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        type: event.target.value as 'asset' | 'liability',
                      }))
                    }
                    className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Subtype
                  </span>
                  <input
                    value={manualForm.subtype}
                    onChange={(event) =>
                      setManualForm((current) => ({ ...current, subtype: event.target.value }))
                    }
                    className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                    placeholder="Crypto wallet"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Balance
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualForm.balance}
                    onChange={(event) =>
                      setManualForm((current) => ({ ...current, balance: event.target.value }))
                    }
                    className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                    placeholder="12500.00"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Balance Date
                  </span>
                  <input
                    type="date"
                    value={manualForm.balanceDate}
                    onChange={(event) =>
                      setManualForm((current) => ({ ...current, balanceDate: event.target.value }))
                    }
                    className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                    required
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeManualAccountModal}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingManualAccount || !manualForm.name.trim() || !manualForm.balance.trim()}
                  className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingManualAccount ? 'Saving...' : editingManualAccount ? 'Save Update' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {historyModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-text-primary)]/28 p-4">
          <div className="w-full max-w-[760px] rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <h3 className="font-display text-[1.8rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                Add Net Worth History
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Add one or more historical snapshots. Net worth is calculated as assets minus liabilities.
              </p>
            </div>

            <form
              className="space-y-4 px-5 py-5"
              onSubmit={(event) => {
                event.preventDefault();
                void saveHistoryRows();
              }}
            >
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {historyDraftRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 md:grid-cols-[1.1fr_1fr_1fr_1fr_auto]"
                  >
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                        Date
                      </span>
                      <input
                        type="date"
                        value={row.snapshotDate}
                        onChange={(event) =>
                          setHistoryDraftRows((current) =>
                            current.map((entry) =>
                              entry.id === row.id ? { ...entry, snapshotDate: event.target.value } : entry,
                            ),
                          )
                        }
                        className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                        Assets
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.totalAssets}
                        onChange={(event) =>
                          setHistoryDraftRows((current) =>
                            current.map((entry) =>
                              entry.id === row.id ? { ...entry, totalAssets: event.target.value } : entry,
                            ),
                          )
                        }
                        className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                        placeholder="250000"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                        Liabilities
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.totalLiabilities}
                        onChange={(event) =>
                          setHistoryDraftRows((current) =>
                            current.map((entry) =>
                              entry.id === row.id ? { ...entry, totalLiabilities: event.target.value } : entry,
                            ),
                          )
                        }
                        className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                        placeholder="0"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                        Change
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={row.changeAmount}
                        onChange={(event) =>
                          setHistoryDraftRows((current) =>
                            current.map((entry) =>
                              entry.id === row.id ? { ...entry, changeAmount: event.target.value } : entry,
                            ),
                          )
                        }
                        className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                        placeholder="Optional"
                      />
                    </label>

                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={historyDraftRows.length <= 1}
                        onClick={() =>
                          setHistoryDraftRows((current) => current.filter((entry) => entry.id !== row.id))
                        }
                        className="h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-text-muted)] transition hover:text-[var(--color-negative)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="md:col-span-5 text-xs text-[var(--color-text-muted)]">
                      Row {index + 1} net worth: {fmt((Number(row.totalAssets || 0) || 0) - (Number(row.totalLiabilities || 0) || 0))}
                    </p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setHistoryDraftRows((current) => [...current, newHistoryFormRow()])}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)]"
              >
                Add another row
              </button>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeHistoryModal}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    savingHistoryRows ||
                    !historyDraftRows.some((row) => row.snapshotDate.trim() && row.totalAssets.trim())
                  }
                  className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingHistoryRows ? 'Saving...' : 'Save History'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
