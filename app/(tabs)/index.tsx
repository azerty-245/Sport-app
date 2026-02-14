import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import LegalFooter from '../../components/LegalFooter';
import MatchCard from '../../components/MatchCard';
import { MatchSkeleton } from '../../components/SkeletonCards';
import { borderRadius, colors, fontSize, shadows, spacing } from '../../constants/theme';
import { getLiveScores } from '../../services/api';

export default function LiveScreen() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subscribedMatches, setSubscribedMatches] = useState<Set<string>>(new Set());

  const matchesRef = useRef<any[]>([]);
  const subscribedRef = useRef<Set<string>>(new Set());

  // Keep refs in sync with state
  useEffect(() => { matchesRef.current = matches; }, [matches]);
  useEffect(() => { subscribedRef.current = subscribedMatches; }, [subscribedMatches]);

  // Load subscriptions on mount
  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    try {
      const stored = await AsyncStorage.getItem('subscribedMatches');
      if (stored) {
        const ids = JSON.parse(stored);
        setSubscribedMatches(new Set(ids));
      }
    } catch (e) { console.error('Failed to load subscriptions', e); }
  };

  const toggleSubscription = async (matchId: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newSet = new Set(subscribedMatches);
    if (newSet.has(matchId)) {
      newSet.delete(matchId);
    } else {
      newSet.add(matchId);
      // Notification service will pick this up
    }
    setSubscribedMatches(newSet);
    try {
      await AsyncStorage.setItem('subscribedMatches', JSON.stringify(Array.from(newSet)));
    } catch (e) { console.error(e); }
  };

  const fetchData = useCallback(async () => {
    try {
      const data = await getLiveScores();
      const newMatches = data.matches || [];

      setMatches(newMatches);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const filteredMatches = matches.filter((m) => {
    // Status filter
    let matchesStatus = true;
    if (filter === 'live') matchesStatus = m.status !== 'Full Time' && m.status !== 'Unknown' && m.status !== 'Not Started';
    if (filter === 'finished') matchesStatus = m.status === 'Full Time';
    if (filter === 'upcoming') matchesStatus = m.status === 'Unknown' || m.status === 'Not Started';

    // Search filter
    let matchesSearch = true;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      matchesSearch = (
        (m.homeTeam?.toLowerCase() || '').includes(q) ||
        (m.awayTeam?.toLowerCase() || '').includes(q) ||
        (m.league?.toLowerCase() || '').includes(q)
      );
    }

    return matchesStatus && matchesSearch;
  });

  // Group by section
  const grouped = filteredMatches.reduce((acc, match) => {
    const league = match.league || 'Other';
    if (!acc[league]) acc[league] = [];
    acc[league].push(match);
    return acc;
  }, {} as Record<string, any[]>);

  const sections: { league: string; data: any[] }[] = Object.entries(grouped).map(([league, items]) => ({
    league,
    data: items as any[],
  }));

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'live', label: '🔴 Live' },
    { key: 'finished', label: 'Finished' },
    { key: 'upcoming', label: 'Upcoming' },
  ];

  const flatListRef = useRef<FlatList>(null);

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          <View style={{ marginTop: spacing.xl }}>
            {[1, 2, 3, 4].map(i => <MatchSkeleton key={i} />)}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search match (team or league)..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>{matches.length}</Text>
          <Text style={styles.summaryLabel}>Matches</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: colors.live }]}>
            {matches.filter(m => m.status !== 'Full Time' && m.status !== 'Unknown' && m.status !== 'Not Started').length}
          </Text>
          <Text style={styles.summaryLabel}>Live</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {matches.filter(m => m.status === 'Full Time').length}
          </Text>
          <Text style={styles.summaryLabel}>Finished</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterActive]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync();
              setFilter(f.key);
            }}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Match list */}
      <FlatList
        ref={flatListRef}
        data={sections}
        keyExtractor={(item, index) => item.league + index}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{item.league}</Text>
            {item.data.map((match: any) => (
              <MatchCard
                key={match.id}
                match={match}
                subscribed={subscribedMatches.has(match.id)}
                onToggleNotification={() => toggleSubscription(match.id)}
              />
            ))}
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="football-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>No matches found</Text>
              <Text style={styles.emptySubText}>
                There are no matches currently playing in this category.
                Check "Upcoming" for later fixtures.
              </Text>
            </View>
          )
        }
        ListFooterComponent={<LegalFooter />}
      />

      {/* Scroll Shortcuts */}
      <View style={styles.scrollShortcuts}>
        <TouchableOpacity style={styles.scrollBtn} onPress={scrollToTop}>
          <Ionicons name="arrow-up" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.scrollBtn} onPress={scrollToBottom}>
          <Ionicons name="arrow-down" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
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
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontSize: fontSize.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    height: 48,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    height: '100%',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryNumber: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.cardBorder,
  },
  summaryItemWithColor: {
    flex: 1,
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  filterTextActive: {
    color: colors.accent,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
    paddingLeft: spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  emptySubText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.sm,
  },
  scrollShortcuts: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 20,
    gap: spacing.md,
  },
  scrollBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.small,
  },
});
