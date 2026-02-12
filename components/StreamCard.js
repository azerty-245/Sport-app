import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, fontSize, shadows, spacing } from '../constants/theme';

export default function StreamCard({ match, onPress }) {
    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
            <View style={styles.liveTag}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{match.status || 'STREAM'}</Text>
            </View>

            <View style={styles.matchInfo}>
                <View style={styles.teamRow}>
                    {match.homeLogo ? (
                        <Image source={{ uri: match.homeLogo }} style={styles.logo} />
                    ) : (
                        <View style={[styles.logo, styles.placeholderLogo]}>
                            <Ionicons name="football" size={18} color={colors.textMuted} />
                        </View>
                    )}
                    <Text style={styles.teamName} numberOfLines={1}>{match.homeTeam}</Text>
                </View>

                <View style={styles.vsContainer}>
                    <Text style={styles.score}>{match.homeScore} - {match.awayScore}</Text>
                </View>

                <View style={[styles.teamRow, { justifyContent: 'flex-end' }]}>
                    <Text style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={1}>{match.awayTeam}</Text>
                    {match.awayLogo ? (
                        <Image source={{ uri: match.awayLogo }} style={styles.logo} />
                    ) : (
                        <View style={[styles.logo, styles.placeholderLogo]}>
                            <Ionicons name="football" size={18} color={colors.textMuted} />
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.league}>{match.league}</Text>
                <View style={styles.playBtn}>
                    <Ionicons name="play" size={14} color={colors.background} />
                    <Text style={styles.playText}>Watch</Text>
                </View>
            </View>
        </TouchableOpacity>
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
    liveTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: colors.liveDim,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
        marginBottom: spacing.md,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.live,
    },
    liveText: {
        color: colors.live,
        fontSize: fontSize.xs,
        fontWeight: '700',
    },
    matchInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    teamRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    logo: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    placeholderLogo: {
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    teamName: {
        color: colors.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
        flex: 1,
    },
    vsContainer: {
        paddingHorizontal: spacing.md,
    },
    score: {
        color: colors.text,
        fontSize: fontSize.xl,
        fontWeight: '800',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.cardBorder,
        paddingTop: spacing.md,
    },
    league: {
        color: colors.textSecondary,
        fontSize: fontSize.xs,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    playBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.accent,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
    },
    playText: {
        color: colors.background,
        fontSize: fontSize.sm,
        fontWeight: '700',
    },
});
