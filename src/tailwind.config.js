/** Skyin Travel & Tourism — Tailwind CSS v3 config
 *  Build (from the site folder):
 *    npx tailwindcss@3 -c src/tailwind.config.js -i src/input.css -o assets/skyin.css --minify
 */
module.exports = {
  content: {
    relative: true,
    files: ['../*.html', '../assets/*.js'],
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
      },
    },
  },
};
