import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';

/**
 * Simple footer link to the Legal Information page.
 * Designed to be used as ListFooterComponent in FlatLists or at the bottom of ScrollViews.
 */
export default function LegalFooter() {
    const router = useRouter();

    return (
        <TouchableOpacity style={styles.legalBtn} onPress={() => router.push('/legal')}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <Text style={styles.legalBtnText}>Legal Information & Privacy</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
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
