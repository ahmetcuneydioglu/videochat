/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  extend: {
    keyframes: {
      'fly-up-fade': {
        '0%': { 
          transform: 'translateY(0) scale(0.5) rotate(0deg)', 
          opacity: '0' 
        },
        '15%': { 
          opacity: '0.9', 
          transform: 'translateY(-30px) scale(1.2) rotate(-15deg)' 
        },
        '30%': {
          transform: 'translateY(-80px) scale(1) rotate(15deg)'
        },
        '100%': { 
          transform: 'translateY(-400px) scale(0.6) rotate(-20deg)', 
          opacity: '0' 
        },
      },
    },
    animation: {
      'fly-up-fade': 'fly-up-fade 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
    },
  },
},
  plugins: [],
};