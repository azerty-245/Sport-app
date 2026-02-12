/**
 * Service for fetching external streaming and video content.
 * Includes ScoreBat for highlights and IPTV-org for community-sourced channels.
 */

const SCOREBAT_API_URL = 'https://www.scorebat.com/video-api/v1/';
const IPTV_SPORTS_URL = 'https://iptv-org.github.io/iptv/categories/sports.m3u';

// Additional community-sourced lists (Deep Research)
const COMMUNITY_SOURCES = [
    { name: 'Global Sports (IPTV-org)', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', priority: 1 },
    { name: 'Africa Sports (Community)', url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/za.m3u', priority: 2 },
    { name: 'Europe Sports (Community)', url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/fr.m3u', priority: 3 },
    { name: 'US Sports (Community)', url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u', priority: 4 }
];

/**
 * Fetches the latest football highlights from ScoreBat.
 */
export async function fetchScoreBatHighlights() {
    try {
        const response = await fetch(SCOREBAT_API_URL);
        if (!response.ok) return [];
        const data = await response.json();

        // Return only the first 20 highlights for performance
        return (data || []).slice(0, 20).map(item => ({
            id: 'sb-' + (item.title + item.date).replace(/\s+/g, '-'),
            title: item.title,
            competition: item.competition.name,
            thumbnail: item.thumbnail,
            url: item.url,
            embed: item.embed,
            date: item.date,
            type: 'highlight'
        }));
    } catch (error) {
        console.warn('ScoreBat API error:', error);
        return [];
    }
}

/**
 * Fetches and parses IPTV channels from multiple community sources.
 */
export async function fetchIPTVChannels() {
    let allChannels = [];

    try {
        const results = await Promise.allSettled(
            COMMUNITY_SOURCES.map(source =>
                fetch(source.url)
                    .then(res => res.text())
                    .then(text => parseM3U(text, source.name))
            )
        );

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const priority = COMMUNITY_SOURCES[index].priority || 10;
                const prioritized = result.value.map(c => ({ ...c, priority }));
                allChannels = [...allChannels, ...prioritized];
            }
        });

        // Sort by priority first, then by name
        allChannels.sort((a, b) => (a.priority - b.priority) || a.name.localeCompare(b.name));

        // Remove duplicates based on URL
        const seenUrls = new Set();
        const uniqueChannels = allChannels.filter(channel => {
            if (seenUrls.has(channel.url)) return false;
            seenUrls.add(channel.url);
            return true;
        });

        return uniqueChannels.slice(0, 150); // Limit to 150 total for performance
    } catch (error) {
        console.warn('IPTV extraction error:', error);
        return [];
    }
}

/**
 * Basic M3U parser to extract channel names and URLs.
 */
function parseM3U(content, sourcePrefix = '') {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const channels = [];

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF:')) {
            const infoLine = lines[i];

            // Find the next line that is not a comment/directive
            let urlLine = '';
            let j = i + 1;
            while (j < lines.length && lines[j].startsWith('#')) {
                j++;
            }
            if (j < lines.length) {
                urlLine = lines[j];
                i = j; // Update outer loop index
            }

            if (urlLine) {
                // Name extraction: Priority 1: tvg-name attribute
                // Priority 2: Text after the last comma
                let rawName = '';

                const tvgNameMatch = infoLine.match(/tvg-name="([^"]+)"/i);
                if (tvgNameMatch && tvgNameMatch[1]) {
                    rawName = tvgNameMatch[1].trim();
                }

                if (!rawName) {
                    const lastCommaIndex = infoLine.lastIndexOf(',');
                    if (lastCommaIndex !== -1) {
                        rawName = infoLine.substring(lastCommaIndex + 1).trim();
                    }
                }

                if (!rawName || rawName === '-1') {
                    rawName = 'Live Channel';
                }

                const name = `${rawName} (${sourcePrefix})`;

                // Filter for Sports if needed
                const isSport = rawName.toLowerCase().includes('sport') ||
                    rawName.toLowerCase().includes('football') ||
                    rawName.toLowerCase().includes('soccer') ||
                    rawName.toLowerCase().includes('goal') ||
                    sourcePrefix.includes('Sports');

                if (isSport && channels.length < 150) {
                    const id = `iptv-${sourcePrefix.replace(/\s+/g, '-')}-${rawName.replace(/[^\w]/g, '')}-${urlLine.slice(-10)}`;

                    channels.push({
                        id,
                        name,
                        category: 'Live Sports',
                        url: urlLine,
                        status: 'active',
                        type: 'channel'
                    });
                }
            }
        }
    }

    return channels;
}
