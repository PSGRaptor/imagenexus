// Vite config for Electron PRELOAD script (CJS output)
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import path from 'node:path';

export default defineConfig({
    build: {
        outDir: '.vite/build/preload',
        emptyOutDir: true,
        lib: {
            entry: path.resolve(__dirname, 'main/preload.ts'),
            formats: ['cjs'],
            fileName: () => 'preload.cjs',
        },
        rollupOptions: {
            external: [
                'electron',
                ...builtinModules,
                ...builtinModules.map(m => `node:${m}`),
            ],
        },
        sourcemap: false,
        target: 'node18',
        minify: false,
    },
});
