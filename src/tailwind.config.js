/** Skyin Travel & Tourism — Tailwind CSS v3 config
 *  Build (from the site folder):
 *    npx tailwindcss@3 -c src/tailwind.config.js -i src/input.css -o public/assets/skyin.css --minify
 */
module.exports = {
  content: {
    relative: true,
    files: ['../public/*.html', '../public/assets/*.js', '../server/routes/gateway.js'],
  },
  theme: {
    extend: {
      fontFamily: {
        // Inter for Latin letters & numbers, IBM Plex Sans Arabic for Arabic text
        sans: ['Inter', 'IBM Plex Sans Arabic', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      colors: {
        ink: '#0B0B0C',
        skyin: { cyan: '#04B2CD', orange: '#EE790E' },
        // Theme tokens (CSS variables in src/input.css; `.on-media` flips them to white text)
        fg: 'rgb(var(--fg) / <alpha-value>)',
        inv: 'rgb(var(--inv) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sand: 'rgb(var(--sand) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
    },
  },
};
