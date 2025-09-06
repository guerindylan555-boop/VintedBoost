// Next.js expects PostCSS plugins to be provided
// as strings or an object map, not functions.
// Use the canonical Next.js shape below.
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
