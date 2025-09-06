const { VitePlugin } = require('@electron-forge/plugin-vite');
const path = require('path');

module.exports = {
    packagerConfig: {
        asar: true,
        icon: path.resolve(__dirname, 'resources/icons/app'),
    },
    rebuildConfig: {},
    makers: [
        { name: '@electron-forge/maker-zip' } // simple dev artifact
    ],
    plugins: [
        new VitePlugin({
            // This plugin version expects `build` to be an array:
            build: [
                {
                    entry: 'main/main.ts',
                    config: 'vite.main.config.ts',
                },
                {
                    entry: 'main/preload.ts',
                    config: 'vite.preload.config.ts',
                },
            ],
            // Your renderer Vite config lives inside /renderer
            renderer: [
                {
                    name: 'main_window',
                    config: 'renderer/vite.config.ts',
                },
            ],
        }),
    ],
};
