import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, fontSize, shadows, spacing } from '../constants/theme';

export default function MatchCard({ match, subscribed, onToggleNotification }) {
    const isLive = match.status === 'Half Time' ||
        match.status === '1st Half' ||
        match.status === '2nd Half' ||
        match.status?.includes('Half');
    const isFinished = match.status === 'Full Time';
    const isUpcoming = match.status === 'Unknown' || match.status === 'Not Started';

    const statusColor = isLive ? colors.live : isFinished ? colors.finished : colors.upcoming;
    const statusBg = isLive ? colors.liveDim : isFinished ? colors.finishedDim : colors.upcomingDim;
    const displayStatus = isUpcoming ? match.time || 'Upcoming' : match.status;

    return (
        <View style={styles.card}>
            <View style={styles.leagueRow}>
                <Text style={styles.league} numberOfLines={1}>{match.league}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {(isLive || isUpcoming) && (
                        <TouchableOpacity onPress={onToggleNotification}>
                            <Ionicons
                                name={subscribed ? "notifications" : "notifications-outline"}
                                size={20}
                                color={subscribed ? colors.accent : colors.textMuted}
                            />
                        </TouchableOpacity>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                        {isLive && <View style={styles.liveDot} />}
                        <Text style={[styles.statusText, { color: statusColor }]}>{displayStatus}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.matchRow}>
                <View style={styles.teamCol}>
                    <Text style={styles.teamName} numberOfLines={1}>{match.homeTeam}</Text>
                </View>
                <View style={styles.scoreCol}>
                    <Text style={[styles.score, isLive && styles.scoreLive]}>
                        {match.homeScore} - {match.awayScore}
                    </Text>
                    {match.halfTimeScore && match.halfTimeScore !== '0 - 0' && (
                        <Text style={styles.halfTime}>HT: {match.halfTimeScore}</Text>
                    )}
                </View>
                <View style={[styles.teamCol, { alignItems: 'flex-end' }]}>
                    <Text style={styles.teamName} numberOfLines={1}>{match.awayTeam}</Text>
                </View>
            </View>

            {match.date && (
                <Text style={styles.dateText}>{match.date}</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...shadows.card,
    },
    leagueRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    league: {
        color: colors.textSecondary,
        fontSize: fontSize.xs,
        flex: 1,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontWeight: '600',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
        gap: 4,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.live,
    },
    statusText: {
        fontSize: fontSize.xs,
        fontWeight: '700',
    },
    matchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    teamCol: {
        flex: 1,
    },
    teamName: {
        color: colors.text,
        fontSize: fontSize.md,
        fontWeight: '600',
    },
    scoreCol: {
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
    },
    score: {
        color: colors.text,
        fontSize: fontSize.xxl,
        fontWeight: '800',
        letterSpacing: 2,
    },
    scoreLive: {
        color: colors.live,
    },
    halfTime: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        marginTop: 2,
    },
    dateText: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        marginTop: spacing.sm,
        textAlign: 'center',
    },
});
