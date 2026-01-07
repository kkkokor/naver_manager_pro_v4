/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}" // 이것만 남겨두면 됩니다!
  ],
  theme: {
    extend: {
      colors: {
        naver: {
          green: '#03C75A',
          dark: '#02b351',
          light: '#e5f9ee'
        }
      }
    },
  },
  plugins: [],
}