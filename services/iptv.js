import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CACHE_KEY = 'iptv_channels_cache_v5'; // v5: really force refresh
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours

// Expo inlines EXPO_PUBLIC_* at build time
// On Web, checking window.location.origin is safer for Workers which need absolute URLs
// Split Proxy Strategy:
// 1. METADATA_PROXY: Use HTTPS (Vercel) to avoid "Mixed Content" blocks on the UI.
// 2. STREAM_PROXY: Use direct IP (Oracle) for persistent MPEG-TS streaming (avoid Vercel 10s timeout).
const getMetadataProxy = () => {
    // Priority 1: Check if we are on web and have a Vercel-like host
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host.includes('vercel.app')) return `https://${host}/api/iptv`;
        if (host !== 'localhost' && !host.includes('127.0.0.1')) return `${window.location.origin}/api/iptv`;
    }

    // Priority 2: Use hardcoded Vercel fallback for APK/EXE to bypass Oracle IP blocks
    // This ensures consistency across all builds.
    const VERCEL_FALLBACK = 'https://eben-digi.vercel.app/api/iptv';

    return process.env.EXPO_PUBLIC_PROXY_URL || VERCEL_FALLBACK;
};

const TUNNEL_PERSIST_KEY = 'vm_tunnel_url_v1';

// Use a function to get the current PROXY_URL to avoid stale top-level constants
export let PROXY_URL = getMetadataProxy();
export let STREAM_PROXY_URL = 'https://determined-satisfaction-richard-seeks.trycloudflare.com';

// Internal state
let isDiscovering = false;

