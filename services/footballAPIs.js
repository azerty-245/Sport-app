/**
 * Unified service for fetching live football data from free APIs.
 * Sources: SofaScore (worldwide live), OpenLigaDB (Bundesliga)
 */

import { Platform } from 'react-native';

// SofaScore API (Live Scores)
// On Web, we must use our Vercel proxy (/api/scores) to avoid CORS.
// On Native, we go direct.
const SOFASCORE_LIVE_URL = Platform.OS === 'web'
    ? '/api/scores/sport/football/events/live'
    : 'https://api.sofascore.com/api/v1/sport/football/events/live';
const OPENLIGA_BASE_URL = 'https://api.openligadb.de';

/**
 * Fetches live football matches worldwide from SofaScore.
 * No API key needed. Returns normalized match objects.
 */
export async function fetchSofaScoreLive() {
    try {
        const response = await fetch(SOFASCORE_LIVE_URL, {
            headers: {
                'Accept': 'application/json',
            }
        });
        if (!response.ok) {
            console.warn('SofaScore API returned', response.status);
            return [];
        }
        const data = await response.json();
        const events = data.events || [];

        // Normalize to our app format, limit to top 30 for performance
        return events
            .filter(ev => ev.homeTeam && ev.awayTeam)
            .slice(0, 30)
            .map(ev => normalizeSofaScoreEvent(ev));
    } catch (error) {
        console.warn('SofaScore fetch error:', error);
        return [];
    }
}

/**
 * Normalize a SofaScore event into our standard match format.
 */
function normalizeSofaScoreEvent(ev) {
    const statusMap = {
        6: '1ST HALF',
        7: '2ND HALF',
        31: 'HALFTIME',
        100: 'FINISHED',
        0: 'NOT STARTED',
        5: 'POSTPONED',
        11: 'EXTRA TIME',
        12: 'PENALTIES',
        20: 'STARTED',
    };

    const statusCode = ev.status?.code || 0;
    const statusText = statusMap[statusCode] || ev.status?.description || 'LIVE';
    const isLive = ['inprogress'].includes(ev.status?.type);

    // Build SofaScore team logo URL
    const homeLogoUrl = ev.homeTeam?.id
        ? `https://api.sofascore.app/api/v1/team/${ev.homeTeam.id}/image`
        : null;
    const awayLogoUrl = ev.awayTeam?.id
        ? `https://api.sofascore.app/api/v1/team/${ev.awayTeam.id}/image`
        : null;

    // Tournament / league name
    const league = ev.tournament?.uniqueTournament?.name
        || ev.tournament?.name
        || 'Football';

    const country = ev.tournament?.category?.name || '';

    return {
        id: `sofa-${ev.id}`,
        homeTeam: ev.homeTeam?.shortName || ev.homeTeam?.name || 'Home',
        awayTeam: ev.awayTeam?.shortName || ev.awayTeam?.name || 'Away',
        homeScore: ev.homeScore?.display ?? ev.homeScore?.current ?? '-',
        awayScore: ev.awayScore?.display ?? ev.awayScore?.current ?? '-',
        homeLogo: homeLogoUrl,
        awayLogo: awayLogoUrl,
        status: isLive ? `🟢 ${statusText}` : statusText,
        league: `${country ? country + ' • ' : ''}${league}`,
        source: 'sofascore',
        isLive,
        startTimestamp: ev.startTimestamp,
        // No actual stream, but we display score info
        streams: [],
        type: 'livescore',
    };
}

/**
 * Fetches current Bundesliga matchday from OpenLigaDB.
 * No API key needed. Returns normalized match objects.
 */
export async function fetchOpenLigaMatches() {
    try {
        const response = await fetch(`${OPENLIGA_BASE_URL}/getmatchdata/bl1`);
        if (!response.ok) {
            console.warn('OpenLigaDB returned', response.status);
            return [];
        }
        const matches = await response.json();

        if (!Array.isArray(matches)) return [];

        return matches.slice(0, 20).map(m => normalizeOpenLigaMatch(m));
    } catch (error) {
        console.warn('OpenLigaDB fetch error:', error);
        return [];
    }
}

/**
 * Normalize an OpenLigaDB match into our standard match format.
 */
function normalizeOpenLigaMatch(m) {
    const isFinished = m.matchIsFinished === true;
    const homeGoals = m.matchResults?.find(r => r.resultOrderID === 2)?.pointsTeam1;
    const awayGoals = m.matchResults?.find(r => r.resultOrderID === 2)?.pointsTeam2;

    // Determine status
    let status = 'UPCOMING';
    const matchDate = new Date(m.matchDateTimeUTC || m.matchDateTime);
    const now = new Date();

    if (isFinished) {
        status = 'FINISHED';
    } else if (homeGoals !== undefined && !isFinished) {
        status = '🟢 LIVE';
    } else if (matchDate > now) {
        const timeStr = matchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        status = timeStr;
    }

    return {
        id: `oliga-${m.matchID}`,
        homeTeam: m.team1?.shortName || m.team1?.teamName || 'Home',
        awayTeam: m.team2?.shortName || m.team2?.teamName || 'Away',
        homeScore: homeGoals ?? '-',
        awayScore: awayGoals ?? '-',
        homeLogo: m.team1?.teamIconUrl || null,
        awayLogo: m.team2?.teamIconUrl || null,
        status,
        league: `🇩🇪 Bundesliga`,
        source: 'openligadb',
        isLive: !isFinished && homeGoals !== undefined,
        startTimestamp: matchDate.getTime() / 1000,
        streams: [],
        type: 'livescore',
    };
}

/**
 * Fetches all live scores from all free APIs and merges them.
 * Live matches appear first, then upcoming, then finished.
 */
export async function fetchAllLiveScores() {
    const [sofaScoreMatches, openLigaMatches] = await Promise.allSettled([
        fetchSofaScoreLive(),
        fetchOpenLigaMatches(),
    ]);

    const allMatches = [
        ...(sofaScoreMatches.status === 'fulfilled' ? sofaScoreMatches.value : []),
        ...(openLigaMatches.status === 'fulfilled' ? openLigaMatches.value : []),
    ];

    // Sort: live first, then by start time (most recent first)
    allMatches.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return (b.startTimestamp || 0) - (a.startTimestamp || 0);
    });

    return allMatches;
}
