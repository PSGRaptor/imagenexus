const { VitePlugin } = require('@electron-forge/plugin-vite');
const path = require('path');

module.exports = {
    packagerConfig: {
        asar: true,
        // This icon is used for Electron Packager in dev;
        // for electron-builder (installer), see makers config below.
        icon: path.resolve(__dirname, 'resources/icons/app'),
    },
    rebuildConfig: {},
    makers: [
        { name: '@electron-forge/maker-zip' }, // simple dev artifact

        {
            name: '@electron-forge/maker-electron-builder',
            config: {
                directories: {
                    // electron-builder looks here for icons and resources
                    buildResources: 'assets',
                },
                files: [
                    'dist/**',
                    'assets/**',
                ],
                win: {
                    icon: 'assets/icons/icon.ico',
                    target: ['nsis'],
                },
                nsis: {
                    oneClick: false,
                    perMachine: false,
                    allowToChangeInstallationDirectory: true,
                    installerIcon: 'assets/icons/icon.ico',
                    uninstallerIcon: 'assets/icons/icon.ico',
                    shortcutName: 'Image Nexus',
                },
                mac: {
                    icon: 'assets/icons/icon.icns',
                    category: 'public.app-category.graphics-design',
                },
                linux: {
                    icon: 'assets/icons',
                    category: 'Graphics',
                },
            },
        },
    ],
    plugins: [
        new VitePlugin({
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
            renderer: [
                {
                    name: 'main_window',
                    config: 'renderer/vite.config.ts',
                },
            ],
        }),
    ],
};
