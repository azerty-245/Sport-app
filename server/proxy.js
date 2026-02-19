require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const compression = require('compression');

const app = express();

// --- GLOBAL MIDDLEWARE ---
app.use(compression());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Access-Control-Allow-Origin']
}));
app.options('*', cors());

const PORT = 3005;
const API_KEY = process.env.API_KEY || 'sport-zone-secure-v1';

// CACHE: In-memory storage for the playlist
let playlistCache = {
    data: null,
    timestamp: 0,
    configHash: null
};

const REFRESH_INTERVAL = 1000 * 60 * 15; // 15 minutes
const SOFT_REFRESH_INTERVAL = 1000 * 60 * 5; // 5 minutes soft check
const MAX_UNIQUE_CHANNELS = 8;

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

    console.log(`[Proxy] 🔄 Refreshing Playlist (Async)...`);
    const start = Date.now();

    for (let i = 0; i < iptvUrls.length; i++) {
        const url = iptvUrls[i];
        try {
            const response = await axios.get(url, {
                timeout: 30000,
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
            playlistCache.configHash = process.env.IPTV_URL;
            console.log(`[Proxy] ✅ Playlist Updated! Size: ${(finalOutput.length / 1024).toFixed(2)} KB. Time: ${Date.now() - start}ms`);
            return true;
        } catch (error) {
            console.error(`[Proxy] ⚠️ Source ${i + 1} failed: ${error.message}`);
        }
    }
    return false;
};

// Start Background Refresh Loop
if (process.env.IPTV_URL) {
    fetchPlaylist();
    setInterval(fetchPlaylist, REFRESH_INTERVAL);
}

// Discovery endpoint
app.get('/tunnel-info', (req, res) => {
    res.json({ tunnelUrl: tunnelUrl || null });
});

app.get('/playlist', validateApiKey, async (req, res) => {
    let currentIPTVUrl = process.env.IPTV_URL;
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const result = require('dotenv').parse(fs.readFileSync(envPath));
            if (result.IPTV_URL) currentIPTVUrl = result.IPTV_URL;
        }
    } catch (e) { }

    const configChanged = playlistCache.configHash !== currentIPTVUrl;
    const isStale = Date.now() - playlistCache.timestamp > SOFT_REFRESH_INTERVAL;
    const forceRefresh = req.query.refresh === 'true';

    if (playlistCache.data && !configChanged && !forceRefresh) {
        res.setHeader('Content-Type', 'text/plain');
        res.send(playlistCache.data);
        if (isStale) fetchPlaylist();
    } else {
        if (configChanged) process.env.IPTV_URL = currentIPTVUrl;
        const success = await fetchPlaylist();
        if (success) {
            res.setHeader('Content-Type', 'text/plain');
            res.send(playlistCache.data);
        } else {
            res.status(502).send('IPTV source unavailable');
        }
    }
});

// --- BROADCASTER HUB ---
const broadcastHub = {
    activeStreams: new Map()
};

class Broadcaster {
    constructor(url) {
        this.url = url;
        this.clients = new Set();
        this.status = 'starting';
        this.startStream();
    }

    startStream() {
        if (this.url.includes('trycloudflare.com') || this.url.includes('localhost')) return;

        this.ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx',
            '-fflags', '+genpts+igndts+discardcorrupt+flush_packets+nobuffer',
            '-flags', '+low_delay+global_header',
            '-i', this.url,
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
            '-f', 'mpegts', 'pipe:1'
        ]);

        this.ffmpeg.stdout.on('data', (chunk) => {
            this.status = 'streaming';
            for (const client of this.clients) {
                try { client.write(chunk); } catch (e) { this.clients.delete(client); }
            }
        });

        this.ffmpeg.on('close', () => {
            if (this.clients.size > 0) setTimeout(() => this.startStream(), 2000);
            else this.stopStream();
        });
    }

    addClient(res) {
        this.clients.add(res);
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Connection', 'keep-alive');
    }

    removeClient(res) {
        this.clients.delete(res);
        if (this.clients.size === 0) setTimeout(() => { if (this.clients.size === 0) this.stopStream(); }, 30000);
    }

    stopStream() {
        if (this.ffmpeg) this.ffmpeg.kill('SIGKILL');
        broadcastHub.activeStreams.delete(this.url);
    }
}

app.get('/stream', validateApiKey, async (req, res) => {
    let { url, id, nocode } = req.query;
    if (id) url = Buffer.from(id, 'base64').toString('utf-8');
    if (!url) return res.status(400).send('Missing url');

    if (nocode === 'true') {
        try {
            const response = await axios({ method: 'get', url, responseType: 'stream', timeout: 15000 });
            response.data.pipe(res);
        } catch (e) { res.status(502).send('Error'); }
        return;
    }

    let broadcaster = broadcastHub.activeStreams.get(url);
    if (!broadcaster) {
        if (broadcastHub.activeStreams.size >= MAX_UNIQUE_CHANNELS) return res.status(503).send('Busy');
        broadcaster = new Broadcaster(url);
        broadcastHub.activeStreams.set(url, broadcaster);
    }
    broadcaster.addClient(res);
    res.on('close', () => broadcaster.removeClient(res));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy Active on Port: ${PORT}`);
});
