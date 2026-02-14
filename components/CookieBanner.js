import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, fontSize, shadows, spacing } from '../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
            <View style={styles.container}>
                <View style={styles.iconRow}>
                    <Ionicons name="football" size={40} color={colors.accent} />
                </View>
                <Text style={styles.title}>Bienvenue sur Sport Zone ⚽</Text>
                <Text style={styles.text}>
                    Votre application tout-en-un pour le sport en direct :{"\n\n"}
                    📺  Streaming IPTV de chaînes sportives{"\n"}
                    ⚽  Scores en direct et classements{"\n"}
                    📰  Actualités football{"\n"}
                    🔍  Recherche de joueurs et équipes{"\n\n"}
                    En continuant, vous acceptez notre <Link href="/legal" style={styles.link}>politique de confidentialité</Link> et l'utilisation de cookies pour améliorer votre expérience.
                </Text>
                <TouchableOpacity style={styles.button} onPress={acceptConsent}>
                    <Text style={styles.buttonText}>C'est parti ! </Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
    },
    container: {
        marginHorizontal: spacing.xl,
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        borderWidth: 1,
        borderColor: colors.accent,
        ...shadows.card,
        maxWidth: 400,
        width: '90%',
    },
    iconRow: {
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    title: {
        color: colors.text,
        fontSize: fontSize.xl,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    text: {
        color: colors.textSecondary,
        fontSize: fontSize.md,
        lineHeight: 24,
        marginBottom: spacing.lg,
    },
    button: {
        backgroundColor: colors.accent,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.full,
        width: '100%',
        alignItems: 'center',
    },
    buttonText: {
        color: colors.background,
        fontSize: fontSize.md,
        fontWeight: '700',
    },
    link: {
        color: '#ff4757',
        fontWeight: 'bold',
        textDecorationLine: 'underline',
    },
});
