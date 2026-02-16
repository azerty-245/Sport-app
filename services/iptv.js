import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CACHE_KEY = 'iptv_channels_cache_v5'; // v5: really force refresh
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours

// Expo inlines EXPO_PUBLIC_* at build time
// On Web, checking window.location.origin is safer for Workers which need absolute URLs
const getProxyUrl = () => {
    if (Platform.OS === 'web') {
        const isStandardWeb = typeof window !== 'undefined' &&
            window.location &&
            (window.location.protocol === 'http:' || window.location.protocol === 'https:');

        if (isStandardWeb) {
            return `${window.location.origin}/api/iptv`;
        }
        // For Electron (app:// protocol) or local files, use the absolute Oracle Proxy URL
        return process.env.EXPO_PUBLIC_PROXY_URL || 'http://152.70.45.91:3005';
    }
    return process.env.EXPO_PUBLIC_PROXY_URL || 'http://152.70.45.91:3005';
};

export const PROXY_URL = getProxyUrl();

console.log('[IPTV] Initialized with Proxy URL:', PROXY_URL); // DEBUG

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

        // Secure fetch: We call /playlist and the proxy adds the secret IPTV_URL on the server side.
        const playlistUrl = `${PROXY_URL}/playlist`;

        console.log('[IPTV] Fetching IPTV playlist securely via Proxy...');
        const response = await fetch(playlistUrl, {
            headers: {
                'X-API-Key': API_KEY
            }
        });
        if (!response.ok) throw new Error('Failed to fetch IPTV playlist');

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
                // IMPORTANT: Use the URL from the proxy.
                // If the proxy rewrote it to a relative path, prefix it with PROXY_URL.
                currentChannel.url = line.startsWith('/') ? `${PROXY_URL}${line}` : line;

                const nameUpper = currentChannel.name?.toUpperCase() || '';
                const groupUpper = currentChannel.group?.toUpperCase() || '';

                // 1. Identify French Content
                const isFrench = nameUpper.includes('FR:') || nameUpper.includes('FRANCE') || groupUpper.includes('FRANCE') || groupUpper.includes('FR |') || groupUpper.includes('FRENCH') || groupUpper.includes('FRANÇAIS');

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