// Dynamic Tunnel Discovery:
// Fetch the current secure tunnel URL directly from the VM tunnel endpoint.
// We call Vercel's /api/iptv/tunnel-info which proxies to the VM.
export const discoverTunnel = async () => {
    if (isDiscovering) return STREAM_PROXY_URL;
    isDiscovering = true;
    try {
        // 1. Try to load from persistent storage first if current is default
        const savedTunnel = await AsyncStorage.getItem(TUNNEL_PERSIST_KEY);
        if (savedTunnel && savedTunnel.startsWith('http')) {
            STREAM_PROXY_URL = savedTunnel.replace(/\/$/, '');
            console.log('[IPTV] 💾 Loaded saved tunnel:', STREAM_PROXY_URL);
        }

        console.log('[IPTV] Discovering tunnel via Vercel proxy...');
        const metadataProxy = getMetadataProxy();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        // Pass the known tunnel in the header so Vercel can reach the VM even if raw IP is dead
        const headers = {
            'X-API-Key': API_KEY,
            'X-VM-Tunnel': STREAM_PROXY_URL
        };

        const response = await fetch(`${metadataProxy}/tunnel-info`, {
            headers,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error('Tunnel info unavailable');

        const data = await response.json();
        if (data.tunnelUrl && data.tunnelUrl.startsWith('http')) {
            const discoveredUrl = data.tunnelUrl.replace(/\/$/, '');
            if (discoveredUrl !== STREAM_PROXY_URL) {
                STREAM_PROXY_URL = discoveredUrl;
                console.log('[IPTV] 🛡️ New Tunnel discovered:', STREAM_PROXY_URL);
                await AsyncStorage.setItem(TUNNEL_PERSIST_KEY, STREAM_PROXY_URL);
            }
            return STREAM_PROXY_URL;
        }
    } catch (e) {
        // If discovery fails and IP is blocked, we still have our last known tunnel
        console.warn('[IPTV] Discovery failed. Staying on:', STREAM_PROXY_URL);
    } finally {
        isDiscovering = false;
        return STREAM_PROXY_URL;
    }
};

// Initial discovery (if in browser)
if (typeof window !== 'undefined') {
    discoverTunnel();
}

console.log('[IPTV] Initialized with Metadata Proxy (HTTPS):', PROXY_URL);

const IPTV_URL = process.env.EXPO_PUBLIC_IPTV_URL || '';
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY || 'sport-zone-secure-v1';

export const getIPTVChannels = async () => {
    try {
        // ... cache check ...
        if (Platform.OS !== 'web') {
            const cachedData = await AsyncStorage.getItem(CACHE_KEY);
            if (cachedData) {
                const { timestamp, channels } = JSON.parse(cachedData);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    console.log('Returning cached IPTV channels');
                    return channels;
                }
            }
        }

        // IMPORTANT: Always use PROXY_URL (Vercel/HTTPS) for playlist fetch.
        // The playlist is now ~71KB (server-side filtered) so Vercel won't timeout.
        // STREAM_PROXY_URL (tunnel) is only used for actual video stream URLs.
        const playlistUrl = `${PROXY_URL}/playlist`;

        console.log('[IPTV] Fetching IPTV playlist (Header-Routed)...');
        const headers = {
            'X-API-Key': API_KEY
        };

        // If we have a tunnel URL, tell Vercel to use it (bypasses blocked raw IP)
        if (STREAM_PROXY_URL.includes('trycloudflare.com')) {
            headers['X-VM-Tunnel'] = STREAM_PROXY_URL;
        }

        const response = await fetch(playlistUrl, { headers });
        if (!response.ok) {
            // If Vercel returns error, maybe our tunnel is stale? Force re-discover
            if (response.status >= 500) await discoverTunnel();
            throw new Error(`Failed to fetch IPTV playlist: ${response.status}`);
        }

        const text = await response.text();
        // ...
        console.log('[IPTV] Response preview:', text.substring(0, 200)); // DEBUG: See what we actually got
        const lines = text.split('\n');
        const channels = [];
        let currentChannel = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                const info = line.substring(8);
                const nameParts = info.split(',');
                const name = nameParts[nameParts.length - 1].trim();

                // Extract logo if available
                const logoMatch = info.match(/tvg-logo="([^"]*)"/);
                const logo = logoMatch ? logoMatch[1] : null;

                // Extract group if available
                const groupMatch = info.match(/group-title="([^"]*)"/);
                const group = groupMatch ? groupMatch[1] : 'Uncategorized';

                currentChannel = { name, logo, group };
            } else if (line.startsWith('http') || line.startsWith('/stream')) {
                // Stream relative paths get the tunnel URL, not Vercel.
                // STREAM_PROXY_URL is discovered tunnel (HTTPS) or Vercel fallback.
                currentChannel.url = line.startsWith('/') ? `${STREAM_PROXY_URL}${line}` : line;

                const nameUpper = currentChannel.name?.toUpperCase() || '';
                const groupUpper = currentChannel.group?.toUpperCase() || '';

                // 1. Identify French Content
                const isFrench = nameUpper.includes('FR:') || nameUpper.includes('FR |') || nameUpper.includes('FRANCE') || groupUpper.includes('FRANCE') || groupUpper.includes('FR |') || groupUpper.includes('FRENCH') || groupUpper.includes('FRANÇAIS');

                // 2. Identify Sports Content (Generic)
                const isSportGeneric = nameUpper.includes('SPORT') || groupUpper.includes('SPORT') || nameUpper.includes('FOOT') || nameUpper.includes('SOCCER') || nameUpper.includes('RUGBY') || nameUpper.includes('TENNIS') || nameUpper.includes('BASKET') || nameUpper.includes('MOTO') || nameUpper.includes('AUTO') || nameUpper.includes('FIGHT') || nameUpper.includes('UFC') || nameUpper.includes('WWE');

                // 3. Identify Premium/Specific Sports Channels (Explicit Brands)
                const isPremiumBrand = nameUpper.includes('CANAL+') || nameUpper.includes('BEIN') || nameUpper.includes('RMC SPORT') ||
                    nameUpper.includes('EUROSPORT') || nameUpper.includes('DAZN') || nameUpper.includes('PRIME VIDEO') ||
                    nameUpper.includes('EQUIPE') || nameUpper.includes('AUTOMOTO') || nameUpper.includes('EQUIDIA') ||
                    nameUpper.includes('ELEVEN') || nameUpper.includes('SKY SPORT') || nameUpper.includes('MULTISPORTS') ||
                    nameUpper.includes('GOLF+');

                // 4. Identify Main French General Channels (often show major events)
                const isMainFrench = nameUpper === 'FR: TF1' || nameUpper === 'FR: M6' || nameUpper === 'FR: FRANCE 2' || nameUpper === 'FR: FRANCE 3' ||
                    nameUpper.includes('TF1 4K') || nameUpper.includes('M6 4K') || nameUpper === 'TF1' || nameUpper === 'M6';

                // Final filtering: Must be French Sport OR any clear Premium Sport brand
                if ((isFrench && (isSportGeneric || isPremiumBrand)) || (isPremiumBrand && isSportGeneric)) {
                    currentChannel.category = 'Sport';
                    // Clean up name (remove "FR: " prefix, regional tags, etc.)
                    currentChannel.name = currentChannel.name.replace(/^(FR:|FRANCE|FRENCH)\s*/i, '').replace(/\(.*\)/, '').replace(/\[.*\]/, '').trim();
                    channels.push(currentChannel);
                } else if (isMainFrench) {
                    currentChannel.category = 'General';
                    currentChannel.name = currentChannel.name.replace(/^(FR:|FRANCE|FRENCH)\s*/i, '').replace(/\(.*\)/, '').trim();
                    channels.push(currentChannel);
                }

                currentChannel = {};
            }
        }

        console.log(`Parsed ${channels.length} relevant channels`);

        // Cache the result
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            channels
        }));

        return channels;

    } catch (error) {
        console.error('Error fetching IPTV channels:', error);
        return [];
    }
};

export const clearIPTVCache = async () => {
    try {
        await AsyncStorage.removeItem(CACHE_KEY);
    } catch (e) {
        console.error('Failed to clear cache', e);
    }
};
