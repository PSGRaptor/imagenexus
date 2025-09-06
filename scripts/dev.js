// Simple, stable dev orchestrator for Image Nexus (Windows-friendly)
const { spawn } = require('child_process');
const path = require('path');
const waitOn = require('wait-on');
const chokidar = require('chokidar');

let electronProc = null;
let shuttingDown = false;
let restartPending = false;
let watcher = null;

function log(tag, color, ...args) {
    const colors = { cyan: '\x1b[36m', magenta: '\x1b[35m', green: '\x1b[32m', yellow: '\x1b[33m', reset: '\x1b[0m' };
    const c = colors[color] || '';
    console.log(`${c}[${tag}]${colors.reset}`, ...args);
}

function spawnProc(tag, color, cmd, args, opts = {}) {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true, ...opts });
    p.stdout.on('data', (d) => log(tag, color, d.toString().trimEnd()));
    p.stderr.on('data', (d) => log(tag, color, d.toString().trimEnd()));
    p.on('close', (code) => {
        if (!shuttingDown) log(tag, color, `exited with code ${code}`);
    });
    return p;
}

function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

async function start() {
    const fileMain = path.join('dist', 'main', 'main.js');
    log('DEV', 'green', 'Waiting for tcp:5173 and', fileMain);

    // 1) Start Vite + tsup
    const vite = spawnProc('RENDERER', 'magenta', 'vite', ['--config', 'renderer/vite.config.ts']);
    const tsup = spawnProc('MAIN', 'cyan', 'tsup', ['--watch']);

    // 2) Wait until both are ready before touching Electron
    await waitOn({
        resources: ['tcp:5173', `file:${fileMain}`],
        log: true,
        timeout: 120000
    });

    log('DEV', 'green', 'Ready. Launching Electron…');
    startElectron();

    // 3) Only now start watching the main bundle, and debounce restarts
    const debouncedRestart = debounce(() => {
        if (restartPending) return;
        restartPending = true;
        log('DEV', 'yellow', 'Main bundle changed. Restarting Electron…');
        restartElectron(() => { restartPending = false; });
    }, 300);

    watcher = chokidar.watch(fileMain, { ignoreInitial: true })
        .on('change', debouncedRestart)
        .on('add', debouncedRestart);

    // Cleanup on exit
    function killAll() {
        shuttingDown = true;
        if (watcher) { watcher.close().catch(() => {}); watcher = null; }
        if (electronProc) { electronProc.kill(); electronProc = null; }
        if (vite) vite.kill();
        if (tsup) tsup.kill();
    }
    process.on('SIGINT', killAll);
    process.on('SIGTERM', killAll);
    process.on('exit', killAll);
}

function startElectron() {
    const env = {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        ELECTRON_ENABLE_STACK_DUMPING: '1',
        DEBUG: 'electron*',
    };
    if (electronProc) {
        // just in case
        electronProc.removeAllListeners('close');
        try { electronProc.kill(); } catch {}
    }
    electronProc = spawnProc('ELECTRON', 'green', 'electron', ['.'], { env });
}

function restartElectron(done) {
    if (!electronProc) { startElectron(); done && done(); return; }
    electronProc.once('close', () => { startElectron(); done && done(); });
    try { electronProc.kill(); } catch { startElectron(); done && done(); }
}

start().catch((err) => {
    console.error('[DEV]', err);
    process.exit(1);
});
