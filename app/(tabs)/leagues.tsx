import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LegalFooter from '../../components/LegalFooter';
import StandingsTable from '../../components/StandingsTable';
import { borderRadius, colors, fontSize, spacing } from '../../constants/theme';
import { getStandings, getTopScorers, LEAGUE_LIST } from '../../services/api';

export default function LeaguesScreen() {
    const [selectedLeague, setSelectedLeague] = useState('epl');
    const [tab, setTab] = useState('standings');
    const [standings, setStandings] = useState<any[] | null>(null);
    const [scorers, setScorers] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [competition, setCompetition] = useState('');

    useEffect(() => {
        setLoading(true);
        setStandings(null);
        setScorers(null);

        const load = async () => {
            try {
                if (tab === 'standings') {
                    const data = await getStandings(selectedLeague);
                    if (data) {
                        setStandings(data.standings || []);
                        setCompetition(data.competition || '');
                    } else {
                        setStandings([]);
                        setCompetition('');
                    }
                } else {
                    const data = await getTopScorers(selectedLeague);
                    if (data) {
                        setScorers(data.scorers || data.topScorers || []);
                        setCompetition(data.competition || '');
                    } else {
                        setScorers([] as any[]);
                        setCompetition('');
                    }
                }
            } catch (err) {
                console.warn(err);
                setStandings([] as any[]);
                setScorers([] as any[]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [selectedLeague, tab]);

    return (
        <View style={styles.container}>
            {/* League selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueScroll} contentContainerStyle={styles.leagueRow}>
                {LEAGUE_LIST.map((l) => (
                    <TouchableOpacity
                        key={l.key}
                        style={[styles.leagueChip, selectedLeague === l.key && styles.leagueChipActive]}
                        onPress={() => setSelectedLeague(l.key)}
                    >
                        <Text style={styles.leagueEmoji}>{l.emoji}</Text>
                        <Text style={[styles.leagueText, selectedLeague === l.key && styles.leagueTextActive]}>
                            {l.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Tab toggle */}
            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tabBtn, tab === 'standings' && styles.tabActive]}
                    onPress={() => setTab('standings')}
                >
                    <Ionicons name="list" size={16} color={tab === 'standings' ? colors.accent : colors.textMuted} />
                    <Text style={[styles.tabText, tab === 'standings' && styles.tabTextActive]}>Standings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, tab === 'scorers' && styles.tabActive]}
                    onPress={() => setTab('scorers')}
                >
                    <Ionicons name="football" size={16} color={tab === 'scorers' ? colors.accent : colors.textMuted} />
                    <Text style={[styles.tabText, tab === 'scorers' && styles.tabTextActive]}>Top Scorers</Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            ) : (
                <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
                    {tab === 'standings' && standings && (
                        <StandingsTable standings={standings} competition={competition} />
                    )}
                    {tab === 'scorers' && scorers && (
                        <View style={styles.scorersList}>
                            <Text style={styles.scorersTitle}>🏅 Top Scorers — {competition}</Text>
                            {scorers.map((s, i) => (
                                <View key={`${s.player}-${i}`} style={[styles.scorerRow, i % 2 === 0 && styles.scorerRowAlt]}>
                                    <View style={styles.scorerRank}>
                                        <Text style={[
                                            styles.rankText,
                                            i === 0 && { color: colors.gold },
                                            i === 1 && { color: colors.silver },
                                            i === 2 && { color: colors.bronze },
                                        ]}>
                                            {i + 1}
                                        </Text>
                                    </View>
                                    <View style={styles.scorerInfo}>
                                        <Text style={styles.scorerName}>{s.player || s.name}</Text>
                                        <Text style={styles.scorerTeam}>{s.team}</Text>
                                    </View>
                                    <View style={styles.scorerGoals}>
                                        <Text style={styles.goalsNumber}>{s.goals}</Text>
                                        <Text style={styles.goalsLabel}>goals</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                    <LegalFooter />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    leagueScroll: {
        maxHeight: 56,
    },
    leagueRow: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.sm,
    },
    leagueChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    leagueChipActive: {
        backgroundColor: colors.accentDim,
        borderColor: colors.accent,
    },
    leagueEmoji: {
        fontSize: 16,
    },
    leagueText: {
        color: colors.textMuted,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    leagueTextActive: {
        color: colors.accent,
    },
    tabRow: {
        flexDirection: 'row',
        marginHorizontal: spacing.lg,
        backgroundColor: colors.card,
        borderRadius: borderRadius.md,
        padding: 3,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    tabBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: spacing.sm + 2,
        borderRadius: borderRadius.sm,
    },
    tabActive: {
        backgroundColor: colors.surface,
    },
    tabText: {
        color: colors.textMuted,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    tabTextActive: {
        color: colors.accent,
    },
    content: {
        flex: 1,
    },
    contentInner: {
        padding: spacing.lg,
        paddingBottom: 100,
    },
    scorersList: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    scorersTitle: {
        color: colors.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
        padding: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.cardBorder,
    },
    scorerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
    },
    scorerRowAlt: {
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    scorerRank: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    rankText: {
        color: colors.text,
        fontSize: fontSize.md,
        fontWeight: '800',
    },
    scorerInfo: {
        flex: 1,
    },
    scorerName: {
        color: colors.text,
        fontSize: fontSize.md,
        fontWeight: '600',
    },
    scorerTeam: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        marginTop: 2,
    },
    scorerGoals: {
        alignItems: 'center',
    },
    goalsNumber: {
        color: colors.accent,
        fontSize: fontSize.xl,
        fontWeight: '800',
    },
    goalsLabel: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
    },
});
