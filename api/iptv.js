const axios = require('axios');

const VM_PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL || 'http://152.70.45.91:3005';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || 'sport-zone-secure-v1';

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Extract the sub-path: /api/iptv/playlist -> /playlist
    const subPath = req.url.replace(/^\/?api\/iptv/, '') || '/';
    const targetUrl = `${VM_PROXY_URL}${subPath}`;

    // Forward API key
    const headers = {
        'X-API-Key': req.headers['x-api-key'] || req.query.key || API_KEY,
        'User-Agent': 'Vercel-Proxy/1.0'
    };

    try {
        const response = await axios({
            method: req.method || 'GET',
            url: targetUrl,
            headers,
            params: req.query,
            timeout: 8000, // 8s hard limit (Vercel cuts at 10s)
            responseType: 'arraybuffer', // Handle binary and text uniformly
            validateStatus: () => true, // Don't throw on 4xx/5xx
        });

        // Forward response headers
        res.status(response.status);
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-encoding']) {
            res.setHeader('Content-Encoding', response.headers['content-encoding']);
        }

        return res.send(Buffer.from(response.data));

    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return res.status(504).json({ error: 'VM proxy timeout', code: 'TIMEOUT' });
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return res.status(502).json({ error: 'VM unreachable', code: 'VM_DOWN' });
        }
        console.error('[Vercel Proxy] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
