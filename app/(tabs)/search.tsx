import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import LegalFooter from '../../components/LegalFooter';
import { borderRadius, colors, fontSize, shadows, spacing } from '../../constants/theme';
import { searchPlayer, searchTeam } from '../../services/api';

export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('player');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const router = useRouter();

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setSearched(true);
        try {
            const data = mode === 'player'
                ? await searchPlayer(query.trim())
                : await searchTeam(query.trim());
            setResults(data.results || data.players || data.teams || data || []);
        } catch (err) {
            console.error(err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const renderPlayerItem = ({ item }: { item: any }) => (
        <View style={styles.resultCard}>
            {item.photo && (
                <Image source={{ uri: item.photo }} style={styles.playerPhoto} />
            )}
            {!item.photo && (
                <View style={[styles.playerPhoto, styles.placeholderPhoto]}>
                    <Ionicons name="person" size={24} color={colors.textMuted} />
                </View>
            )}
            <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{item.name || item.player}</Text>
                <Text style={styles.resultSub}>{item.team || item.club}</Text>
                {item.nationality && <Text style={styles.resultDetail}>🌍 {item.nationality}</Text>}
                {item.position && <Text style={styles.resultDetail}>📋 {item.position}</Text>}
                {item.age && <Text style={styles.resultDetail}>🎂 Âge : {item.age}</Text>}
                {item.number && <Text style={styles.resultDetail}>🔢 Numéro : {item.number}</Text>}
                {item.height && <Text style={styles.resultDetail}>📏 Taille : {item.height}</Text>}
                {item.weight && <Text style={styles.resultDetail}>⚖️ Poids : {item.weight}</Text>}
                {item.birthDate && <Text style={styles.resultDetail}>📅 Né le : {item.birthDate}</Text>}
                {item.birthPlace && <Text style={styles.resultDetail}>📍 Lieu : {item.birthPlace}</Text>}
                {item.marketValue && <Text style={styles.resultDetail}>💰 Valeur : {item.marketValue}</Text>}
                {item.contractUntil && <Text style={styles.resultDetail}>📄 Contrat : {item.contractUntil}</Text>}
                {item.goals != null && <Text style={styles.resultDetail}>⚽ Buts : {item.goals}</Text>}
                {item.assists != null && <Text style={styles.resultDetail}>🅰️ Passes D. : {item.assists}</Text>}
                {item.appearances != null && <Text style={styles.resultDetail}>🏟️ Matchs : {item.appearances}</Text>}
            </View>
        </View>
    );

    const renderTeamItem = ({ item }: { item: any }) => (
        <View style={styles.resultCard}>
            {item.logo && (
                <Image source={{ uri: item.logo }} style={styles.teamLogo} />
            )}
            {!item.logo && (
                <View style={[styles.teamLogo, styles.placeholderPhoto]}>
                    <Ionicons name="football" size={24} color={colors.textMuted} />
                </View>
            )}
            <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{item.name || item.team}</Text>
                {item.country && <Text style={styles.resultSub}>🌍 {item.country}</Text>}
                {item.stadium && <Text style={styles.resultDetail}>🏟️ {item.stadium}</Text>}
                {item.capacity && <Text style={styles.resultDetail}>👥 Capacité : {item.capacity}</Text>}
                {item.founded && <Text style={styles.resultDetail}>📅 Fondé en : {item.founded}</Text>}
                {item.league && <Text style={styles.resultDetail}>🏆 Ligue : {item.league}</Text>}
                {item.coach && <Text style={styles.resultDetail}>👨‍💼 Entraîneur : {item.coach}</Text>}
                {item.website && <Text style={styles.resultDetail}>🌐 {item.website}</Text>}
                {item.colors && <Text style={styles.resultDetail}>🎨 Couleurs : {item.colors}</Text>}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Mode toggle */}
            <View style={styles.modeRow}>
                <TouchableOpacity
                    style={[styles.modeBtn, mode === 'player' && styles.modeActive]}
                    onPress={() => { setMode('player'); setResults([]); setSearched(false); }}
                >
                    <Ionicons name="person" size={16} color={mode === 'player' ? colors.accent : colors.textMuted} />
                    <Text style={[styles.modeText, mode === 'player' && styles.modeTextActive]}>Joueur</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.modeBtn, mode === 'team' && styles.modeActive]}
                    onPress={() => { setMode('team'); setResults([]); setSearched(false); }}
                >
                    <Ionicons name="football" size={16} color={mode === 'team' ? colors.accent : colors.textMuted} />
                    <Text style={[styles.modeText, mode === 'team' && styles.modeTextActive]}>Équipe</Text>
                </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View style={styles.searchRow}>
                <View style={styles.inputWrapper}>
                    <Ionicons name="search" size={18} color={colors.textMuted} />
                    <TextInput
                        style={styles.input}
                        placeholder={mode === 'player' ? 'Rechercher un joueur (ex: Ronaldo)' : 'Rechercher une équipe (ex: Real Madrid)'}
                        placeholderTextColor={colors.textMuted}
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={handleSearch}
                        returnKeyType="search"
                    />
                </View>
                <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
                    <Ionicons name="arrow-forward" size={20} color={colors.background} />
                </TouchableOpacity>
            </View>

            {/* Results */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            ) : (
                <FlatList
                    data={Array.isArray(results) ? results : []}
                    keyExtractor={(item, i) => item.id || `${item.name}-${i}`}
                    renderItem={mode === 'player' ? renderPlayerItem : renderTeamItem}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        searched ? (
                            <View style={styles.empty}>
                                <Ionicons name="search-outline" size={48} color={colors.textMuted} />
                                <Text style={styles.emptyText}>Aucun résultat pour "{query}"</Text>
                            </View>
                        ) : (
                            <View style={styles.empty}>
                                <Ionicons name="football-outline" size={64} color={colors.cardBorder} />
                                <Text style={styles.emptyTitle}>Rechercher des {mode === 'player' ? 'Joueurs' : 'Équipes'}</Text>
                                <Text style={styles.emptyText}>
                                    Trouvez n'importe quel {mode === 'player' ? 'joueur de football' : 'équipe'} par nom
                                </Text>
                            </View>
                        )
                    }
                    ListFooterComponent={<LegalFooter />}
                />
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
    modeRow: {
        flexDirection: 'row',
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        backgroundColor: colors.card,
        borderRadius: borderRadius.md,
        padding: 3,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    modeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: spacing.sm + 2,
        borderRadius: borderRadius.sm,
    },
    modeActive: {
        backgroundColor: colors.surface,
    },
    modeText: {
        color: colors.textMuted,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    modeTextActive: {
        color: colors.accent,
    },
    searchRow: {
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.sm,
    },
    inputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.inputBg,
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    input: {
        flex: 1,
        color: colors.text,
        fontSize: fontSize.md,
        paddingVertical: spacing.md,
    },
    searchBtn: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.md,
        backgroundColor: colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 100,
    },
    resultCard: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        gap: spacing.md,
        ...shadows.card,
    },
    playerPhoto: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    teamLogo: {
        width: 60,
        height: 60,
        borderRadius: borderRadius.md,
    },
    placeholderPhoto: {
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultInfo: {
        flex: 1,
    },
    resultName: {
        color: colors.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
    },
    resultSub: {
        color: colors.accent,
        fontSize: fontSize.sm,
        marginTop: 2,
    },
    resultDetail: {
        color: colors.textSecondary,
        fontSize: fontSize.sm,
        marginTop: 2,
    },
    empty: {
        alignItems: 'center',
        paddingTop: 80,
        gap: spacing.md,
    },
    emptyTitle: {
        color: colors.text,
        fontSize: fontSize.xl,
        fontWeight: '700',
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: fontSize.md,
        textAlign: 'center',
    },
    legalBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: spacing.xxl,
        paddingBottom: 40,
    },
    legalBtnText: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        textDecorationLine: 'underline',
    },
});
