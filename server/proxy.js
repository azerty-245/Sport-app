require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const PORT = 3005;

app.use(cors());

// Helper to check if FFmpeg is available
const checkFFmpeg = () => {
    return new Promise((resolve) => {
        const check = spawn('ffmpeg', ['-version']);
        check.on('error', () => resolve(false));
        check.on('close', (code) => resolve(code === 0));
    });
};

app.get('/playlist', async (req, res) => {
    // Allows comma-separated URLs in IPTV_URL environment variable
    const iptvUrls = (process.env.IPTV_URL || '').split(',').map(u => u.trim()).filter(u => u);

    if (iptvUrls.length === 0) {
        return res.status(500).send('IPTV_URL not configured on server');
    }

    console.log(`[Proxy] Fetching playlist (${iptvUrls.length} sources available)...`);

    let lastError = null;
    let successData = null;

    // Try each URL until one works
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
                return `/stream?id=${encodedUrl}`;
            }
            return line;
        });

        res.setHeader('Content-Type', 'text/plain');
        res.send(rewrittenLines.join('\n'));
    } catch (error) {
        console.error('[Proxy] Rewrite error:', error.message);
        res.status(500).send('Failed to process playlist');
    }
});

app.get('/stream', async (req, res) => {
    let { url, id } = req.query;

    if (id) {
        try {
            url = Buffer.from(id, 'base64').toString('utf-8');
        } catch (e) {
            return res.status(400).send('Invalid stream ID');
        }
    }

    if (!url) return res.status(400).send('Missing "url" or "id"');

    console.log(`[Proxy] Streaming: ${url.substring(0, 70)}...`);

    // Standard headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    const hasFFmpeg = await checkFFmpeg();

    if (hasFFmpeg) {
        // ─── FFmpeg Transcoding Mode (Best for Audio) ───
        try {
            console.log('[Proxy] FFmpeg detected. Transcoding audio to AAC...');
            res.setHeader('Content-Type', 'video/mp2t');

            const ffmpeg = spawn('ffmpeg', [
                '-reconnect', '1',
                '-reconnect_at_eof', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5', // 5s max delay for reconnection
                '-probesize', '5000000',      // 5MB probe for stability
                '-analyzeduration', '5000000', // 5s analysis for smooth start
                '-i', url,
                '-c:v', 'copy',     // Keep video as-is (Fast!)
                '-c:a', 'aac',      // Convert audio to AAC (Web compatible)
                '-b:a', '128k',
                '-f', 'mpegts',
                'pipe:1'
            ]);

            ffmpeg.stdout.pipe(res);

            ffmpeg.stderr.on('data', (d) => { /* console.log(d.toString()) */ });

            ffmpeg.on('close', (code) => {
                console.log(`[FFmpeg] Exited with code ${code}`);
                res.end();
            });

            res.on('close', () => {
                console.log('[Proxy] Client disconnected (FFmpeg)');
                ffmpeg.kill();
            });
            return;

        } catch (e) {
            console.error('[Proxy] FFmpeg error, falling back to direct pipe:', e);
        }
    }

    // ─── Fallback: Direct Pipe (No Audio Fix) ───
    try {
        console.log('[Proxy] FFmpeg NOT found. Using direct pipe (Audio might be incompatible).');

        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 10000,
            headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' }
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
        response.data.pipe(res);

        response.data.on('error', (err) => {
            console.error('[Proxy] Stream error:', err.message);
            res.end();
        });

        res.on('close', () => {
            console.log('[Proxy] Client disconnected (Direct)');
            response.data.destroy();
        });

    } catch (error) {
        console.error('[Proxy] Connection failed:', error.message);
        if (!res.headersSent) res.status(502).send('Bad Gateway');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Streaming Proxy running at http://localhost:${PORT}
👉 Usage: http://localhost:${PORT}/stream?url=YOUR_IPTV_URL
⚠️  FFmpeg Check: ${'Checking on first request...'}
    `);
});
