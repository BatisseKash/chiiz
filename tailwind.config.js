/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'chiiz-bg':           'var(--color-bg)',
        'chiiz-surface':      'var(--color-surface)',
        'chiiz-surface-alt':  'var(--color-surface-alt)',
        'chiiz-accent':       'var(--color-accent)',
        'chiiz-accent-light': 'var(--color-accent-light)',
        'chiiz-accent-dark':  'var(--color-accent-dark)',
        'chiiz-text':         'var(--color-text-primary)',
        'chiiz-text-secondary': 'var(--color-text-secondary)',
        'chiiz-text-muted':   'var(--color-text-muted)',
        'chiiz-positive':     'var(--color-positive)',
        'chiiz-negative':     'var(--color-negative)',
        'chiiz-warning':      'var(--color-warning)',
        'chiiz-border':       'var(--color-border)',
        'chiiz-border-strong':'var(--color-border-strong)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body:    ['var(--font-body)'],
      },
      borderRadius: {
        'chiiz-sm':   'var(--radius-sm)',
        'chiiz-md':   'var(--radius-md)',
        'chiiz-lg':   'var(--radius-lg)',
        'chiiz-xl':   'var(--radius-xl)',
      },
      boxShadow: {
        'chiiz-xs': 'var(--shadow-xs)',
        'chiiz-sm': 'var(--shadow-sm)',
        'chiiz-md': 'var(--shadow-md)',
        'chiiz-lg': 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
