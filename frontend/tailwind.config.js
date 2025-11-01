/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      // Paleta de colores mejorada para mejor contraste y legibilidad
      colors: {
        // Grises mejorados con mejor contraste (WCAG AA: 4.5:1 mínimo)
        // Reemplazo de text-gray-500 (demasiado claro) por text-gray-700
        // Reemplazo de text-gray-400 por text-gray-600
        gray: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',  // Solo para elementos no críticos
          500: '#737373',  // Texto secundario (contraste suficiente)
          600: '#525252',  // Texto secundario mejorado
          700: '#404040',  // Texto principal (alto contraste)
          800: '#262626',  // Texto principal fuerte
          900: '#171717',  // Texto principal muy fuerte
        },
        // Azules mejorados
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',  // Mejor contraste
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        light: {
          ...require("daisyui/src/theming/themes")["light"],
          "base-100": "#ffffff",
          "base-200": "#f9fafb",
          "base-300": "#f3f4f6",
          "base-content": "#171717",  // Texto principal oscuro para mejor contraste
          "primary": "#2563eb",  // Azul más oscuro para mejor contraste
          "secondary": "#7c3aed",  // Púrpura para acentos
          "accent": "#10b981",  // Verde para elementos destacados
          "neutral": "#374151",
          "info": "#3b82f6",
          "success": "#10b981",
          "warning": "#f59e0b",
          "error": "#ef4444",
        },
      },
      {
        dark: {
          ...require("daisyui/src/theming/themes")["dark"],
          "base-100": "#1f2937",
          "base-200": "#374151",
          "base-300": "#4b5563",
          "base-content": "#f9fafb",  // Texto claro para contraste
          "primary": "#60a5fa",
          "secondary": "#a78bfa",
          "accent": "#34d399",
          "neutral": "#6b7280",
          "info": "#60a5fa",
          "success": "#34d399",
          "warning": "#fbbf24",
          "error": "#f87171",
  },
      },
    ],
  },
};