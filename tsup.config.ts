import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: { main: 'main/main.ts' },
        outDir: 'dist/main',
        target: 'node18',
        format: ['cjs'],
        dts: false,
        sourcemap: true,
        clean: true,
        external: ['electron', 'sharp', 'exifr'] // sharp loads dynamically
    },
    {
        entry: { preload: 'main/preload.ts' },
        outDir: 'dist/preload',
        target: 'node18',
        format: ['cjs'],
        dts: false,
        sourcemap: true,
        clean: false,
        external: ['electron']
    }
]);
