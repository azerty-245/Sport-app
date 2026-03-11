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

// --- SECURE & PERMISSIVE CORS (Standardized) ---
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Range', 'Authorization'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'X-Chunk-Size'],
    credentials: false
}));

// --- PAYLOAD COMPRESSION (Selective) ---
// We compress JSON/Text but NEVER video streams
app.use(compression({
    filter: (req, res) => {
        const contentType = res.getHeader('Content-Type');
        if (contentType && (contentType.includes('video') || contentType.includes('mpegts'))) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

const PORT = 3005;
const API_KEY = process.env.API_KEY || 'sport-zone-secure-v1';

// CACHE: In-memory storage for the playlist
let playlistCache = {
    data: null,
    timestamp: 0,
    configHash: null
};
let pendingFetch = null; // Prevents duplicate concurrent fetches
const urlMap = new Map(); // UUID -> Original IPTV URL (Security)

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
    // Sources are now managed entirely through the IPTV_URL environment variable (comma-separated)
    let iptvUrls = (process.env.IPTV_URL || '').split(',').map(u => u.trim()).filter(u => u);

    if (iptvUrls.length === 0) {
        console.error('[Proxy] No IPTV_URL configured in .env');
        return false;
    }

    console.log(`[Proxy] 🔄 Refreshing Playlist with ${iptvUrls.length} sources...`);
    const start = Date.now();

    const allFilteredLines = ['#EXTM3U'];
    let sourceSuccess = false;

    for (let i = 0; i < iptvUrls.length; i++) {
        const url = iptvUrls[i];
        try {
            const domain = new URL(url).hostname;
            console.log(`[Proxy] 📡 Fetching source ${i + 1}/${iptvUrls.length}: ${domain}...`);
            const response = await axios.get(url, {
                timeout: 150000,
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (!response.data || !response.data.trim().startsWith('#EXTM3U')) {
                console.warn(`[Proxy] ⚠️ Source ${i + 1} skipped: Invalid M3U format`);
                continue;
            }

            const lines = response.data.split('\n');
            let currentExtInfo = null;
            let sourceCount = 0;

            for (let j = 0; j < lines.length; j++) {
                const line = lines[j].trim();
                if (line.startsWith('#EXTINF:')) {
                    currentExtInfo = line;
                } else if (line.startsWith('http') && currentExtInfo) {
                    const infoUpper = currentExtInfo.toUpperCase();

                    // Extract display name (after last comma) and group-title separately
                    const namePart = currentExtInfo.split(',').pop().trim().toUpperCase();
                    const groupMatch2 = currentExtInfo.match(/group-title="([^"]*)"/i);
                    const groupTitle = groupMatch2 ? groupMatch2[1].toUpperCase() : '';

                    // --- STRICT WHITELIST: Only French channels ---
                    const isFiller = namePart.includes('EROTI') || groupTitle.includes('XXX') || groupTitle.includes('ADULT') || groupTitle.includes('EROTI') || groupTitle.includes('PORNO') || infoUpper.includes('PRODUITS') || infoUpper.includes('SURPRISE') || infoUpper.includes('BOUTIQUE') || infoUpper.includes('VOD') || infoUpper.includes('LOOP') || infoUpper.includes('BOX OFFICE') || infoUpper.includes('A LA CARTE') || infoUpper.includes('24/7');

                    if (isFiller) {
                        currentExtInfo = null;
                        continue;
                    }

                    // Strict exclusion for international prefixes (Spain, India, USA, etc.)
                    const isInternationalPrefix = /^(ES|IN|US|AR|TR|DE|UK|PT|IT|BE|AL|TH|PL|RO|RU|GR)[:| -]/i.test(namePart);

                    // Check if channel name itself indicates French
                    const nameIsFrench = namePart.startsWith('FR:') || namePart.includes('FR |') || namePart.includes('FR -') || namePart.includes('(FR)') || namePart.includes('FRANCE');

                    // Check if the display name contains a known French brand
                    const nameIsFrenchBrand = namePart.includes('CANAL+') || namePart.includes('BEIN') || namePart.includes('RMC') || namePart.includes('TF1') || namePart.includes('FRANCE 2') || namePart.includes('FRANCE 3') || namePart.includes('FRANCE 4') || namePart.includes('FRANCE 5') || namePart.includes('M6') || namePart.includes('ARTE') || namePart.includes('TMC') || namePart.includes('NRJ') || namePart.includes('W9') || namePart.includes('C8') || namePart.includes('CSTAR') || namePart.includes('EQUIPE') || namePart.includes('BFM') || namePart.includes('CNEWS') || namePart.includes('LCI') || namePart.includes('DAZN') || namePart.includes('EUROSPORT') || namePart.includes('CINE+') || namePart.includes('CINÉ+') || namePart.includes('PLANETE') || namePart.includes('PLANÈTE') || namePart.includes('CHERIE') || namePart.includes('GULLI') || namePart.includes('PARIS PREMIERE') || namePart.includes('OCS') || namePart.includes('TCM') || namePart.includes('GAME ONE') || namePart.includes('TELETOON') || namePart.includes('BOOMERANG') || namePart.includes('NICKELODEON') || namePart.includes('CARTOON') || namePart.includes('DISNEY') || namePart.includes('MANGA') || namePart.includes('ANIME') || namePart.includes('J-ONE') || namePart.includes('SPORT EN FRANCE');

                    // Explicitly whitelist clean, live TV groups
                    const groupTitleClean = groupTitle.trim().toUpperCase();
                    const groupIsFrenchLive = (
                        groupTitleClean === 'FRANCE' ||
                        groupTitleClean === 'CANADA FRENCH' ||
                        groupTitleClean === 'FR' ||
                        groupTitleClean === 'FRENCH' ||
                        groupTitleClean === 'FRANCE TV' ||
                        groupTitleClean === 'SPORT FR' ||
                        groupTitleClean === 'SPORTS FR'
                    );

                    // Filter out clearly international networks
                    const nameIsInternational = /\b(STARZ|STARZPLAY|AD[ -]?SPORT|STC |WEDO|MBC|ROTANA|OSN|SSC|TATA|SONY LIV|ZEE|STAR PLUS|SKY SPORTS|BT SPORT|DISNEY\+)\b/i.test(namePart);
                    const groupIsInternational = /\b(ARABIC|ARAB|USA|UK|ITALY|LATINO|MLB|COLOMBIA|URUGUAY|CARIBBEAN|ISLAMIC|ESPA|SPAIN|INDIA|GERMAN|ALGERIA|MOROCCO|TUNISIA)\b/i.test(groupTitleClean);

                    // LOGIC: To keep a channel, it MUST be French-related AND NOT have an international prefix
                    let keep = false;
                    if (nameIsFrench || groupIsFrenchLive) {
                        keep = true;
                    } else if (nameIsFrenchBrand && !isInternationalPrefix) {
                        keep = true;
                    }

                    if (nameIsInternational || groupIsInternational || isInternationalPrefix) {
                        keep = false; // Override: If it's a foreign bouquet, brand, or prefix, drop it
                    }

                    // Strict exclusion for VOD/VOD-like categories
                    if (groupTitleClean.includes('VOD') || groupTitleClean.includes('MOVIE') || groupTitleClean.includes('SERIE') || groupTitleClean.includes('EXTRA -') || groupTitleClean.includes('NETFLIX') || groupTitleClean.includes('PRIME')) {
                        keep = false;
                    }

                    if (keep) {
                        // MINIFICATION: Strip redundant tags to save bandwidth
                        // We keep tvg-logo and the display name, everything else is usually used only by the backend.
                        let minifiedInfo = currentExtInfo;
                        const logoMatch = currentExtInfo.match(/tvg-logo="([^"]*)"/i);
                        const groupMatch = currentExtInfo.match(/group-title="([^"]*)"/i);
                        const nameParts = currentExtInfo.split(',');
                        const displayName = nameParts[nameParts.length - 1];

                        minifiedInfo = `#EXTINF:-1`;
                        if (logoMatch) minifiedInfo += ` tvg-logo="${logoMatch[1]}"`;
                        if (groupMatch) minifiedInfo += ` group-title="${groupMatch[1]}"`;
                        minifiedInfo += `,${displayName}`;

                        allFilteredLines.push(minifiedInfo);
                        const streamUuid = crypto.randomUUID();
                        urlMap.set(streamUuid, line);
                        allFilteredLines.push(`/stream?id=${streamUuid}&key=${API_KEY}`);
                        sourceCount++;
                    }
                    currentExtInfo = null;
                }
            }
            console.log(`[Proxy] ✅ Source ${i + 1} processed: ${sourceCount} channels kept.`);
            sourceSuccess = true;
        } catch (error) {
            console.error(`[Proxy] ⚠️ Source ${i + 1} failed: ${error.message}`);
        }
    }

    if (sourceSuccess) {
        const finalOutput = allFilteredLines.join('\n');
        playlistCache.data = finalOutput;
        playlistCache.timestamp = Date.now();
        playlistCache.configHash = process.env.IPTV_URL;
        console.log(`[Proxy] 🏆 Global Playlist Updated! Total Size: ${(finalOutput.length / 1024).toFixed(2)} KB. Total Duration: ${Date.now() - start}ms`);
        return true;
    }

    return false;
};

// Start Background Refresh Loop
if (process.env.IPTV_URL) {
    fetchPlaylist();
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
            '-user_agent', 'VLC/3.0.18 LibVLC/3.0.18',
            '-err_detect', 'ignore_err',
            '-probesize', '1000000', '-analyzeduration', '2000000',
            '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '301,302,4xx,5xx',
            '-fflags', '+genpts+igndts+discardcorrupt+flush_packets+nobuffer',
            '-flags', '+global_header',
            '-stream_loop', '-1',
            '-i', this.url,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-af', 'aresample=async=1',
            '-muxdelay', '0', '-muxpreload', '0',
            '-f', 'mpegts', 'pipe:1'
        ]);

        // Timeout: if FFmpeg doesn't produce data within 25s, restart the process
        this.dataTimeout = setTimeout(() => {
            if (!this.hasReceivedData && this.clients.size > 0) {
                console.warn(`[Proxy] ⏱️ FFmpeg produced no data in 25s for: ${this.url.substring(this.url.lastIndexOf('/') + 1)} — Restarting stream`);
                this.stopStream(); // stopStream will disconnect clients, client will auto-retry
            }
        }, 25000);

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
            if (speedMatch && parseFloat(speedMatch[1]) < 0.85) {
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

            if (code !== 0) {
                console.warn(`[Proxy] ⚠️ FFmpeg exited with code ${code} after ${duration}ms`);

                if (duration < 2000) {
                    console.warn(`[Proxy] 🚨 Immediate FFmpeg failure detected.`);

                    // Tell all waiting clients that the stream is dead.
                    for (const res of this.clients) {
                        if (!res.headersSent) {
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.status(502).send('Upstream Source Offline or Failed');
                        }
                    }
                    this.stopStream();
                    return;
                }
            }

            if (this.clients.size > 0) {
                console.log(`[Proxy] 🔄 Restarting FFmpeg stream...`);
                setTimeout(() => this.startStream(), 2000);
            } else {
                this.stopStream();
            }
        });
    }

    addClient(res) {
        this.clients.add(res);
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Cache-Control', 'no-cache, no-store');
            res.setHeader('Connection', 'keep-alive');
            // Access-Control-Allow-Origin is already set by CORS middleware at top
            res.flushHeaders(); // Send headers immediately so client MediaSource doesn't timeout
        }
    }

    removeClient(res) {
        this.clients.delete(res);
        try { res.end(); } catch (e) { }
        if (this.clients.size === 0) setTimeout(() => { if (this.clients.size === 0) this.stopStream(); }, 2000);
    }

    stopStream() {
        clearTimeout(this.dataTimeout);
        if (this.ffmpeg) { try { this.ffmpeg.kill('SIGKILL'); } catch (e) { } }
        for (const client of this.clients) {
            try { client.end(); } catch (e) { }
        }
        this.clients.clear();
        broadcastHub.activeStreams.delete(this.url);
    }
}

