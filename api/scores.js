const { createProxyMiddleware } = require('http-proxy-middleware');

// Vercel Serverless Function to proxy requests to SofaScore API
// Bypasses CORS 403 errors on Web.

module.exports = (req, res) => {
    const target = 'https://api.sofascore.com';

    const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: {
            '^/api/scores': '/api/v1', // Map /api/scores to /api/v1
        },
        onProxyReq: (proxyReq, req, res) => {
            // Mimic a real browser request more closely
            proxyReq.removeHeader('Referer');
            proxyReq.removeHeader('Origin');
            proxyReq.setHeader('Host', 'api.sofascore.com');
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            proxyReq.setHeader('Accept', 'application/json, text/plain, */*');
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
        },
        onProxyRes: (proxyRes, req, res) => {
            // Add CORS headers to allow browser access
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
    });

    return proxy(req, res);
};
