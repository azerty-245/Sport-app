require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const compression = require('compression');
app.use(compression());
const fs = require('fs');
const path = require('path');

const PORT = 3005;

// SECURITY: Define your API Key (Must match EXPO_PUBLIC_API_KEY in the app)
const API_KEY = process.env.API_KEY || 'sport-zone-secure-v1';

// CACHE: In-memory storage for the playlist
let playlistCache = {
    data: null,
    timestamp: 0,
    configHash: null
};
const REFRESH_INTERVAL = 1000 * 60 * 60 * 24 * 7;
const SOFT_REFRESH_INTERVAL = 1000 * 60 * 60 * 24;
const MAX_UNIQUE_CHANNELS = 5;

// --- TUNNEL DISCOVERY ---
let tunnelUrl = null;
const TUNNEL_URL_FILE = path.join(__dirname, 'tunnel_url.txt');

function updateTunnelUrl() {
    try {
        if (fs.existsSync(TUNNEL_URL_FILE)) {
            tunnelUrl = fs.readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
            console.log(`[Proxy] 🛡️ Secure Tunnel Active: ${tunnelUrl}`);
        }
    } catch (e) {
        console.error('[Proxy] Failed to read tunnel URL');
    }
}
fs.watchFile(TUNNEL_URL_FILE, updateTunnelUrl);
updateTunnelUrl();

app.use(cors());

// Middleware to check API Key
const validateApiKey = (req, res, next) => {
    const providedKey = req.headers['x-api-key'] || req.query.key;
    if (providedKey !== API_KEY) {
        console.warn(`[Security] Unauthorized access attempt from ${req.ip}`);
        return res.status(401).send('Unauthorized: Invalid API Key');
    }
    next();
};

// Helper to check if FFmpeg is available
const checkFFmpeg = () => {
    return new Promise((resolve) => {
        const check = spawn('ffmpeg', ['-version']);
        check.on('error', () => resolve(false));
        check.on('close', (code) => resolve(code === 0));
    });
};

// CORE: Fetch Playlist Logic
const fetchPlaylist = async () => {
    const iptvUrls = (process.env.IPTV_URL || '').split(',').map(u => u.trim()).filter(u => u);
    if (iptvUrls.length === 0) {
        console.error('[Proxy] No IPTV_URL configured');
        return false;
    }

    console.log(`[Proxy] 🔄 Refreshing Playlist (Fallback Mode Active: ${iptvUrls.length} sources)...`);
    const start = Date.now();

    for (let i = 0; i < iptvUrls.length; i++) {
        const url = iptvUrls[i];
        try {
            console.log(`[Proxy]  Trying source ${i + 1}: ${url.substring(0, 40)}...`);
            const response = await axios.get(url, {
                timeout: 20000,
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' }
            });

            const lines = response.data.split('\n');
            const rewrittenLines = lines.map(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('http')) {
                    const encodedUrl = Buffer.from(trimmed).toString('base64');
                    return `/stream?id=${encodedUrl}&key=${API_KEY}`;
                }
                return line;
            });

            const finalOutput = rewrittenLines.join('\n');
            playlistCache.data = finalOutput;
            playlistCache.timestamp = Date.now();
            playlistCache.configHash = process.env.IPTV_URL; // Save hash of sources used
            console.log(`[Proxy] ✅ Success with source ${i + 1}! Size: ${(finalOutput.length / 1024).toFixed(2)} KB. Time: ${Date.now() - start}ms`);
            return true;
        } catch (error) {
            console.error(`[Proxy] ⚠️ Source ${i + 1} failed: ${error.message}`);
            // Continue to next source
        }
    }

    console.error(`[Proxy] ❌ All ${iptvUrls.length} sources failed.`);
    return false;
};

// Start Background Refresh Loop
if (process.env.IPTV_URL) {
    setInterval(fetchPlaylist, REFRESH_INTERVAL);
}

// Discovery endpoint for the frontend to find the current secure tunnel URL
app.get('/tunnel-info', (req, res) => {
    res.json({ tunnelUrl: tunnelUrl || null });
});

