// Vite config for Electron MAIN process (CJS output)
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import path from 'node:path';

export default defineConfig({
    build: {
        outDir: '.vite/build/main',
        emptyOutDir: true,
        lib: {
            entry: path.resolve(__dirname, 'main/main.ts'),
            formats: ['cjs'],
            fileName: () => 'main.cjs',
        },
        rollupOptions: {
            // 🚫 Do not bundle these — load them at runtime
            external: [
                'electron',
                'sharp',
                // sharp’s platform packages (keep these external so native .node files load correctly)
                '@img/sharp-linux-arm',
                '@img/sharp-linux-arm64',
                '@img/sharp-linux-x64',
                '@img/sharp-linux-s390x',
                '@img/sharp-linuxmusl-arm64',
                '@img/sharp-linuxmusl-x64',
                '@img/sharp-darwin-arm64',
                '@img/sharp-darwin-x64',
                '@img/sharp-win32-ia32',
                '@img/sharp-win32-x64',
                '@img/sharp-wasm32',
                // builtins (both plain and node: specifiers)
                ...builtinModules,
                ...builtinModules.map((m) => `node:${m}`),
            ],
        },
        sourcemap: false,
        target: 'node18',
        minify: false,
    },
});
