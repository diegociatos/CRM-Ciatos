import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Nenhuma chave secreta entra no bundle: a IA roda nas Edge Functions do Supabase.
// Só as VITE_SUPABASE_* (públicas) vêm do .env.local.
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
