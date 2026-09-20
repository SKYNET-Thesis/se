export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        sidebar: 'rgb(var(--c-sidebar) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        elev: 'rgb(var(--c-elev) / <alpha-value>)',
        subtle: 'rgb(var(--c-subtle) / <alpha-value>)',
        line: 'rgb(var(--c-border) / <alpha-value>)',
        ink: 'rgb(var(--c-text) / <alpha-value>)',
        ink2: 'rgb(var(--c-text2) / <alpha-value>)',
        faint: 'rgb(var(--c-muted) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          hover: 'rgb(var(--c-brand-hover) / <alpha-value>)',
        },
        armleft: '#35c9d0',
        armright: '#a78bfa',
        vr: '#38bdf8',
        ok: '#34d399',
        warn: '#fbbf24',
        danger: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '21px'],
        md: ['15px', '23px'],
        lg: ['16px', '24px'],
        xl: ['18px', '26px'],
        '2xl': ['22px', '30px'],
        '3xl': ['28px', '34px'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.24)',
        pop: '0 12px 32px rgba(0,0,0,0.38)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
};
