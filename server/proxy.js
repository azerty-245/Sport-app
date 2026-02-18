require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const compression = require('compression');
app.use(compression());

const PORT = 3005;

// SECURITY: Define your API Key (Must match EXPO_PUBLIC_API_KEY in the app)
const API_KEY = process.env.API_KEY || 'sport-zone-secure-v1';

// CACHE: In-memory storage for the playlist
let playlistCache = {
    data: null,
    timestamp: 0,
};
const REFRESH_INTERVAL = 1000 * 60 * 55; // Refresh every 55 minutes

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

app.get('/playlist', validateApiKey, async (req, res) => {
    if (playlistCache.data) {
        res.setHeader('Content-Type', 'text/plain');
        return res.send(playlistCache.data);
    }
    console.log('[Proxy] Cache empty, waiting for fetch...');
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
        console.log(`[Broadcaster] 📡 Starting FFmpeg: ${this.url.substring(0, 30)}...`);

        this.ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx',
            '-reconnect_delay_max', '2',
            '-rw_timeout', '10000000',
            '-fflags', '+genpts+igndts+discardcorrupt', // Removed nobuffer to smooth jitter
            '-flags', '+global_header', // Removed low_delay
            '-thread_queue_size', '4096',
            '-probesize', '5000000', // Increased for better sync
            '-analyzeduration', '5000000', // Increased for better sync
            '-headers', 'User-Agent: Smart IPTV\r\nConnection: keep-alive\r\n',
            '-i', this.url,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-af', 'aresample=async=1',
            '-avoid_negative_ts', 'make_zero',
            '-max_muxing_queue_size', '4096',
            '-f', 'mpegts',
            '-mpegts_flags', 'resend_headers+initial_discontinuity',
            '-muxdelay', '0', '-muxpreload', '0.5', // Small preload for smoothing
            'pipe:1'
        ]);

        this.ffmpeg.stdout.on('data', (chunk) => {
            this.status = 'streaming';
            for (const client of this.clients) {
                client.write(chunk);
            }
        });

        this.ffmpeg.on('close', (code) => {
            console.log(`[Broadcaster] ⚪ FFmpeg closed (Code ${code})`);
            this.stopStream();
        });

        this.ffmpeg.stderr.on('data', (d) => { }); // Silent logs to save CPU
    }

    addClient(res) {
        this.clients.add(res);
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Access-Control-Allow-Origin', '*');
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
            if (broadcastHub.activeStreams.size >= broadcastHub.maxUniqueChannels) {
                return res.status(503).send('Server Busy');
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
