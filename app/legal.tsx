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
                    title: 'Informations Légales',
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
                    <Text style={styles.title}>Politique de Confidentialité</Text>
                    <Text style={styles.text}>
                        Dernière mise à jour : 14 février 2026{"\n\n"}
                        Chez Sport Zone (Eben Tech), nous accordons une grande importance à votre vie privée.{"\n\n"}
                        1. Collecte de données : Nous collectons uniquement les données techniques minimales nécessaires au fonctionnement de l'application (préférences de notification, état du lecteur).{"\n\n"}
                        2. Services Tiers : Notre application interagit avec des API de données sportives et des services de streaming. Ces tiers ont leurs propres politiques de confidentialité.{"\n\n"}
                        3. Stockage Local : Nous utilisons le stockage local pour sauvegarder vos préférences et votre historique de navigation dans l'application.{"\n\n"}
                        4. Proxy Cloud : Pour assurer la stabilité et la compatibilité audio, les flux de streaming transitent par notre serveur proxy sécurisé sur Oracle Cloud. Aucune donnée personnelle n'est enregistrée lors de ce transit.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.title}>Conditions d'Utilisation</Text>
                    <Text style={styles.text}>
                        En utilisant Sport Zone, vous acceptez les conditions suivantes :{"\n\n"}
                        1. Usage : Cette application est destinée à un usage personnel et non commercial uniquement.{"\n\n"}
                        2. Propriété du Contenu : Eben Tech ne possède ni n'héberge aucun contenu de streaming. Les flux IPTV sont fournis "tels quels" par des fournisseurs externes.{"\n\n"}
                        3. Responsabilité : Eben Tech n'est pas responsable des interruptions de service, de la qualité des flux ou des inexactitudes dans les scores en direct.{"\n\n"}
                        4. Conformité : L'utilisateur est responsable de s'assurer que son utilisation des flux IPTV est conforme aux lois locales de sa juridiction.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.title}>Contactez-nous</Text>
                    <Text style={styles.text}>
                        Entreprise : Eben Tech{"\n"}
                        Téléphone : 00228 90884312{"\n"}
                        Email : akakakpoebenezer03@gmail.com{"\n"}
                        Adresse : Lomé, Togo
                    </Text>
                </View>

                <Text style={styles.footer}>© 2026 Eben Tech. Tous droits réservés.</Text>
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
