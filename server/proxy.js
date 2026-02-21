require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const compression = require('compression');

const app = express();

// --- ULTRA-PERMISSIVE CORS MIDDLEWARE (Fix for Web Streaming) ---
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Range, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, X-Chunk-Size');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const PORT = 3005;
const API_KEY = process.env.API_KEY || 'sport-zone-secure-v1';

// CACHE: In-memory storage for the playlist
let playlistCache = {
    data: null,
    timestamp: 0,
    configHash: null
};
let pendingFetch = null; // Prevents duplicate concurrent fetches

const REFRESH_INTERVAL = 1000 * 60 * 60 * 6; // 6 hours
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
        this.hasReceivedData = false;
        this.useFallback = false;
        this.startStream();
    }

    startStream() {
        if (this.url.includes('trycloudflare.com') || this.url.includes('localhost')) return;

        this.hasReceivedData = false;

        this.ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx',
            '-fflags', '+genpts+igndts+discardcorrupt+flush_packets',
            '-flags', '+global_header',
            '-i', this.url,
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
            '-f', 'mpegts', 'pipe:1'
        ]);

        // Timeout: if FFmpeg doesn't produce data within 10s, switch to direct pipe
        this.dataTimeout = setTimeout(() => {
            if (!this.hasReceivedData && this.clients.size > 0) {
                console.warn(`[Proxy] ⏱️ FFmpeg produced no data in 10s for: ${this.url.substring(this.url.lastIndexOf('/') + 1)} — Falling back to direct pipe`);
                this.useFallback = true;
                if (this.ffmpeg) { try { this.ffmpeg.kill('SIGKILL'); } catch (e) { } }
                this.startDirectPipe();
            }
        }, 10000);

        this.ffmpeg.stdout.on('data', (chunk) => {
            if (!this.hasReceivedData) {
                this.hasReceivedData = true;
                clearTimeout(this.dataTimeout);
                console.log(`[Proxy] 📦 First data chunk received (${chunk.length} bytes)`);
            }
            this.status = 'streaming';
            for (const client of this.clients) {
                try {
                    const ready = client.write(chunk);
                    if (!ready) {
                        console.warn(`[Proxy] 🐌 Client Congestion (Backpressure) for ${this.url.substring(this.url.lastIndexOf('/') + 1)}`);
                    }
                } catch (e) { this.clients.delete(client); }
            }
        });

        this.ffmpeg.stderr.on('data', (data) => {
            // Log FFmpeg errors for debugging (only first 200 chars)
            const msg = data.toString().trim();

            // Check for speed (Source health)
            const speedMatch = msg.match(/speed=\s*(\d+\.?\d*)x/);
            if (speedMatch && parseFloat(speedMatch[1]) < 0.9) {
                console.warn(`[Proxy] 🐢 Slow Source: ${speedMatch[0]} for ${this.url.substring(this.url.lastIndexOf('/') + 1)}`);
            }

            if (msg.length > 0 && !msg.startsWith('frame=') && !msg.startsWith('size=')) {
                console.log(`[FFmpeg] ${msg.substring(0, 200)}`);
            }
        });

        const startTime = Date.now();
        this.ffmpeg.on('close', (code) => {
            clearTimeout(this.dataTimeout);
            const duration = Date.now() - startTime;

            if (code !== 0 && !this.useFallback) {
                console.warn(`[Proxy] ⚠️ FFmpeg exited with code ${code} after ${duration}ms`);

                // If FFmpeg fails immediately (< 2000ms), it's likely a bad input causing a crash loop.
                // Switch to direct pipe immediately.
                if (duration < 2000) {
                    console.warn(`[Proxy] 🚨 Immediate FFmpeg failure detected. Switching to Direct Pipe.`);
                    this.useFallback = true;
                    this.startDirectPipe();
                    return;
                }
            }

            if (this.clients.size > 0 && !this.useFallback) {
                console.log(`[Proxy] 🔄 Restarting FFmpeg stream...`);
                setTimeout(() => this.startStream(), 2000);
            } else if (!this.useFallback) {
                this.stopStream();
            }
        });
    }

    // Direct pipe fallback: stream raw bytes from source without FFmpeg
    startDirectPipe() {
        console.log(`[Proxy] 🔁 Direct pipe for: ${this.url.substring(this.url.lastIndexOf('/') + 1)}`);
        this.status = 'direct-pipe';
        axios({
            method: 'get',
            url: this.url,
            responseType: 'stream',
            timeout: 15000,
            headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' }
        }).then(response => {
            this.directStream = response.data;
            response.data.on('data', (chunk) => {
                this.hasReceivedData = true;
                this.status = 'streaming';
                for (const client of this.clients) {
                    try { client.write(chunk); } catch (e) { this.clients.delete(client); }
                }
            });
            response.data.on('end', () => {
                if (this.clients.size > 0) {
                    setTimeout(() => this.startDirectPipe(), 2000);
                } else {
                    this.stopStream();
                }
            });
            response.data.on('error', (err) => {
                console.error(`[Proxy] ❌ Direct pipe error: ${err.message}`);
                this.stopStream();
            });
        }).catch(err => {
            console.error(`[Proxy] ❌ Direct pipe connection failed: ${err.message}`);
            this.stopStream();
        });
    }

    addClient(res) {
        this.clients.add(res);
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache, no-store');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders(); // Send headers immediately so client MediaSource doesn't timeout
        }
    }

    removeClient(res) {
        this.clients.delete(res);
        if (this.clients.size === 0) setTimeout(() => { if (this.clients.size === 0) this.stopStream(); }, 30000);
    }

    stopStream() {
        clearTimeout(this.dataTimeout);
        if (this.ffmpeg) { try { this.ffmpeg.kill('SIGKILL'); } catch (e) { } }
        if (this.directStream) { try { this.directStream.destroy(); } catch (e) { } }
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

// --- HLS SUPPORT (for Safari / iOS which don't have MSE) ---
const hlsSessions = new Map();

function cleanupHlsSession(sessionId) {
    const session = hlsSessions.get(sessionId);
    if (!session) return;
    clearTimeout(session.idleTimer);
    if (session.ffmpeg) { try { session.ffmpeg.kill('SIGKILL'); } catch (e) { } }
    // Clean up temp directory
    try {
        const files = fs.readdirSync(session.dir);
        for (const f of files) { fs.unlinkSync(path.join(session.dir, f)); }
        fs.rmdirSync(session.dir);
    } catch (e) { }
    hlsSessions.delete(sessionId);
    console.log(`[HLS] 🧹 Session ${sessionId} cleaned up`);
}

app.get('/hls', validateApiKey, async (req, res) => {
    let { url, id } = req.query;
    if (id) url = Buffer.from(id, 'base64').toString('utf-8');
    if (!url) return res.status(400).send('Missing url');

    // Create a unique session
    const sessionId = crypto.randomBytes(8).toString('hex');
    const hlsDir = path.join(os.tmpdir(), `hls-${sessionId}`);
    fs.mkdirSync(hlsDir, { recursive: true });

    const playlistPath = path.join(hlsDir, 'live.m3u8');

    // Spawn FFmpeg with HLS output
    const ffmpeg = spawn('ffmpeg', [
        '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
        '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx',
        '-fflags', '+genpts+igndts+discardcorrupt',
        '-i', url,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '2',              // 2-second segments
        '-hls_list_size', '10',         // Keep last 10 segments in playlist
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', path.join(hlsDir, 'seg%03d.ts'),
        playlistPath
    ]);

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg.length > 0 && !msg.startsWith('frame=') && !msg.startsWith('size=')) {
            console.log(`[HLS-FFmpeg] ${msg.substring(0, 200)}`);
        }
    });

    ffmpeg.on('close', (code) => {
        console.log(`[HLS] FFmpeg exited with code ${code} for session ${sessionId}`);
        // Don't clean up immediately — client may still be fetching last segments
        setTimeout(() => cleanupHlsSession(sessionId), 10000);
    });

    // Auto-cleanup after 60s idle
    const idleTimer = setTimeout(() => cleanupHlsSession(sessionId), 60000);

    hlsSessions.set(sessionId, { ffmpeg, dir: hlsDir, idleTimer, url });

    // Wait for the .m3u8 file to appear (FFmpeg needs to process first segment)
    const maxWait = 15000;
    const start = Date.now();
    const waitForPlaylist = () => {
        return new Promise((resolve, reject) => {
            const check = () => {
                if (fs.existsSync(playlistPath)) {
                    resolve();
                } else if (Date.now() - start > maxWait) {
                    reject(new Error('HLS playlist timeout'));
                } else {
                    setTimeout(check, 300);
                }
            };
            check();
        });
    };

    try {
        await waitForPlaylist();
        // Return the session info — client will request segments from /hls-data/
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        res.json({
            session: sessionId,
            playlist: `${baseUrl}/hls-data/${sessionId}/live.m3u8?key=${API_KEY}`
        });
    } catch (e) {
        console.error(`[HLS] ❌ Failed to start: ${e.message}`);
        cleanupHlsSession(sessionId);
        res.status(502).send('HLS stream failed to start');
    }
});

