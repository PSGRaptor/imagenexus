import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    root: path.resolve(__dirname),
    base: './',
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    build: { outDir: path.resolve(__dirname, '../dist/renderer'), emptyOutDir: true },
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
});

