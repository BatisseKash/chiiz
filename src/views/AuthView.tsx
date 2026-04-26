import { LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';

const logoUrl = new URL('../../Chiiz logo.png', import.meta.url).href;

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

type AuthViewProps = {
  loading: boolean;
  error: string | null;
  onLogin: (payload: { email: string; password: string }) => Promise<void>;
  onSignup: (payload: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  onRequestPasswordReset: (payload: {
    email: string;
  }) => Promise<{ success: boolean; message: string; dev_reset_link?: string | null }>;
  onResetPassword: (payload: { token: string; password: string }) => Promise<{ success: boolean; message: string }>;
};

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
};

const initialForm: FormState = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  confirm_password: '',
};

const inputWrapClass =
  'flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-4 py-2.5 transition focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent-light)]';

const inputClass =
  'w-full border-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]';

export function AuthView({
  loading,
  error,
  onLogin,
  onSignup,
  onRequestPasswordReset,
  onResetPassword,
}: AuthViewProps) {
  const resetTokenFromUrl = useMemo(
    () => new URLSearchParams(window.location.search).get('reset_token')?.trim() || '',
    [],
  );
  const [mode, setMode] = useState<AuthMode>(resetTokenFromUrl ? 'reset' : 'login');
  const [form, setForm] = useState<FormState>(initialForm);
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const title = useMemo(() => {
    if (mode === 'signup') {
      return 'Create your account';
    }
    if (mode === 'forgot') {
      return 'Forgot password';
    }
    if (mode === 'reset') {
      return 'Set a new password';
    }
    return 'Welcome back';
  }, [mode]);

  const description = useMemo(() => {
    if (mode === 'signup') {
      return 'Start tracking categories, transactions, and linked accounts.';
    }
    if (mode === 'forgot') {
      return 'Enter your email and we will send you a reset link.';
    }
    if (mode === 'reset') {
      return 'Choose a new password for your account.';
    }
    return 'Sign in to return to your budgeting workspace.';
  }, [mode]);

  const resolvedError = localError || error;

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setLocalError(null);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);

    if (mode === 'login') {
      await onLogin({ email: form.email, password: form.password });
      return;
    }

    if (mode === 'signup') {
      await onSignup(form);
      return;
    }

    if (mode === 'forgot') {
      const result = await onRequestPasswordReset({ email: form.email });
      const localUrl = result.dev_reset_link ? `\nDev reset link: ${result.dev_reset_link}` : '';
      setNotice(`${result.message}${localUrl}`);
      return;
    }

    if (!resetToken) {
      setLocalError('Reset token is missing. Open the link from your email again.');
      return;
    }

    if (form.password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (form.password !== form.confirm_password) {
      setLocalError('Passwords do not match.');
      return;
    }

    const result = await onResetPassword({ token: resetToken, password: form.password });
    setNotice(result.message);
    setForm((current) => ({ ...current, password: '', confirm_password: '' }));
    setResetToken('');
    const pathname = window.location.pathname;
    const hash = window.location.hash;
    window.history.replaceState({}, document.title, `${pathname}${hash}`);
    setMode('login');
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const showSignupFields = mode === 'signup';
  const showEmailField = mode === 'login' || mode === 'signup' || mode === 'forgot';
  const showPasswordField = mode === 'login' || mode === 'signup' || mode === 'reset';
  const showConfirmPasswordField = mode === 'reset';

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <div className="w-full max-w-[480px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src={logoUrl}
            alt="Chiiz"
            className="h-12 w-12 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-xs)]"
          />
          <p className="font-display text-2xl font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
            Chiiz
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">Smart budgeting and savings</p>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
          {mode === 'login' || mode === 'signup' ? (
            <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-1">
              {(['login', 'signup'] as const).map((entry) => {
                const isActive = mode === entry;
                return (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => switchMode(entry)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-[var(--color-accent)] text-white shadow-[0_2px_8px_rgba(45,204,143,0.3)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {entry === 'login' ? 'Log in' : 'Sign up'}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-6">
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">{description}</p>
          </div>

          <form className="mt-5 space-y-3.5" onSubmit={handleSubmit}>
            {showSignupFields ? (
              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--color-text-secondary)]">First name</span>
                  <div className={inputWrapClass}>
                    <UserRound className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.5} />
                    <input
                      value={form.first_name}
                      onChange={(event) => updateField('first_name', event.target.value)}
                      className={inputClass}
                      placeholder="Avery"
                      autoComplete="given-name"
                    />
                  </div>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--color-text-secondary)]">Last name</span>
                  <div className={inputWrapClass}>
                    <UserRound className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.5} />
                    <input
                      value={form.last_name}
                      onChange={(event) => updateField('last_name', event.target.value)}
                      className={inputClass}
                      placeholder="Jordan"
                      autoComplete="family-name"
                    />
                  </div>
                </label>
              </div>
            ) : null}

            {showEmailField ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">Email</span>
                <div className={inputWrapClass}>
                  <Mail className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.5} />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    className={inputClass}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </label>
            ) : null}

            {showPasswordField ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </span>
                <div className={inputWrapClass}>
                  <LockKeyhole className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.5} />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    className={inputClass}
                    placeholder={
                      mode === 'login' ? 'Your password' : mode === 'reset' ? 'At least 8 characters' : 'At least 8 characters'
                    }
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>
              </label>
            ) : null}

            {showConfirmPasswordField ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">Confirm new password</span>
                <div className={inputWrapClass}>
                  <LockKeyhole className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.5} />
                  <input
                    type="password"
                    value={form.confirm_password}
                    onChange={(event) => updateField('confirm_password', event.target.value)}
                    className={inputClass}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                  />
                </div>
              </label>
            ) : null}

            {mode === 'login' ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm font-medium text-[var(--color-accent)] hover:underline"
                  onClick={() => switchMode('forgot')}
                >
                  Forgot password?
                </button>
              </div>
            ) : null}

            {resolvedError ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-negative)]/25 bg-[var(--color-negative)]/8 px-4 py-3 text-sm text-[var(--color-negative)]">
                {resolvedError}
              </div>
            ) : null}

            {notice ? (
              <div className="whitespace-pre-line rounded-[var(--radius-md)] border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/8 px-4 py-3 text-sm text-[var(--color-text-primary)]">
                {notice}
              </div>
            ) : null}

            <Button type="submit" variant="primary" className="mt-1 w-full py-3 text-base" disabled={loading}>
              {loading
                ? mode === 'login'
                  ? 'Signing in...'
                  : mode === 'signup'
                    ? 'Creating account...'
                    : mode === 'forgot'
                      ? 'Sending link...'
                      : 'Updating password...'
                : mode === 'login'
                  ? 'Log in'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Update password'}
            </Button>

            {mode === 'forgot' || mode === 'reset' ? (
              <button
                type="button"
                className="w-full text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                onClick={() => switchMode('login')}
              >
                Back to login
              </button>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
