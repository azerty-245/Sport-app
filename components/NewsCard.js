import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, fontSize, shadows, spacing } from '../constants/theme';

export default function NewsCard({ article, onPress }) {
    const coverUrl = article.cover?.url;
    const date = article.createdAt
        ? new Date(parseInt(article.createdAt)).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        })
        : '';

    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
            {coverUrl && (
                <View style={styles.imageContainer}>
                    <Image source={{ uri: coverUrl }} style={styles.image} resizeMode="cover" />
                    <View style={styles.imageOverlay} />
                </View>
            )}
            <View style={styles.content}>
                <Text style={styles.title} numberOfLines={2}>{article.title}</Text>
                <Text style={styles.summary} numberOfLines={3}>{article.summary}</Text>
                <View style={styles.footer}>
                    <Text style={styles.date}>{date}</Text>
                    {article.stat && (
                        <Text style={styles.views}>👁 {article.stat.viewCount}</Text>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...shadows.card,
    },
    imageContainer: {
        height: 180,
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        backgroundColor: 'transparent',
    },
    content: {
        padding: spacing.lg,
    },
    title: {
        color: colors.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
        lineHeight: 24,
        marginBottom: spacing.sm,
    },
    summary: {
        color: colors.textSecondary,
        fontSize: fontSize.sm,
        lineHeight: 20,
        marginBottom: spacing.md,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    date: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
    },
    views: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
    },
});
