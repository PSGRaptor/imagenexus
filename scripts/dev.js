// Simple dev orchestrator for Image Nexus (Windows-friendly)
const { spawn } = require('child_process');
const path = require('path');
const waitOn = require('wait-on');
const chokidar = require('chokidar');

let electronProc = null;
let shuttingDown = false;

function log(tag, color, ...args) {
    const colors = { cyan: '\x1b[36m', magenta: '\x1b[35m', green: '\x1b[32m', reset: '\x1b[0m' };
    const c = colors[color] || '';
    console.log(`${c}[${tag}]${colors.reset}`, ...args);
}

function spawnProc(tag, color, cmd, args, opts = {}) {
    const p = spawn(cmd, args, { stdio: 'pipe', shell: true, ...opts });
    p.stdout.on('data', (d) => log(tag, color, d.toString().trimEnd()));
    p.stderr.on('data', (d) => log(tag, color, d.toString().trimEnd()));
    p.on('close', (code) => {
        if (!shuttingDown) log(tag, color, `exited with code ${code}`);
    });
    return p;
}

async function start() {
    // 1) Start Vite
    const vite = spawnProc('RENDERER', 'magenta', 'vite', ['--config', 'renderer/vite.config.ts']);

    // 2) Start tsup (build main + preload)
    const tsup = spawnProc('MAIN', 'cyan', 'tsup', ['--watch']);

    // 3) Wait for both to be ready
    const fileMain = path.join('dist', 'main', 'main.js');
    log('DEV', 'green', 'Waiting for tcp:5173 and', fileMain);
    await waitOn({
        resources: ['tcp:5173', `file:${fileMain}`],
        log: true,
        timeout: 120000, // 2 min
    });
    log('DEV', 'green', 'Ready. Launching Electron…');

    // 4) Launch Electron
    startElectron();

    // 5) Restart Electron on main bundle changes
    chokidar.watch(fileMain, { ignoreInitial: true }).on('all', () => {
        log('DEV', 'green', 'Main bundle changed. Restarting Electron…');
        restartElectron();
    });

    // Cleanup on exit
    function killAll() {
        shuttingDown = true;
        if (electronProc) electronProc.kill();
        if (vite) vite.kill();
        if (tsup) tsup.kill();
    }
    process.on('SIGINT', killAll);
    process.on('SIGTERM', killAll);
    process.on('exit', killAll);
}

function startElectron() {
    // Helpful logging envs for dev
    const env = {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        ELECTRON_ENABLE_STACK_DUMPING: '1',
        DEBUG: 'electron*',
    };
    electronProc = spawnProc('ELECTRON', 'green', 'electron', ['.'], { env });
}

function restartElectron() {
    if (electronProc) {
        electronProc.once('close', () => startElectron());
        electronProc.kill();
    } else {
        startElectron();
    }
}

start().catch((err) => {
    console.error('[DEV]', err);
    process.exit(1);
});
