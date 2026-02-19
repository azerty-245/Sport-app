const axios = require('axios');

const API_KEY = process.env.EXPO_PUBLIC_API_KEY || 'sport-zone-secure-v1';

// Hardcoded fallback tunnel (Update this if proxy.js generates a new one)
const FALLBACK_TUNNEL = 'https://determined-satisfaction-richard-seeks.trycloudflare.com';

// Intelligent Proxy Selection: Ignore raw IP if it matches the blocked Oracle IP
const getBaseUrl = (req) => {
    const clientTunnel = req.headers['x-vm-tunnel'];
    if (clientTunnel && clientTunnel.startsWith('http')) return clientTunnel.replace(/\/$/, '');

    const envProxy = process.env.EXPO_PUBLIC_PROXY_URL;
    if (envProxy && envProxy.startsWith('http') && !envProxy.includes('152.70.45.91')) {
        return envProxy.replace(/\/$/, '');
    }

    return FALLBACK_TUNNEL;
};

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Range');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // NEW: Direct JSON fetch from Vercel (Bypass VM)
    // Usage: /api/iptv/json?url=https://target-api.com...
    if (req.url.includes('/json')) {
        const { url } = req.query;
        if (!url) return res.status(400).send('Missing url');
        try {
            console.log(`[Vercel Proxy] Direct JSON Fetch: ${url}`);
            const response = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://www.sofascore.com/',
                    'Origin': 'https://www.sofascore.com'
                }
            });
            return res.status(200).json(response.data);
        } catch (e) {
            console.error(`[Vercel Proxy] Direct JSON Error: ${e.message}`);
            return res.status(502).json({ error: 'Direct fetch failed', message: e.message });
        }
    }

    // Intelligent routing: Choose the best viable VM path
    const baseUrl = getBaseUrl(req);

    // Extract ONLY the path without query: /api/iptv/playlist?key=... -> /playlist
    // We handle the query params via axios.params
    const cleanPath = req.url.split('?')[0].replace(/^\/?api\/iptv/, '') || '/';
    const targetUrl = `${baseUrl}${cleanPath}`;

    console.log(`[Vercel Proxy] Routing: ${cleanPath} -> ${targetUrl} (via ${req.headers['x-vm-tunnel'] ? 'Header' : 'Default'})`);
    const start = Date.now();

    // Forward API key
    const headers = {
        'X-API-Key': req.headers['x-api-key'] || req.query.key || API_KEY,
        'User-Agent': 'Vercel-Proxy/1.0',
        'X-Vercel-Proxy': 'true'
    };

    try {
        const response = await axios({
            method: req.method || 'GET',
            url: targetUrl,
            headers,
            params: req.query,
            timeout: 9000, // 9s (Vercel cuts at 10s)
            responseType: 'arraybuffer', // Handle binary and text uniformly
            validateStatus: () => true, // Don't throw on 4xx/5xx
        });

        console.log(`[Vercel Proxy] ✅ Success: ${cleanPath} (${response.status}) in ${Date.now() - start}ms - Size: ${response.data.byteLength} bytes`);

        // Forward response headers
        res.setHeader('X-Proxy-Target', targetUrl);
        res.setHeader('X-Proxy-Size', response.data.byteLength);
        res.status(response.status);
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-encoding']) {
            res.setHeader('Content-Encoding', response.headers['content-encoding']);
        }

        return res.send(Buffer.from(response.data));

    } catch (error) {
        res.setHeader('X-Proxy-Target', targetUrl);
        res.setHeader('X-Proxy-Error', error.message || 'Unknown');

        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            res.setHeader('X-Proxy-Code', 'TIMEOUT');
            return res.status(504).json({ error: 'VM proxy timeout', code: 'TIMEOUT', target: targetUrl });
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            res.setHeader('X-Proxy-Code', 'DOWN');
            return res.status(502).json({ error: 'VM unreachable', code: 'VM_DOWN', target: targetUrl });
        }
        console.error('[Vercel Proxy] Error:', error.message);
        res.setHeader('X-Proxy-Code', 'ERROR');
        return res.status(500).json({ error: error.message, target: targetUrl });
    }
};
