// add_json_proxy.js - Add /json endpoint to VM proxy for Sofascore fallback
const fs = require('fs');
const path = '/home/ubuntu/sport-app-sync/proxy.js';
let code = fs.readFileSync(path, 'utf-8');

// The new /json handler code
const jsonHandler = `
// --- JSON PROXY for Sofascore Fallback ---
app.get('/json', validateApiKey, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');

    try {
        console.log(\`[Proxy] 🌍 JSON Fetch: \${url}\`);
        const response = await axios.get(url, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://www.sofascore.com/',
                'Origin': 'https://www.sofascore.com'
            }
        });
        
        // Explicit CORS for JSON
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        
        res.json(response.data);
    } catch (e) {
        console.error(\`[Proxy] ❌ JSON Error: \${e.message}\`);
        if (e.response) {
            res.status(e.response.status).send(e.response.data);
        } else {
            res.status(502).send('Error fetching JSON');
        }
    }
});
`;

// Insert it before the app.listen call
if (!code.includes("app.get('/json'")) {
    const listenIndex = code.lastIndexOf('app.listen');
    if (listenIndex > -1) {
        code = code.substring(0, listenIndex) + jsonHandler + '\n' + code.substring(listenIndex);
        fs.writeFileSync(path, code, 'utf-8');
        console.log('SUCCESS: Added /json proxy endpoint');
    } else {
        console.error('ERROR: Could not find app.listen to insert before');
    }
} else {
    console.log('INFO: /json endpoint already exists');
}
