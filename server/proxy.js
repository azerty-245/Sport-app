require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const PORT = 3005;

// SECURITY: Define your API Key (Must match EXPO_PUBLIC_API_KEY in the app)
const API_KEY = process.env.API_KEY || 'sport-zone-secure-v1';

// CACHE: In-memory storage for the playlist
let playlistCache = {
    data: null,
    timestamp: 0,
};
const CACHE_DURATION = 1000 * 60 * 60 * 6; // 6 Hours

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

app.get('/playlist', validateApiKey, async (req, res) => {
    const now = Date.now();

    // 1. Check if cache is fresh
    if (playlistCache.data && (now - playlistCache.timestamp < CACHE_DURATION)) {
        console.log('[Proxy] Serving playlist from Server Cache (Instant)');
        res.setHeader('Content-Type', 'text/plain');
        return res.send(playlistCache.data);
    }

    const iptvUrl = (process.env.IPTV_URL || '').trim();

    if (!iptvUrl) {
        return res.status(500).send('IPTV_URL not configured on server');
    }

    console.log(`[Proxy] Playlist cache expired. Fetching from source...`);

    try {
        const response = await axios.get(iptvUrl, {
            timeout: 15000,
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

        // Update Cache
        playlistCache.data = finalOutput;
        playlistCache.timestamp = now;

        res.setHeader('Content-Type', 'text/plain');
        res.send(finalOutput);
    } catch (error) {
        console.error(`[Proxy] Playlist fetch failed: ${error.message}`);
        res.status(502).send('IPTV source unavailable');
    }
});

// --- BROADCASTER HUB: Multi-user stream sharing ---
const broadcastHub = {
    activeStreams: new Map(), // URL -> Broadcaster instance
    maxUniqueChannels: 8      // Safety limit for 1GB RAM VM
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
        console.log(`[Broadcaster] 📡 Starting FFmpeg for unique channel: ${this.url.substring(0, 30)}...`);

        this.ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx',
            '-reconnect_delay_max', '2',
            '-rw_timeout', '10000000',
            '-multiple_requests', '1',
            '-fflags', '+genpts+igndts+discardcorrupt',
            '-err_detect', 'ignore_err',
            '-thread_queue_size', '8192',
            '-probesize', '5000000',
            '-analyzeduration', '5000000',
            '-headers', 'User-Agent: Smart IPTV\r\nConnection: keep-alive\r\n',
            '-i', this.url,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-af', 'aresample=async=1',
            '-avoid_negative_ts', 'make_zero',
            '-max_muxing_queue_size', '2048',
            '-f', 'mpegts',
            '-mpegts_flags', 'resend_headers',
            '-muxdelay', '0', '-muxpreload', '1',
            'pipe:1'
        ]);

        this.ffmpeg.stdout.on('data', (chunk) => {
            this.status = 'streaming';
            for (const client of this.clients) {
                client.write(chunk);
            }
        });

        this.ffmpeg.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('error') || msg.includes('timeout')) {
                console.warn(`[Broadcaster-FFmpeg] ${msg.trim()}`);
            }
        });

        this.ffmpeg.on('close', (code) => {
            console.log(`[Broadcaster] ⚪ FFmpeg closed (Code ${code}) for ${this.url.substring(0, 30)}`);
            this.stopStream();
        });
    }

    addClient(res) {
        this.clients.add(res);
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        res.setHeader('Content-Type', 'video/mp2t');
        console.log(`[Broadcaster] 👥 Client added. Total for this channel: ${this.clients.size}`);
    }

    removeClient(res) {
        this.clients.delete(res);
        if (this.clients.size === 0) {
            console.log(`[Broadcaster] ⏳ Last client left. Keeping FFmpeg alive for 30s...`);
            this.cleanupTimer = setTimeout(() => {
                console.log(`[Broadcaster] 🛑 Cleanup: Closing idle stream.`);
                this.stopStream();
            }, 30000);
        }
    }

    stopStream() {
        if (this.ffmpeg) {
            this.ffmpeg.kill('SIGKILL');
            this.ffmpeg = null;
        }
        for (const client of this.clients) {
            client.end();
        }
        this.clients.clear();
        broadcastHub.activeStreams.delete(this.url);
    }
}

app.get('/stream', validateApiKey, async (req, res) => {
    let { url, id, nocode } = req.query;

    if (id) {
        try {
            url = Buffer.from(id, 'base64').toString('utf-8');
        } catch (e) {
            return res.status(400).send('Invalid stream ID');
        }
    }

    if (!url) return res.status(400).send('Missing "url" or "id"');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    const hasFFmpeg = await checkFFmpeg();

    if (nocode === 'true' || !hasFFmpeg) {
        try {
            const response = await axios({
                method: 'get', url: url, responseType: 'stream', timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.sofascore.com/',
                    'Origin': 'https://www.sofascore.com',
                    'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-site',
                    'Priority': 'u=1, i', 'Connection': 'keep-alive'
                }
            });
            res.setHeader('Content-Type', response.headers['content-type'] || 'application/json');
            response.data.pipe(res);
            res.on('close', () => response.data.destroy());
            return;
        } catch (error) {
            console.error('[Proxy] Stealth Error:', error.message);
            if (!res.headersSent) res.status(502).send(error.message);
            return;
        }
    }

    // ─── MULTI-USER BROADCASTER MODE ───
    try {
        let broadcaster = broadcastHub.activeStreams.get(url);

        if (broadcaster) {
            console.log(`[Hub] 🟢 Joining existing broadcast for: ${url.substring(0, 30)}...`);
            broadcaster.addClient(res);
        } else {
            // Check resource limit
            if (broadcastHub.activeStreams.size >= broadcastHub.maxUniqueChannels) {
                console.warn(`[Hub] 🔴 Resource limit reached (${broadcastHub.maxUniqueChannels} channels).`);
                return res.status(503).send('Serveur Surchargé: Limite reached.');
            }

            broadcaster = new Broadcaster(url);
            broadcastHub.activeStreams.set(url, broadcaster);
            broadcaster.addClient(res);
        }

        res.on('close', () => {
            broadcaster.removeClient(res);
        });

    } catch (e) {
        console.error('[Proxy] Broadcaster Error:', e.message);
        if (!res.headersSent) res.status(500).send('Hub Error');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Streaming Proxy BROADCASTER (v4 Final hein)
📍 Port     : ${PORT}
🔑 Security : API Key Enabled
📺 Limit    : ${broadcastHub.maxUniqueChannels} Unique Channels
📡 Sync     : Shared Stream Active
    `);
});
