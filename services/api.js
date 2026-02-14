const BASE_URL = 'https://api.princetechn.com/api/football';
const API_KEY = process.env.EXPO_PUBLIC_FOOTBALL_API_KEY || 'prince';

async function fetchApi(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set('apikey', API_KEY);
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
    });

    try {
        const response = await fetch(url.toString());
        if (!response.ok) {
            console.warn(`API [${endpoint}] returned ${response.status}`);
            return null;
        }
        const data = await response.json();
        if (data.success) {
            return data.result;
        }
        console.warn(`API [${endpoint}]: ${data.message || 'unsuccessful'}`);
        return null;
    } catch (error) {
        console.warn(`API [${endpoint}] network error`);
        return null;
    }
}

// ── Live Scores ──
export const getLiveScores = () => fetchApi('/livescore');
export const getLiveScores2 = () => fetchApi('/livescore2');

// ── Streaming ──
export const getStreaming = () => fetchApi('/streaming');
export const getBasketballStreaming = () => fetchApi('/streaming/basketball');
export const getAllStreaming = () => fetchApi('/streaming/all');
export const getStreamingLeagues = () => fetchApi('/streaming/leagues');
export const getStreamingChannels = () => fetchApi('/streaming/channels');

// ── News ──
export const getNews = () => fetchApi('/news');

// ── Predictions ──
export const getPredictions = () => fetchApi('/predictions');

// ── Search ──
export const searchPlayer = (name) => fetchApi('/player-search', { name });
export const searchTeam = (name) => fetchApi('/team-search', { name });

// ── Leagues ──
export const getLeagues = () => fetchApi('/leagues');

// ── League-specific endpoints ──
const leagueEndpoints = {
    epl: 'epl',
    laliga: 'laliga',
    bundesliga: 'bundesliga',
    seriea: 'seriea',
    ligue1: 'ligue1',
    ucl: 'ucl',
    euros: 'euros',
    fifa: 'fifa',
};

export const getStandings = (league) => fetchApi(`/${leagueEndpoints[league]}/standings`);
export const getTopScorers = (league) => fetchApi(`/${leagueEndpoints[league]}/scorers`);
export const getMatches = (league) => fetchApi(`/${leagueEndpoints[league]}/matches`);
export const getUpcoming = (league) => fetchApi(`/${leagueEndpoints[league]}/upcoming`);

// ── Basketball ──
export const getBasketballLive = () => fetchApi('/basketball-live');

export const LEAGUE_LIST = [
    { key: 'epl', name: 'Premier League', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', hasMatches: true },
    { key: 'laliga', name: 'La Liga', emoji: '🇪🇸', hasMatches: false },
    { key: 'bundesliga', name: 'Bundesliga', emoji: '🇩🇪', hasMatches: false },
    { key: 'seriea', name: 'Serie A', emoji: '🇮🇹', hasMatches: false },
    { key: 'ligue1', name: 'Ligue 1', emoji: '🇫🇷', hasMatches: false },
    { key: 'ucl', name: 'Champions League', emoji: '🏆', hasMatches: true },
    { key: 'euros', name: 'Euros', emoji: '🇪🇺', hasMatches: false },
    { key: 'fifa', name: 'FIFA World Cup', emoji: '🌎', hasMatches: false },
];
