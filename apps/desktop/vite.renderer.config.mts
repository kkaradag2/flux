import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'development-react-refresh-csp',
      apply: 'serve',
      // React Refresh injects an inline preamble only during development.
      transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    },
  ],
  base: './',
  server: { host: '127.0.0.1' },
});
