import { useEffect } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { borderRadius, colors, spacing } from '../constants/theme';

const SkeletonBase = ({ width, height, style }) => {
    const opacity = new Animated.Value(0.3);

    useEffect(() => {
        const useNativeDriver = Platform.OS !== 'web';
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 1000,
                    useNativeDriver,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 1000,
                    useNativeDriver,
                }),
            ])
        ).start();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                styles.skeleton,
                { width, height, opacity },
                style,
            ]}
        />
    );
};

export const MatchSkeleton = () => (
    <View style={styles.card}>
        <View style={styles.row}>
            <SkeletonBase width={60} height={12} style={{ marginBottom: spacing.sm }} />
            <SkeletonBase width={30} height={12} style={{ marginBottom: spacing.sm }} />
        </View>
        <View style={styles.matchRow}>
            <View style={styles.team}>
                <SkeletonBase width={32} height={32} style={{ borderRadius: 16 }} />
                <SkeletonBase width={80} height={12} style={{ marginTop: spacing.xs }} />
            </View>
            <SkeletonBase width={40} height={24} />
            <View style={styles.team}>
                <SkeletonBase width={32} height={32} style={{ borderRadius: 16 }} />
                <SkeletonBase width={80} height={12} style={{ marginTop: spacing.xs }} />
            </View>
        </View>
    </View>
);

export const ChannelSkeleton = () => (
    <View style={styles.channelCard}>
        <SkeletonBase width={40} height={40} style={{ borderRadius: 20, marginRight: spacing.md }} />
        <View style={{ flex: 1 }}>
            <SkeletonBase width="70%" height={14} style={{ marginBottom: spacing.xs }} />
            <SkeletonBase width="40%" height={10} />
        </View>
        <SkeletonBase width={28} height={28} style={{ borderRadius: 14 }} />
    </View>
);

export const HighlightSkeleton = () => (
    <View style={styles.highlightCard}>
        <SkeletonBase width={120} height={80} />
        <View style={{ flex: 1, padding: spacing.sm }}>
            <SkeletonBase width="90%" height={12} style={{ marginBottom: spacing.xs }} />
            <SkeletonBase width="40%" height={10} />
        </View>
    </View>
)

const styles = StyleSheet.create({
    skeleton: {
        backgroundColor: colors.cardBorder, // Use border color or a slightly lighter/darker grey
        borderRadius: borderRadius.sm,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    matchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.sm,
    },
    team: {
        alignItems: 'center',
        width: 80,
    },
    channelCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    highlightCard: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.cardBorder,
    }
});
