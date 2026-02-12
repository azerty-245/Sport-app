const https = require('https');

const API_KEY = 'prince';
const ENDPOINTS = [
    '/streaming/channels',
    '/streaming/all',
    '/livescore2'
];

function fetchEndpoint(endpoint) {
    const url = `https://api.princetechn.com/api/football${endpoint}?apikey=${API_KEY}`;
    console.log(`Fetching: ${url}`);

    return new Promise((resolve, reject) => {
        https.get(url, (resp) => {
            let data = '';
            resp.on('data', (chunk) => data += chunk);
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ endpoint, json });
                } catch (e) {
                    resolve({ endpoint, error: e.message });
                }
            });
        }).on('error', (err) => resolve({ endpoint, error: err.message }));
    });
}

async function run() {
    for (const ep of ENDPOINTS) {
        const result = await fetchEndpoint(ep);
        if (result.error) { console.log(result.error); continue; }

        const json = result.json;
        const items = (json.result && json.result.matches) ||
            (json.result && json.result.channels) ||
            (Array.isArray(json.result) ? json.result : []) ||
            [];

        console.log(`[${ep}] Found ${items.length} items.`);

        if (items.length > 0) {
            const toLog = items.slice(0, 3);
            toLog.forEach(m => {
                console.log(`[${ep}] Item:`, JSON.stringify(m, null, 2));
            });
        }
    }
}

run();
