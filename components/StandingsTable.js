import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, shadows, spacing } from '../constants/theme';

/**
 * @param {{ standings: any[], competition: string }} props
 */
export default function StandingsTable({ standings = [], competition }) {
    return (
        <View style={styles.container}>
            {competition && (
                <Text style={styles.title}>{competition}</Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                    {/* Header */}
                    <View style={styles.headerRow}>
                        <Text style={[styles.headerCell, styles.posCol]}>#</Text>
                        <Text style={[styles.headerCell, styles.teamCol]}>Team</Text>
                        <Text style={[styles.headerCell, styles.statCol]}>PJ</Text>
                        <Text style={[styles.headerCell, styles.statCol]}>V</Text>
                        <Text style={[styles.headerCell, styles.statCol]}>N</Text>
                        <Text style={[styles.headerCell, styles.statCol]}>D</Text>
                        <Text style={[styles.headerCell, styles.statCol]}>+/-</Text>
                        <Text style={[styles.headerCell, styles.ptsCol]}>Pts</Text>
                    </View>

                    {/* Rows */}
                    {standings.map((team, index) => {
                        const posColor = team.position <= 4
                            ? colors.accent
                            : team.position >= standings.length - 2
                                ? colors.danger
                                : colors.textSecondary;

                        return (
                            <View
                                key={`${team.team}-${index}`}
                                style={[
                                    styles.row,
                                    index % 2 === 0 && styles.rowAlt,
                                ]}
                            >
                                <View style={[styles.posCol, styles.posContainer]}>
                                    <View style={[styles.posIndicator, { backgroundColor: posColor }]} />
                                    <Text style={[styles.cell, styles.posText]}>{team.position}</Text>
                                </View>
                                <Text style={[styles.cell, styles.teamCol, styles.teamText]} numberOfLines={1}>
                                    {team.team?.replace(' FC', '').replace(' AFC', '')}
                                </Text>
                                <Text style={[styles.cell, styles.statCol]}>{team.played}</Text>
                                <Text style={[styles.cell, styles.statCol, styles.winText]}>{team.won}</Text>
                                <Text style={[styles.cell, styles.statCol]}>{team.draw}</Text>
                                <Text style={[styles.cell, styles.statCol, styles.loseText]}>{team.lost}</Text>
                                <Text style={[styles.cell, styles.statCol]}>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</Text>
                                <Text style={[styles.cell, styles.ptsCol, styles.ptsText]}>{team.points}</Text>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...shadows.card,
    },
    title: {
        color: colors.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
        padding: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.cardBorder,
    },
    headerRow: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    headerCell: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    row: {
        flexDirection: 'row',
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
    },
    rowAlt: {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
    },
    cell: {
        color: colors.textSecondary,
        fontSize: fontSize.sm,
    },
    posCol: {
        width: 36,
    },
    posContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    posIndicator: {
        width: 3,
        height: 16,
        borderRadius: 2,
    },
    posText: {
        fontWeight: '700',
        color: colors.text,
    },
    teamCol: {
        width: 160,
        paddingRight: spacing.sm,
    },
    teamText: {
        color: colors.text,
        fontWeight: '600',
    },
    statCol: {
        width: 36,
        textAlign: 'center',
    },
    ptsCol: {
        width: 40,
        textAlign: 'center',
    },
    ptsText: {
        color: colors.accent,
        fontWeight: '800',
        fontSize: fontSize.md,
    },
    winText: {
        color: colors.accent,
    },
    loseText: {
        color: colors.danger,
    },
});
