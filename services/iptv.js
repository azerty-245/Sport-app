import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CACHE_KEY = 'iptv_channels_cache_v5'; // v5: really force refresh
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours

// Expo inlines EXPO_PUBLIC_* at build time
// On Web, checking window.location.origin is safer for Workers which need absolute URLs
const getProxyUrl = () => {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.location) {
            return `${window.location.origin}/api/iptv`;
        }
        return '/api/iptv';
    }
    return process.env.EXPO_PUBLIC_PROXY_URL || '';
};

export const PROXY_URL = getProxyUrl();

console.log('[IPTV] Initialized with Proxy URL:', PROXY_URL); // DEBUG

const IPTV_URL = process.env.EXPO_PUBLIC_IPTV_URL || '';

export const getIPTVChannels = async () => {
    try {
        // Check cache first (DISABLED ON WEB to ensure fresh proxy usage)
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

        let url = IPTV_URL;
        if (!url) {
            console.error('[IPTV] No IPTV URL found. Check .env EXPO_PUBLIC_IPTV_URL');
            return [];
        }

        // Use Oracle Cloud Proxy to bypass CORS for the playlist fetch
        // We use a separate flag or parameter to tell the proxy NOT to use FFmpeg for the M3U text file
        const proxiedPlaylistUrl = `${PROXY_URL}/stream?url=${encodeURIComponent(IPTV_URL)}&nocode=true`;

        console.log('[IPTV] Fetching IPTV playlist via Proxy...');
        const response = await fetch(proxiedPlaylistUrl);
        if (!response.ok) throw new Error('Failed to fetch IPTV playlist');

        const text = await response.text();
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
            } else if (line.startsWith('http')) {
                // IMPORTANT: Proxy the individual channel stream URL too!
                // This ensures transcoding happens when the channel is played.
                currentChannel.url = `${PROXY_URL}/stream?url=${encodeURIComponent(line)}`;

                const nameUpper = currentChannel.name?.toUpperCase() || '';
                const groupUpper = currentChannel.group?.toUpperCase() || '';

                // 1. Identify French Content
                // Looks for 'FR:', 'FRANCE', 'FRENCH', or 'FR |' in name or group
                const isFrench = nameUpper.includes('FR:') || nameUpper.includes('FRANCE') || groupUpper.includes('FRANCE') || groupUpper.includes('FR |') || groupUpper.includes('FRENCH');

                // 2. Identify Sports Content (Generic)
                const isSportGeneric = nameUpper.includes('SPORT') || groupUpper.includes('SPORT') || nameUpper.includes('FOOT') || nameUpper.includes('SOCCER') || nameUpper.includes('RUGBY') || nameUpper.includes('TENNIS') || nameUpper.includes('BASKET') || nameUpper.includes('MOTO') || nameUpper.includes('AUTO');

                // 3. Identify Premium/Specific Sports Channels (Explicit Brands)
                // Based on debug output: CANAL+, BEIN, RMC, EUROSPORT, DAZN, PRIME VIDEO, L'EQUIPE, AUTOMOTO, EQUIDIA
                const isPremiumSport = nameUpper.includes('CANAL+ SPORT') || nameUpper.includes('CANAL+ FOOT') || nameUpper.includes('CANAL+ PREMIER') || nameUpper.includes('CANAL+ FORMULA') ||
                    nameUpper.includes('BEIN') || nameUpper.includes('RMC SPORT') || nameUpper.includes('EUROSPORT') ||
                    nameUpper.includes('DAZN') || nameUpper.includes('PRIME VIDEO') || nameUpper.includes('EQUIPE') ||
                    nameUpper.includes('AUTOMOTO') || nameUpper.includes('EQUIDIA') || nameUpper.includes('GOLF+') || nameUpper.includes('MULTISPORTS');

                // 4. Identify Main French General Channels (TF1, M6, etc. often show sports)
                const isMainFrench = nameUpper === 'FR: TF1' || nameUpper === 'FR: M6' || nameUpper === 'FR: FRANCE 2' || nameUpper === 'FR: FRANCE 3' ||
                    nameUpper.includes('TF1 4K') || nameUpper.includes('M6 4K');

                if (isFrench && (isSportGeneric || isPremiumSport)) {
                    currentChannel.category = 'Sport';
                    // Clean up name for display (remove "FR: " prefix)
                    currentChannel.name = currentChannel.name.replace(/^FR:\s*/, '').replace(/\(.*\)/, '').trim();
                    channels.push(currentChannel);
                } else if (isMainFrench) {
                    currentChannel.category = 'General';
                    currentChannel.name = currentChannel.name.replace(/^FR:\s*/, '').replace(/\(.*\)/, '').trim();
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
