/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",           // [추가] 현재 위치(루트)에 있는 파일들 (App.tsx 등)
    "./components/**/*.{js,ts,jsx,tsx}", // [추가] components 폴더 안에 있는 파일들
    "./src/**/*.{js,ts,jsx,tsx}"     // (혹시 src가 있을 경우 대비해 유지)
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