// Serve HLS segments and playlist
app.get('/hls-data/:session/:file', validateApiKey, (req, res) => {
    const { session, file } = req.params;
    const sessionData = hlsSessions.get(session);
    if (!sessionData) return res.status(404).send('Session expired');

    // Reset idle timer on every request
    clearTimeout(sessionData.idleTimer);
    sessionData.idleTimer = setTimeout(() => cleanupHlsSession(session), 60000);

    const filePath = path.join(sessionData.dir, file);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

    // Set correct content types
    if (file.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');

        // Rewrite segment URLs in playlist to include full path + API key
        let content = fs.readFileSync(filePath, 'utf-8');
        content = content.replace(/(seg\d+\.ts)/g, `/hls-data/${session}/$1?key=${API_KEY}`);
        res.send(content);
    } else if (file.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Cache-Control', 'max-age=3600');
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.status(400).send('Invalid file type');
    }
});

// --- JSON PROXY for Sofascore Fallback ---
app.get('/json', validateApiKey, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');

    try {
        console.log(`[Proxy] 🌍 JSON Fetch: ${url}`);
        const response = await axios.get(url, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://www.sofascore.com/',
                'Origin': 'https://www.sofascore.com'
            }
        });

        // Explicit CORS for JSON
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        res.json(response.data);
    } catch (e) {
        console.error(`[Proxy] ❌ JSON Error: ${e.message}`);
        if (e.response) {
            res.status(e.response.status).send(e.response.data);
        } else {
            res.status(502).send('Error fetching JSON');
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy Active on Port: ${PORT}`);
});