app.get('/stream', validateApiKey, async (req, res) => {
    let { url, id, nocode } = req.query;

    // UUID Lookup (Security: ID is now a UUID, not Base64)
    if (id) {
        const mappedUrl = urlMap.get(id);
        if (mappedUrl) {
            url = mappedUrl;
        } else {
            // Fallback to legacy base64 if not in map (prevents breaking cache on restart)
            try { url = Buffer.from(id, 'base64').toString('utf-8'); } catch (e) { }
        }
    }

    if (!url || !url.startsWith('http')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).send('Invalid or expired stream ID');
    }

    if (nocode === 'true') {
        try {
            const response = await axios({
                method: 'get',
                url,
                responseType: 'stream',
                timeout: 10000,
                headers: { 'User-Agent': 'IPTVSmarters' }
            });
            res.setHeader('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
        } catch (e) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.status(502).send('Gateway Error');
        }
        return;
    }

    let broadcaster = broadcastHub.activeStreams.get(url);
    if (!broadcaster) {
        if (broadcastHub.activeStreams.size >= MAX_UNIQUE_CHANNELS) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(503).send('Server Busy');
        }

        // Log only channel ID to prevent URL leak
        const channelId = url.substring(url.lastIndexOf('/') + 1);
        console.log(`[Proxy] 🎥 Starting NEW Broadcaster for: ${channelId}`);
        broadcaster = new Broadcaster(url);
        broadcastHub.activeStreams.set(url, broadcaster);
    }

    // Safety timeout for header wait
    const safetyTimeout = setTimeout(() => {
        if (!res.headersSent) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.status(504).send('Stream Timeout');
        }
    }, 20000);

    const onDataReady = () => {
        clearTimeout(safetyTimeout);
        if (!res.headersSent) broadcaster.addClient(res);
    };

    // If already streaming, join immediately
    if (broadcaster.hasReceivedData) {
        onDataReady();
    } else {
        // Listen for the first chunk to trigger headers
        const originalAddClient = broadcaster.addClient;
        broadcaster.clients.add(res);

        // We override write for this specific response to trigger headers on first data
        const originalWrite = res.write;
        res.write = function (chunk) {
            // ONLY trigger video headers if the response is still healthy (200 OK)
            // If it's a 502/504, we want to send the raw error text, not binary headers
            if (!res.headersSent && res.statusCode === 200) {
                broadcaster.addClient(res);
            }
            return originalWrite.apply(this, arguments);
        };
    }

    res.on('close', () => {
        clearTimeout(safetyTimeout);
        broadcaster.removeClient(res);
    });
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
        '-user_agent', 'VLC/3.0.18 LibVLC/3.0.18', // UA added
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
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.sofascore.com/',
                'Origin': 'https://www.sofascore.com',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
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