app.get('/playlist', validateApiKey, async (req, res) => {
    const forceRefresh = req.query.refresh === 'true';

    // Check if configuration on disk changed
    let currentHash = process.env.IPTV_URL;
    try {
        // Force reload dotenv to detect file changes without server restart
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const result = require('dotenv').parse(fs.readFileSync(envPath));
            if (result.IPTV_URL) {
                currentHash = result.IPTV_URL;
                process.env.IPTV_URL = result.IPTV_URL; // Update in-memory env
            }
        }
    } catch (e) {
        console.error('[Proxy] Error re-reading .env:', e.message);
    }

    const configChanged = playlistCache.configHash !== currentHash;
    const isStale = Date.now() - playlistCache.timestamp > REFRESH_INTERVAL;
    const needsSoftCheck = Date.now() - playlistCache.timestamp > SOFT_REFRESH_INTERVAL;

    // Return cache if it's not totally expired, config hasn't changed, and we don't need a health check
    if (playlistCache.data && !forceRefresh && !configChanged && !isStale && !needsSoftCheck) {
        res.setHeader('Content-Type', 'text/plain');
        return res.send(playlistCache.data);
    }

    if (forceRefresh) console.log('[Proxy] 🔄 Manual refresh requested...');
    if (configChanged) console.log('[Proxy] ⚙️ Config change detected in .env, updating cache...');
    if (needsSoftCheck && !isStale) console.log('[Proxy] 🕒 24h health check triggered, validating source...');

    const success = await fetchPlaylist();
    if (success && playlistCache.data) {
        res.setHeader('Content-Type', 'text/plain');
        res.send(playlistCache.data);
    } else {
        res.status(502).send('IPTV source unavailable');
    }
});

// --- BROADCASTER HUB ---
const broadcastHub = {
    activeStreams: new Map(),
    maxUniqueChannels: 8
};

class Broadcaster {
    constructor(url) {
        this.url = url;
        this.clients = new Set();
        this.ffmpeg = null;
        this.status = 'starting';
        this.cleanupTimer = null;
        this.startStream();
    }

    startStream() {
        if (this.status === 'reconnecting') return;

        // --- LOOP PROTECTION ---
        if (this.url.includes('trycloudflare.com') || this.url.includes('localhost') || this.url.includes('127.0.0.1')) {
            console.error(`[Broadcaster] 🛑 LOOP DETECTED: Refusing to proxy self (${this.url.substring(0, 40)}...)`);
            this.status = 'error';
            return;
        }

        console.log(`[Broadcaster] 📡 Starting FFmpeg: ${this.url.substring(0, 40)}...`);
        this.bytesTransferred = 0;
        this.lastLogTime = Date.now();
        this.lastDataTime = Date.now();

        this.ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx',
            '-reconnect_delay_max', '2',
            '-rw_timeout', '10000000',
            '-fflags', '+genpts+igndts+discardcorrupt+flush_packets+nobuffer',
            '-flags', '+low_delay+global_header',
            '-max_delay', '500000',
            '-probesize', '5000000',
            '-analyzeduration', '5000000',
            '-user_agent', 'SmartIPTV',
            '-i', this.url,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-af', 'aresample=async=1',
            '-max_muxing_queue_size', '8192',
            '-bufsize', '4M',
            '-f', 'mpegts',
            '-mpegts_flags', 'resend_headers+initial_discontinuity',
            '-muxdelay', '0.001',
            'pipe:1'
        ]);

        let ffmpegLogs = '';
        this.ffmpeg.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('error') || msg.includes('failed')) {
                ffmpegLogs += msg;
                if (ffmpegLogs.length > 500) ffmpegLogs = ffmpegLogs.substring(ffmpegLogs.length - 500);
            }
        });

        this.ffmpeg.stdout.on('data', (chunk) => {
            const now = Date.now();
            this.lastDataTime = now;
            this.bytesTransferred += chunk.length;

            if (this.status !== 'streaming') {
                console.log(`[Broadcaster] ✅ First packet received for ${this.url.substring(0, 20)}...`);
            }
            this.status = 'streaming';

            if (now - this.lastLogTime > 10000) {
                const kbps = Math.round((this.bytesTransferred / 1024) / ((now - this.lastLogTime) / 1000));
                console.log(`[Broadcaster-Diag] 📊 Bitrate: ${kbps} KB/s | Clients: ${this.clients.size}`);
                this.bytesTransferred = 0;
                this.lastLogTime = now;
            }

            for (const client of this.clients) {
                try {
                    client.write(chunk);
                } catch (e) {
                    this.clients.delete(client);
                }
            }
        });

        this.starvationCheck = setInterval(() => {
            if (this.status === 'streaming' && Date.now() - this.lastDataTime > 5000) {
                console.warn(`[Broadcaster-Diag] 💀 SOURCE STARVATION: No data from IPTV for 5s. Force Restarting FFmpeg.`);
                if (this.ffmpeg) this.ffmpeg.kill('SIGKILL');
            }
        }, 2000);

        this.ffmpeg.on('close', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`[Broadcaster] ❌ FFmpeg Exit Code ${code} for ${this.url.substring(0, 30)}`);
                if (ffmpegLogs) console.error(`[Broadcaster-Error] Logs: ${ffmpegLogs}`);
            } else {
                console.log(`[Broadcaster] ⚠️ FFmpeg closed (Code ${code}). Attempting silent reconnect...`);
            }

            this.ffmpeg = null;
            clearInterval(this.starvationCheck);
            if (this.clients.size > 0 && this.status !== 'error') {
                this.status = 'reconnecting';
                setTimeout(() => this.startStream(), 2000);
            } else {
                this.stopStream();
            }
        });

        this.ffmpeg.getStderr = () => { };
    }

    addClient(res) {
        this.clients.add(res);
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Connection', 'keep-alive');
    }

    removeClient(res) {
        this.clients.delete(res);
        if (this.clients.size === 0) {
            this.cleanupTimer = setTimeout(() => this.stopStream(), 30000);
        }
    }

    stopStream() {
        if (this.ffmpeg) {
            this.ffmpeg.kill('SIGKILL');
            this.ffmpeg = null;
        }
        for (const client of this.clients) client.end();
        this.clients.clear();
        broadcastHub.activeStreams.delete(this.url);
    }
}

