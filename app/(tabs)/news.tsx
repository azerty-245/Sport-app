import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import LegalFooter from '../../components/LegalFooter';
import NewsCard from '../../components/NewsCard';
import { colors, fontSize, spacing } from '../../constants/theme';
import { getNews } from '../../services/api';

export default function NewsScreen() {
    const [articles, setArticles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const data = await getNews();
            setArticles(data.data?.items || data.items || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>Chargement des actualités...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={articles}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <NewsCard article={item} onPress={() => { }} />
                )}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
                }
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Actualités Football</Text>
                        <Text style={styles.headerSub}>{articles.length} articles</Text>
                    </View>
                }
                ListFooterComponent={<LegalFooter />}
            />
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
    header: {
        marginBottom: spacing.lg,
    },
    headerTitle: {
        color: colors.text,
        fontSize: fontSize.xxl,
        fontWeight: '800',
    },
    headerSub: {
        color: colors.textMuted,
        fontSize: fontSize.sm,
        marginTop: 4,
    },
    list: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: 100,
    },
});
