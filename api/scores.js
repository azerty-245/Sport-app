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
        onProxyRes: (proxyRes, req, res) => {
            // Add CORS headers
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
    });

    return proxy(req, res);
};
