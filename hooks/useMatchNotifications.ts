import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { fetchAllLiveScores } from '../services/footballAPIs';
import { requestNotificationPermissions, sendNotification } from '../services/notificationService';

const POLLING_INTERVAL = 30000; // 30 seconds

export function useMatchNotifications() {
    const subscribedMatchesRef = useRef<Set<string>>(new Set());
    const previousMatchStatesRef = useRef<{ [key: string]: any }>({});

    useEffect(() => {
        // Request permissions on mount
        requestNotificationPermissions();

        // Load subscriptions from storage
        const loadSubscriptions = async () => {
            try {
                const stored = await AsyncStorage.getItem('subscribedMatches');
                if (stored) {
                    const ids = JSON.parse(stored);
                    subscribedMatchesRef.current = new Set(ids);
                }
            } catch (e) {
                console.error('Failed to load subscriptions', e);
            }
        };

        loadSubscriptions();

        // Start polling
        const interval = setInterval(checkMatches, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    // Also listen for storage changes (if user toggles in another tab/component)
    // For simplicity, we assume this hook is the source of truth or re-reads storage often.
    // Ideally, we'd use a Context or Event emitter. For now, we re-read storage every poll.

    const checkMatches = async () => {
        try {
            // Re-read subscriptions to be distinct
            const stored = await AsyncStorage.getItem('subscribedMatches');
            if (stored) {
                subscribedMatchesRef.current = new Set(JSON.parse(stored));
            }

            if (subscribedMatchesRef.current.size === 0) return;

            // Fetch live data
            const liveMatches = await fetchAllLiveScores();

            // Checks
            liveMatches.forEach((match: any) => {
                if (subscribedMatchesRef.current.has(match.id)) {
                    compareAndNotify(match);
                }
            });

        } catch (err) {
            console.error('Notification Poller Error:', err);
        }
    };

    const compareAndNotify = (currentMatch: any) => {
        const prev = previousMatchStatesRef.current[currentMatch.id];

        if (!prev) {
            // First time seeing this match in this session, just store it
            previousMatchStatesRef.current[currentMatch.id] = currentMatch;
            return;
        }

        // 1. Kick-off (Not Started -> Live)
        if (!prev.isLive && currentMatch.isLive) {
            sendNotification('⚽ Kick-off!', `${currentMatch.homeTeam} vs ${currentMatch.awayTeam} has started!`);
        }

        // 2. Goals (Score changed)
        if (currentMatch.homeScore !== prev.homeScore || currentMatch.awayScore !== prev.awayScore) {
            // Only notify if scores are valid numbers (ignore '?' or '-')
            // But API returns numbers usually.
            const homeChanged = currentMatch.homeScore !== prev.homeScore;
            const awayChanged = currentMatch.awayScore !== prev.awayScore;

            const scorer = homeChanged ? currentMatch.homeTeam : currentMatch.awayTeam;
            sendNotification('⚽ GOAL!', `${scorer} scored! ${currentMatch.homeTeam} ${currentMatch.homeScore} - ${currentMatch.awayScore} ${currentMatch.awayTeam}`);
        }

        // 3. Half-Time (Status contains 'Half')
        const isHT = (status: any) => typeof status === 'string' && (status.includes('Half Time') || status === 'HT' || status.includes('Break'));
        if (!isHT(prev.status) && isHT(currentMatch.status)) {
            sendNotification('⏸️ Half-Time', `${currentMatch.homeTeam} ${currentMatch.homeScore} - ${currentMatch.awayScore} ${currentMatch.awayTeam}`);
        }

        // 4. Full-Time (Status contains Finished or FT)
        const isFT = (status: any) => typeof status === 'string' && (status.includes('Full Time') || status === 'FT' || status.includes('Ended') || status === 'FINISHED');
        if (!isFT(prev.status) && isFT(currentMatch.status)) {
            sendNotification('🏁 Full-Time', `${currentMatch.homeTeam} ${currentMatch.homeScore} - ${currentMatch.awayScore} ${currentMatch.awayTeam}`);
        }

        // Update state
        previousMatchStatesRef.current[currentMatch.id] = currentMatch;
    };
}