app.get('/stream', validateApiKey, async (req, res) => {
    let { url, id, nocode } = req.query;
    if (id) {
        try {
            url = Buffer.from(id, 'base64').toString('utf-8');
        } catch (e) { return res.status(400).send('Invalid ID'); }
    }
    if (!url) return res.status(400).send('Missing url');

    res.setHeader('Access-Control-Allow-Origin', '*');

    const hasFFmpeg = await checkFFmpeg();

    if (nocode === 'true' || !hasFFmpeg) {
        try {
            const stealthHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Connection': 'keep-alive'
            };
            if (url.includes('sofascore.com')) {
                stealthHeaders['Origin'] = 'https://www.sofascore.com';
                stealthHeaders['Referer'] = 'https://www.sofascore.com/';
            }
            const response = await axios({
                method: 'get', url, responseType: 'stream', timeout: 15000,
                headers: stealthHeaders
            });
            res.setHeader('Content-Type', response.headers['content-type'] || 'application/json');
            response.data.pipe(res);
            res.on('close', () => response.data.destroy());
        } catch (error) {
            if (!res.headersSent) {
                // Return empty list or silent error to avoid Bad Gateway alert in app
                res.status(200).json({ error: 'Source Temporarily Blocked', status: 403, events: [] });
            }
        }
        return;
    }

    try {
        let broadcaster = broadcastHub.activeStreams.get(url);
        if (!broadcaster) {
            if (broadcastHub.activeStreams.size >= MAX_UNIQUE_CHANNELS) {
                console.warn(`[Proxy] Hub Busy: ${broadcastHub.activeStreams.size}/${MAX_UNIQUE_CHANNELS} channels.`);
                return res.status(503).send('Server Busy: Too many active viewers');
            }
            broadcaster = new Broadcaster(url);
            broadcastHub.activeStreams.set(url, broadcaster);
        }
        broadcaster.addClient(res);
        res.on('close', () => broadcaster.removeClient(res));
    } catch (e) {
        if (!res.headersSent) res.status(500).send('Hub Error');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy BROADCASTER (v6.3 JITTER-SMOOTH)\n📍 Port: ${PORT}`);
    if (process.env.IPTV_URL) fetchPlaylist();
});
