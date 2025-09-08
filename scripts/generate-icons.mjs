import fs from 'node:fs';
import path from 'node:path';
import iconGen from 'icon-gen'; // npm i -D icon-gen

const root = path.resolve('assets', 'icons');
const master = path.join(root, 'master-1024.png');

if (!fs.existsSync(master)) {
    console.error('Missing assets/icons/master-1024.png');
    process.exit(1);
}

// macOS .icns and a set of PNGs (16..1024)
await iconGen(master, root, {
    report: false,
    icns: { name: 'icon' },
    favicon: { generate: false },
    modes: ['icns', 'png'],
});

// Windows .ico (icon-gen also writes icon.ico if ico: { name } is set)
await iconGen(master, root, {
    report: false,
    ico: { name: 'icon' },
    modes: ['ico'],
});

// Ensure we have a top-level PNG that builder can use directly
fs.copyFileSync(master, path.join(root, 'icon.png'));

console.log('Generated icons in assets/icons/: icon.ico, icon.icns, icon.png and size variants.');
