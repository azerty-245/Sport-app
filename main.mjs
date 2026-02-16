import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { app, BrowserWindow, session } = require('electron');

import isDev from 'electron-is-dev';
import serve from 'electron-serve';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize 'electron-serve' to load the 'dist' folder
const loadURL = serve({ directory: 'dist' });

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // Allow cross-origin requests (needed for IPTV M3U fetch)
        },
        title: "Eben",
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
    }

    if (isDev) {
        // In development, load from the Metro bundler
        win.loadURL('http://localhost:8081');
        win.webContents.openDevTools();
    } else {
        // In production, use electron-serve (loads app://-) 
        loadURL(win);
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
