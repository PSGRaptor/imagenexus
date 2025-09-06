/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    root: path.resolve(__dirname),
    base: '',
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, '../.vite/build/renderer'),
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
});
