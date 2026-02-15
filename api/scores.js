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
            // Remove headers that might trigger anti-scraping/CORS protection
            proxyReq.removeHeader('Referer');
            proxyReq.removeHeader('Origin');
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        },
        onProxyRes: (proxyRes, req, res) => {
            // Add CORS headers to allow browser access
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
    });

    return proxy(req, res);
};
