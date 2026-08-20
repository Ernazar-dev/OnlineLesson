/** @type {import('tailwindcss').Config} */
export default {
  // Avoid Tailwind's preflight fighting Ant Design's own reset.
  corePlugins: { preflight: false },
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
