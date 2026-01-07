/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ▼▼▼ 이 부분이 빠져 있어서 색깔이 안 나왔던 겁니다! ▼▼▼
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