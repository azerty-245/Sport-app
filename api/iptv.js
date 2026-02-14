const { createProxyMiddleware } = require('http-proxy-middleware');

// Vercel Serverless Function to proxy requests to Oracle Cloud Proxy (HTTP)
// This allows the HTTPS Vercel site to talk to the HTTP proxy without Mixed Content errors.

module.exports = (req, res) => {
    const target = process.env.EXPO_PUBLIC_PROXY_URL; // http://152.70.45.91:3005

    if (!target) {
        res.status(500).json({ error: 'EXPO_PUBLIC_PROXY_URL not defined' });
        return;
    }

    // Create proxy
    const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: {
            '^/api/iptv': '', // Remove /api/iptv prefix when forwarding
        },
        onProxyRes: (proxyRes, req, res) => {
            // Add CORS headers to allow browser access
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
    });

    return proxy(req, res);
};
