const electron = require('electron');
const path = require('path');

// Basic environment check
console.log('Node version:', process.version);
console.log('Electron version:', process.versions.electron);
console.log('require("electron") type:', typeof electron);

// If running in Node environment (not Electron), we can't do anything
if (!process.versions.electron) {
    console.error('ERROR: This script must be run with the Electron binary, not Node.js.');
    process.exit(1);
}

const { app, BrowserWindow, session } = electron;

let /* ESM modules */ serve, isDev;
let loadURL;

async function loadEsmModules() {
    try {
        console.log('Loading ESM modules...');
        // Dynamic imports for ESM-only packages
        const serveModule = await import('electron-serve');
        // electron-is-dev might be CJS compatible? let's try dynamic import anyway to be safe
        const isDevModule = await import('electron-is-dev');

        serve = serveModule.default || serveModule;
        isDev = isDevModule.default || isDevModule;

        // Initialize 'electron-serve' to load the 'dist' folder
        loadURL = serve({ directory: 'dist' });
        console.log('ESM modules loaded successfully.');
    } catch (e) {
        console.error('Failed to load ESM modules:', e);
    }
}

async function createWindow() {
    // Ensure ESM modules are loaded
    if (!loadURL) {
        await loadEsmModules();
    }

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // Allow cross-origin requests (needed for IPTV M3U fetch)
        },
        title: "Sport Zone",
        icon: path.join(__dirname, 'assets/images/icon.png'),
        autoHideMenuBar: true,
    });

    // Prevent downloads triggered by IPTV stream URLs
    if (session && session.defaultSession) {
        session.defaultSession.on('will-download', (event, item) => {
            const url = item.getURL();
            // Cancel downloads from IPTV servers (port 8080, known IPTV domains, etc.)
            if (url.includes(':8080/') || url.includes(':80/') || url.includes('get.php')) {
                console.log('[Download blocked]', url);
                event.preventDefault();
            }
        });
    } else {
        console.warn('Session or defaultSession not available');
    }

    if (isDev) {
        // In development, load from the Metro bundler
        win.loadURL('http://localhost:8081');
        win.webContents.openDevTools();
    } else {
        // In production, load the Vercel URL for instant updates
        // This means the Windows app is a wrapper for your website
        win.loadURL('https://sport-app-three-pi.vercel.app/');
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
