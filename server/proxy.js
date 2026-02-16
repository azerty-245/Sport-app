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

    const iptvUrls = (process.env.IPTV_URL || '').split(',').map(u => u.trim()).filter(u => u);

    if (iptvUrls.length === 0) {
        return res.status(500).send('IPTV_URL not configured on server');
    }

    console.log(`[Proxy] Playlist cache expired. Fetching (${iptvUrls.length} sources available)...`);

    let lastError = null;
    let successData = null;

    for (const url of iptvUrls) {
        try {
            console.log(`[Proxy] Trying source: ${url.substring(0, 60)}...`);
            const response = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': 'VLC/3.0.18' }
            });
            successData = response.data;
            break;
        } catch (error) {
            console.warn(`[Proxy] Source failed ${url.substring(0, 30)}... : ${error.message}`);
            lastError = error;
        }
    }

    if (!successData) {
        return res.status(502).send(`All IPTV sources failed. Last error: ${lastError?.message}`);
    }

    try {
        const lines = successData.split('\n');
        const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('http')) {
                const encodedUrl = Buffer.from(trimmed).toString('base64');
                // IMPORTANT: Append the API Key so the stream request is also authorized
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
        console.error('[Proxy] Rewrite error:', error.message);
        res.status(500).send('Failed to process playlist');
    }
});

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

    console.log(`[Proxy] Requesting: ${url.substring(0, 70)}... (nocode=${!!nocode})`);

    // Standard headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    const hasFFmpeg = await checkFFmpeg();

    // ─── Stealth Mode (Pour SofaScore / APIs) ───
    if (nocode === 'true' || !hasFFmpeg) {
        try {
            console.log(`[Proxy] Ultra-Stealth fetch: ${url.substring(0, 50)}...`);
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                timeout: 15000,
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
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site',
                    'Priority': 'u=1, i',
                    'Connection': 'keep-alive'
                }
            });
            res.setHeader('Content-Type', response.headers['content-type'] || 'application/json');
            response.data.pipe(res);
            res.on('close', () => response.data.destroy());
            return;
        } catch (error) {
            console.error('[Proxy] Stealth Error (Persistent 403?):', error.message);
            if (!res.headersSent) res.status(error.response ? error.response.status : 502).send(error.message);
            return;
        }
    }

    // ─── ULTRA-ROBUST IPTV MODE (Buffer 10MB + Debug Logs) ───
    try {
        console.log(`[Proxy] 🟢 New Stream: ${url.substring(0, 40)}...`);
        console.log(`[Proxy] Settings: Buffer=20MB, Reconnect=Aggressive, Sync=Forced`);

        const ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1',
            '-reconnect_on_http_error', '4xx,5xx',
            '-reconnect_delay_max', '10',
            '-multiple_requests', '1',
            '-fflags', '+genpts+igndts+discardcorrupt',
            '-err_detect', 'ignore_err',
            '-thread_queue_size', '4096',
            '-probesize', '20000000',                     // 20MB for even more stable detection
            '-analyzeduration', '10000000',               // 10s of analysis
            '-headers', 'User-Agent: VLC/3.0.18 LibVLC/3.0.18\r\nConnection: keep-alive\r\n',
            '-i', url,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-af', 'aresample=async=1',
            '-avoid_negative_ts', 'make_zero',
            '-f', 'mpegts', '-muxdelay', '0',
            'pipe:1'
        ]);

        ffmpeg.stderr.on('data', (data) => {
            const msg = data.toString();
            // Log only critical errors or interesting warnings to avoid flooding
            if (msg.includes('error') || msg.includes('timeout') || msg.includes('Corrupt')) {
                console.warn(`[FFmpeg-Diagnostics] ${msg.trim()}`);
            }
        });

        res.setHeader('Content-Type', 'video/mp2t');
        ffmpeg.stdout.pipe(res);

        ffmpeg.on('close', (code) => {
            if (code !== 0 && code !== 255) {
                console.error(`[Proxy] 🔴 Stream FAILED (Code ${code}). Possible provider block or dead URL.`);
            } else {
                console.log(`[Proxy] ⚪ Stream ended normally (Code ${code})`);
            }
            res.end();
        });

        res.on('close', () => {
            console.log('[Proxy] 🟡 Client disconnected (Phone/Browser closed or changed channel)');
            ffmpeg.kill();
        });
    } catch (e) {
        console.error('[Proxy] 🔴 Spawn Error:', e.message);
        if (!res.headersSent) res.status(500).send('FFmpeg Error');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Streaming Proxy UNIFIÉ (Sécurisé + Robuste)
📍 Port : ${PORT}
🔑 Security : API Key Enabled
⏱️  Cache : 6 Hours Enabled
    `);
});
