import {
  Calendar,
  Landmark,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { PlaidTransaction } from '../types';

type AskResponse = {
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
};

type AskChiizChatProps = {
  monthKey: string | null;
  selectedAccountId?: string | null;
  transactions: PlaidTransaction[];
  onAsk: (payload: { question: string; accountId?: string | null }) => Promise<AskResponse>;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  highlights?: AskResponse['highlights'];
  followUps?: string[];
};

function formatMonthLabel(monthKey: string | null) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return 'Current month';
  }
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(value || 0)));
}

function id() {
  return Math.random().toString(36).slice(2);
}

export function AskChiizChat({
  monthKey,
  selectedAccountId,
  transactions,
  onAsk,
}: AskChiizChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const monthLabel = useMemo(() => formatMonthLabel(monthKey), [monthKey]);

  const scopedTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesAccount = selectedAccountId && selectedAccountId !== 'all'
        ? transaction.plaid_account_id === selectedAccountId
        : true;
      return matchesAccount;
    });
  }, [selectedAccountId, transactions]);

  const accountLabel = useMemo(() => {
    if (selectedAccountId && selectedAccountId !== 'all') {
      const row = transactions.find((transaction) => transaction.plaid_account_id === selectedAccountId);
      const institution = row?.institution_name || 'Account';
      return `${institution}`;
    }
    const byInstitution = new Map<string, number>();
    for (const transaction of scopedTransactions) {
      const institution = transaction.institution_name || 'Accounts';
      byInstitution.set(institution, (byInstitution.get(institution) || 0) + 1);
    }
    const top = [...byInstitution.entries()].sort((a, b) => b[1] - a[1])[0];
    return top?.[0] || 'All accounts';
  }, [selectedAccountId, transactions, scopedTransactions]);

  const suggestionPrompts = [
    `What was my largest transaction in ${monthLabel}?`,
    `How much did I spend on dining in ${monthLabel}?`,
    'Am I on track with my budget?',
    `Which category was my biggest expense in ${monthLabel}?`,
  ];

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (!messagesRef.current) {
        return;
      }
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    });
  }

  async function sendQuestion(raw: string) {
    const question = raw.trim();
    if (!question || loading) {
      return;
    }

    setInput('');
    const userMsg: ChatMessage = { id: id(), role: 'user', text: question };
    setMessages((current) => [...current, userMsg]);
    setLoading(true);
    scrollToBottom();

    try {
      const result = await onAsk({
        question,
        accountId: selectedAccountId || undefined,
      });

      setMessages((current) => [
        ...current,
        {
          id: id(),
          role: 'assistant',
          text: result.answer,
          highlights: result.highlights || undefined,
          followUps: result.followUps || undefined,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: id(),
          role: 'assistant',
          text: 'I had trouble answering that just now. Please try again in a moment.',
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  return (
    <>
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 sm:bottom-7 sm:right-7">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-[rgba(45,204,143,0.45)] bg-[radial-gradient(circle_at_35%_30%,rgba(45,204,143,0.35),#09231b_60%)] text-[var(--color-accent)] shadow-[0_10px_28px_rgba(9,35,27,0.55)]"
        >
          <Sparkles className="h-6 w-6" strokeWidth={2} />
          {!open ? (
            <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-[#f04444] text-[10px] font-bold text-white">
              1
            </span>
          ) : null}
        </button>
      </div>

      <div
        className={`fixed bottom-24 right-3 z-50 flex w-[min(420px,calc(100vw-24px))] max-w-[420px] flex-col overflow-hidden rounded-[20px] border border-[rgba(45,204,143,0.18)] bg-[#071d16] text-white shadow-[0_24px_64px_rgba(4,12,18,0.55)] transition duration-300 sm:bottom-28 sm:right-6 ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[rgba(45,204,143,0.16)] bg-[linear-gradient(135deg,#092319,#0b2a1f)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#2DCC8F,#1fa870)] text-white">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <p className="font-display text-[1.7rem] font-semibold leading-none text-white">Ask Chiiz</p>
              <p className="mt-1 text-xs text-white/60">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] align-middle" />
                AI · Analyzing your financial data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMessages([])}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
              title="Close chat"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-[rgba(45,204,143,0.12)] bg-[rgba(45,204,143,0.06)] px-4 py-2 text-xs text-white/55">
          <span>Context:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(45,204,143,0.15)] px-2.5 py-1 font-semibold text-[var(--color-accent)]">
            <Calendar className="h-3 w-3" strokeWidth={2} />
            All history (ask any month)
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(45,204,143,0.15)] px-2.5 py-1 font-semibold text-[var(--color-accent)]">
            <Landmark className="h-3 w-3" strokeWidth={2} />
            {accountLabel} · {scopedTransactions.length} transactions
          </span>
        </div>

        <div
          ref={messagesRef}
          className="max-h-[48vh] min-h-[320px] space-y-3 overflow-y-auto px-4 py-4 sm:max-h-[54vh]"
        >
          {messages.length === 0 ? (
            <div className="space-y-3">
              <div className="py-2 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] border border-[rgba(45,204,143,0.35)] bg-[rgba(45,204,143,0.08)] text-[var(--color-accent)]">
                  <Sparkles className="h-6 w-6" strokeWidth={2} />
                </div>
                <p className="font-display text-[2rem] font-semibold text-white">Hi, I’m Chiiz AI</p>
                <p className="mt-1 text-sm text-white/55">Ask me anything about your finances.</p>
              </div>
              <div className="space-y-2">
                {suggestionPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      void sendQuestion(prompt);
                    }}
                    className="w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-white/80 transition hover:border-[rgba(45,204,143,0.3)] hover:bg-[rgba(45,204,143,0.1)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : ''}>
              <div
                className={`inline-block max-w-[82%] rounded-[14px] px-3.5 py-2.5 text-left text-[15px] leading-6 ${
                  message.role === 'user'
                    ? 'rounded-br-[6px] bg-[var(--color-accent)] text-white'
                    : 'rounded-bl-[6px] border border-[rgba(45,204,143,0.2)] bg-[#173124] text-white/90'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.highlights?.type === 'largest_transaction' ? (
                  <div className="mt-2 rounded-[10px] border border-[rgba(45,204,143,0.28)] bg-[rgba(45,204,143,0.12)] px-3 py-2">
                    <p className="font-display text-[2rem] font-semibold text-[var(--color-accent)]">
                      {formatMoney(message.highlights.amount)}
                    </p>
                    <p className="text-xs text-white/60">
                      {message.highlights.categoryName} · {message.highlights.date} · {message.highlights.merchantName}
                    </p>
                  </div>
                ) : null}
              </div>
              {message.followUps?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.followUps.map((followUp) => (
                    <button
                      key={followUp}
                      type="button"
                      onClick={() => {
                        void sendQuestion(followUp);
                      }}
                      className="rounded-full border border-[rgba(45,204,143,0.3)] bg-[rgba(45,204,143,0.1)] px-3 py-1 text-xs font-medium text-[var(--color-accent)]"
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div className="inline-flex items-center gap-1 rounded-[14px] rounded-bl-[6px] border border-[rgba(45,204,143,0.2)] bg-[#173124] px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/55 [animation-delay:-0.25s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/55 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/55" />
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 bg-black/20 p-3.5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendQuestion(input);
            }}
            className="flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/5 px-3 py-2"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about your finances..."
              rows={1}
              className="max-h-24 min-h-[22px] flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuestion(input);
                }
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-accent)] text-white transition hover:bg-[var(--color-accent-dark)] disabled:cursor-not-allowed disabled:bg-white/15"
            >
              <SendHorizontal className="h-4 w-4" strokeWidth={2} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-white/25">
            Powered by Chiiz AI · Analyzing live transaction data
          </p>
        </div>
      </div>
    </>
  );
}
