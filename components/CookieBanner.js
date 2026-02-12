import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, fontSize, shadows, spacing } from '../constants/theme';

export default function CookieBanner() {
    const [visible, setVisible] = useState(false);
    const fadeAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        checkConsent();
    }, []);

    const checkConsent = async () => {
        try {
            const consent = await AsyncStorage.getItem('cookieConsent');
            if (!consent) {
                setVisible(true);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }).start();
            }
        } catch (e) {
            console.error('Failed to check cookie consent', e);
        }
    };

    const acceptConsent = async () => {
        try {
            await AsyncStorage.setItem('cookieConsent', 'accepted');
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start(() => setVisible(false));
        } catch (e) {
            console.error('Failed to save cookie consent', e);
        }
    };

    if (!visible) return null;

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
            <View style={styles.content}>
                <Text style={styles.text}>
                    We use cookies to improve your experience. By using Sport Zone, you agree to our use of cookies.
                </Text>
                <TouchableOpacity style={styles.button} onPress={acceptConsent}>
                    <Text style={styles.buttonText}>Accept</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: spacing.xxl + 60, // Above tab bar
        left: spacing.lg,
        right: spacing.lg,
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.accent,
        ...shadows.card,
        zIndex: 9999,
    },
    content: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.md,
    },
    text: {
        color: colors.text,
        fontSize: fontSize.sm,
        textAlign: 'center',
        lineHeight: 18,
    },
    button: {
        backgroundColor: colors.accent,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        width: '100%',
        alignItems: 'center',
    },
    buttonText: {
        color: colors.background,
        fontSize: fontSize.sm,
        fontWeight: '700',
    },
});
