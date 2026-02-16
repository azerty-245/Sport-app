const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = (req, res) => {
    const target = process.env.EXPO_PUBLIC_PROXY_URL;

    if (!target) {
        res.status(500).json({ error: 'EXPO_PUBLIC_PROXY_URL not defined on Vercel' });
        return;
    }

    // Default proxy: everything sent to /api/iptv/* is forwarded to Oracle:*/*
    const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: {
            '^/api/iptv': '',
        },
        onProxyRes: (proxyRes) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
        onProxyReq: (proxyReq) => {
            // Automatically add the API Key for all proxied requests to Oracle
            const apiKey = process.env.EXPO_PUBLIC_API_KEY || 'sport-zone-secure-v1';
            proxyReq.setHeader('x-api-key', apiKey);
        },
    });

    return proxy(req, res);
};
