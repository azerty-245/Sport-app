const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const PORT = 3005;

app.use(cors());

app.get('/stream', async (req, res) => {
    const { url, nocode } = req.query;
    if (!url) return res.status(400).send('Missing "url"');
    
    console.log(`[Proxy] Request for: ${url.substring(0, 50)}...`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    if (nocode === 'true' || url.includes('.m3u')) {
        console.log('[Proxy] Mode Direct (Playlist)');
        try {
            const response = await axios({ method: 'get', url: url, responseType: 'stream', timeout: 10000 });
            response.data.pipe(res);
        } catch (e) { res.status(500).send('Error fetching playlist'); }
    } else {
        console.log('[Proxy] Mode Transcodage (Audio AAC + Reconnexion)');
        res.setHeader('Content-Type', 'video/mp2t');

        // --- Proxy v3 : Ajout des options de robustesse ---
        const ffmpeg = spawn('ffmpeg', [
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '2',
            '-i', url,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-f', 'mpegts',
            'pipe:1'
        ]);

        ffmpeg.stdout.pipe(res);
        
        ffmpeg.on('close', (code) => {
            console.log(`[FFmpeg] Closed with code ${code}`);
            res.end();
        });

        res.on('close', () => {
            console.log('[Proxy] Client closed connection, killing FFmpeg');
            ffmpeg.kill();
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Cloud Proxy v3 (Robust) running at http://152.70.45.91:${PORT}`);
});
