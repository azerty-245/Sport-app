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

    const forcedSource = req.query.src !== undefined ? parseInt(req.query.src) : null;
    const iptvUrls = (process.env.IPTV_URL || '').split(',').map(u => u.trim()).filter(u => u);

    if (iptvUrls.length === 0) return res.status(500).send('IPTV_URL not configured');

    const sourcesToFetch = (forcedSource !== null && forcedSource < iptvUrls.length)
        ? [iptvUrls[forcedSource]]
        : iptvUrls;

    console.log(`[Proxy] Fetching Playlist (Source: ${forcedSource !== null ? forcedSource : 'Auto'})...`);

    let successData = null;
    let usedIndex = -1;

    const userAgents = [
        'VLC/3.0.18 LibVLC/3.0.18',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'IPTVCore/3.0',
        'OttPlayer/2.1'
    ];

    for (let i = 0; i < sourcesToFetch.length; i++) {
        const url = sourcesToFetch[i];
        try {
            const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
            const response = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': randomUA }
            });
            successData = response.data;
            usedIndex = forcedSource !== null ? forcedSource : i;
            break;
        } catch (error) {
            console.warn(`[Proxy] Source ${i} failed: ${error.message}`);
        }
    }

    if (!successData) return res.status(502).send('All IPTV sources failed.');

    try {
        const lines = successData.split('\n');
        const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('http')) {
                const encodedUrl = Buffer.from(trimmed).toString('base64');
                return `/stream?id=${encodedUrl}&key=${API_KEY}&src=${usedIndex}`;
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
        console.error('[Proxy] Rewrite error:', error.message);
        res.status(500).send('Failed to process playlist');
    }
});

// --- BROADCASTER HUB: Multi-user stream sharing ---
const broadcastHub = {
    activeStreams: new Map(), // URL -> Broadcaster instance
    maxUniqueChannels: 8      // Safety limit for 1GB RAM VM
};

class Broadcaster {
    constructor(url, sourceName = 'AUTO') {
        this.url = url;
        this.sourceName = sourceName;
        this.clients = new Set();
        this.ffmpeg = null;
        this.status = 'starting';
        this.cleanupTimer = null;
        this.errorCount = 0;
        this.startStream();
    }

    startStream() {
        console.log(`[Broadcaster] 📡 START | Source: ${this.sourceName} | URL: ${this.url.substring(0, 50)}...`);

        const userAgents = [
            'VLC/3.0.18 LibVLC/3.0.18',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'IPTVCore/3.0',
            'OttPlayer/2.1'
        ];
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

        this.ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx',
            '-reconnect_delay_max', '15',
            '-multiple_requests', '1',
            '-fflags', '+genpts+igndts+discardcorrupt',
            '-err_detect', 'ignore_err',
            '-thread_queue_size', '8192',
            '-probesize', '5000000',
            '-analyzeduration', '5000000',
            '-headers', `User-Agent: ${randomUA}\r\nConnection: keep-alive\r\n`,
            '-i', this.url,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-af', 'aresample=async=1',
            '-avoid_negative_ts', 'make_zero',
            '-f', 'mpegts', '-muxdelay', '0',
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
            if (msg.includes('error') || msg.includes('timeout') || msg.includes('502')) {
                this.errorCount++;
                console.warn(`[DIAG-SRC-${this.sourceName}] 🔴 ${msg.trim()}`);
            }
        });

        this.ffmpeg.on('close', (code) => {
            console.log(`[Broadcaster] ⚪ End (Code ${code}) | Errors: ${this.errorCount} | Source: ${this.sourceName}`);
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
        res.setHeader('X-Broadcast-Status', 'Active');
        console.log(`[Broadcaster] 👥 Join | Clients: ${this.clients.size} | Src: ${this.sourceName}`);
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
    let { url, id, nocode, src } = req.query;

    if (id) {
        try {
            url = Buffer.from(id, 'base64').toString('utf-8');
        } catch (e) {
            return res.status(400).send('Invalid stream ID');
        }
    }

    if (!url) return res.status(400).send('Missing "url" or "id"');

    // Standard headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    const hasFFmpeg = await checkFFmpeg();

    // ─── Stealth Mode (SofaScore / APIs) ───
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
                return res.status(503).send('Serveur Surchargé: Limite de 8 chaînes simultanées atteinte.');
            }

            broadcaster = new Broadcaster(url, src);
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
🚀 Streaming Proxy BROADCASTER (v4.1)
📍 Port     : ${PORT}
🔑 Security : API Key Enabled
📺 Limit    : ${broadcastHub.maxUniqueChannels} Channels
📡 Sync     : Multi-Source Testing Active (?src=0,1,2,3)
    `);
});
