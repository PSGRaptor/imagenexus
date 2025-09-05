const fs = require('fs');
const path = require('path');

const cfgDir = path.join(__dirname, '..', 'config');
const defaults = path.join(cfgDir, 'default-config.json');
const user = path.join(cfgDir, 'user-settings.json');
const favs = path.join(cfgDir, 'favorites.json');

if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });

if (!fs.existsSync(user)) {
    fs.copyFileSync(defaults, user);
    console.log('[postinstall] Created config/user-settings.json from defaults');
}
if (!fs.existsSync(favs)) {
    fs.writeFileSync(favs, JSON.stringify({ favorites: {} }, null, 2));
    console.log('[postinstall] Created config/favorites.json');
}
