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
let pendingFetch = null; // Prevents duplicate concurrent fetches

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
    if (pendingFetch) return pendingFetch; // Don't start duplicate fetch
    pendingFetch = _doFetchPlaylist().finally(() => { pendingFetch = null; });
    return pendingFetch;
};

const _doFetchPlaylist = async () => {
    const iptvUrls = (process.env.IPTV_URL || '').split(',').map(u => u.trim()).filter(u => u);
    if (iptvUrls.length === 0) {
        console.error('[Proxy] No IPTV_URL configured');
        return false;
    }

    console.log(`[Proxy] 🔄 Refreshing Playlist (Filtered Mode)...`);
    const start = Date.now();

    for (let i = 0; i < iptvUrls.length; i++) {
        const url = iptvUrls[i];
        try {
            const response = await axios.get(url, {
                timeout: 30000,
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' }
            });

            const lines = response.data.split('\n');
            const filteredLines = ['#EXTM3U'];
            let currentExtInfo = null;

            for (let j = 0; j < lines.length; j++) {
                const line = lines[j].trim();
                if (line.startsWith('#EXTINF:')) {
                    currentExtInfo = line;
                } else if (line.startsWith('http') && currentExtInfo) {
                    const infoUpper = currentExtInfo.toUpperCase();

                    // --- REPLICATE CLIENT FILTERING LOGIC ---
                    const isFrench = infoUpper.includes('FR:') || infoUpper.includes('FR |') || infoUpper.includes('FRANCE') || infoUpper.includes('FRENCH') || infoUpper.includes('FRANÇAIS');
                    const isSportGeneric = infoUpper.includes('SPORT') || infoUpper.includes('FOOT') || infoUpper.includes('SOCCER') || infoUpper.includes('RUGBY') || infoUpper.includes('TENNIS') || infoUpper.includes('BASKET') || infoUpper.includes('UFC') || infoUpper.includes('WWE');
                    const isPremiumBrand = infoUpper.includes('CANAL+') || infoUpper.includes('BEIN') || infoUpper.includes('RMC SPORT') || infoUpper.includes('EUROSPORT') || infoUpper.includes('DAZN') || infoUpper.includes('PRIME VIDEO') || infoUpper.includes('EQUIPE') || infoUpper.includes('SKY SPORT');
                    const isMainFrench = infoUpper.includes('TF1') || infoUpper.includes('M6') || infoUpper.includes('FRANCE 2') || infoUpper.includes('FRANCE 3');

                    if ((isFrench && (isSportGeneric || isPremiumBrand)) || (isPremiumBrand && isSportGeneric) || isMainFrench) {
                        // Keep this channel
                        filteredLines.push(currentExtInfo);
                        const encodedUrl = Buffer.from(line).toString('base64');
                        filteredLines.push(`/stream?id=${encodedUrl}&key=${API_KEY}`);
                    }
                    currentExtInfo = null;
                }
            }

            const finalOutput = filteredLines.join('\n');
            playlistCache.data = finalOutput;
            playlistCache.timestamp = Date.now();
            playlistCache.configHash = process.env.IPTV_URL;
            console.log(`[Proxy] ✅ Playlist Updated! (Filtered) Size: ${(finalOutput.length / 1024).toFixed(2)} KB. Time: ${Date.now() - start}ms`);
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
        // Wait max 5s for the fetch (Vercel times out at 10s)
        try {
            await Promise.race([
                fetchPlaylist(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);

            if (playlistCache.data) {
                res.setHeader('Content-Type', 'text/plain');
                return res.send(playlistCache.data);
            }
        } catch (e) {
            console.warn(`[Proxy] ⏱️ Playlist fetch ${e.message} - IPTV source slow`);
        }

        // Final Fallback: If we have ANY data (even stale), return it instead of erroring
        if (playlistCache.data) {
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('X-Cache-Status', 'STALE_WAIT_TIMEOUT');
            return res.send(playlistCache.data);
        }

        res.status(503).send('Warming up - try again in 10s');
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
            '-fflags', '+genpts+igndts+discardcorrupt+flush_packets',
            '-flags', '+global_header',
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
            const response = await axios({ method: 'get', url, responseType: 'stream', timeout: 5000 });
            response.data.pipe(res);
        } catch (e) { res.status(502).send('Error'); }
        return;
    }

    let broadcaster = broadcastHub.activeStreams.get(url);
    if (!broadcaster) {
        if (broadcastHub.activeStreams.size >= MAX_UNIQUE_CHANNELS) return res.status(503).send('Busy');
        console.log(`[Proxy] 🎥 Starting NEW Broadcaster for: ${url.substring(url.lastIndexOf('/') + 1)}`);
        broadcaster = new Broadcaster(url);
        broadcastHub.activeStreams.set(url, broadcaster);
    } else {
        console.log(`[Proxy] 🤝 Sharing existing stream for: ${url.substring(url.lastIndexOf('/') + 1)} (Active clients: ${broadcaster.clients.size})`);
    }
    broadcaster.addClient(res);
    res.on('close', () => broadcaster.removeClient(res));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy Active on Port: ${PORT}`);
});
