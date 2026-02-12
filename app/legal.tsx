import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../constants/theme';

export default function LegalScreen() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'Legal Information',
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: spacing.md }}>
                            <Ionicons name="arrow-back" size={24} color={colors.text} />
                        </TouchableOpacity>
                    ),
                }}
            />
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={styles.title}>Privacy Policy</Text>
                    <Text style={styles.text}>
                        Last updated: February 12, 2026{"\n\n"}
                        At Sport Zone (Eben Tech), we value your privacy. This policy explains how we collect and use your data.{"\n\n"}
                        1. Data Collection: We collect minimal data required for app functionality, such as notification preferences.{"\n\n"}
                        2. Third-Party Services: Our app interacts with football data APIs and news providers. These services may have their own privacy policies.{"\n\n"}
                        3. Cookies: We use local storage (cookies equivalent) to save your preferences and app state.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.title}>Terms of Service</Text>
                    <Text style={styles.text}>
                        By using Sport Zone, you agree to the following terms:{"\n\n"}
                        1. Usage: This app is for personal, non-commercial use only.{"\n\n"}
                        2. Content: Streaming content and news are provided "as is" by external vendors. Eben Tech does not host the streaming content.{"\n\n"}
                        3. Liability: Eben Tech is not responsible for any inaccuracies in match data or service interruptions.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.title}>Contact Us</Text>
                    <Text style={styles.text}>
                        Company: Eben Tech{"\n"}
                        Phone: 00228 90884312{"\n"}
                        Email: akakakpoebenezer03@gmail.com{"\n"}
                        Address: Lome, Togo
                    </Text>
                </View>

                <Text style={styles.footer}>© 2026 Eben Tech. All rights reserved.</Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: spacing.lg,
        paddingBottom: 40,
    },
    section: {
        marginBottom: spacing.xxl,
        backgroundColor: colors.card,
        padding: spacing.lg,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    title: {
        color: colors.accent,
        fontSize: fontSize.lg,
        fontWeight: '700',
        marginBottom: spacing.md,
    },
    text: {
        color: colors.text,
        fontSize: fontSize.md,
        lineHeight: 22,
    },
    footer: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        textAlign: 'center',
        marginTop: spacing.xl,
    }
});
