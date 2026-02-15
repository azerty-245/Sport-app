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
                    </Text>
                    <Text style={styles.sectionTitle}>1. Collecte des Données</Text>
                    <Text style={styles.paragraph}>
                        Nous collectons un minimum de données pour assurer le bon fonctionnement de l'application :
                        {"\n"}- **Données techniques** : Type d'appareil, système d'exploitation, pays de connexion (via l'adresse IP anonymisée).
                        {"\n"}- **Statistiques d'utilisation** : Pages visitées et temps passé sur l'application (via Vercel Analytics). Ces données sont anonymes et servent uniquement à améliorer nos services.
                        {"\n"}- **Préférences** : Vos choix de notifications (équipes suivies) sont stockés localement sur votre appareil.
                    </Text>

                    <Text style={styles.sectionTitle}>2. Utilisation des Données</Text>
                    <Text style={styles.paragraph}>
                        Les données collectées sont utilisées exclusivement pour :
                        {"\n"}- Analyser la performance de l'application et corriger les bugs.
                        {"\n"}- Vous envoyer des notifications de matchs (si activées).
                        {"\n"}- Adapter l'interface à votre appareil.
                        {"\n"}Aucune donnée personnelle n'est vendue ou partagée à des tiers publicitaires.
                    </Text>

                    <Text style={styles.sectionTitle}>3. Vos Droits</Text>
                    <Text style={styles.paragraph}>
                        Conformément au RGPD :
                        {"\n"}- Vous pouvez désactiver le suivi analytique en nous contactant.
                        {"\n"}- Vous pouvez gérer vos préférences de cookies via le bandeau dédié.
                        {"\n"}- Vous pouvez supprimer l'application à tout moment, ce qui effacera toutes les données locales.
                        {"\n"}Pour toute demande, contactez-nous à : support@sport-zone.app
                    </Text>

                    <Text style={styles.sectionTitle}>4. Hébergement</Text>
                    <Text style={styles.paragraph}>
                        Le site web et l'API sont hébergés par Vercel Inc. aux États-Unis et en Europe.
                        Les flux vidéo sont relayés par notre infrastructure sécurisée (Oracle Cloud).
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
    sectionTitle: {
        color: colors.accent,
        fontSize: fontSize.md,
        fontWeight: '700',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    paragraph: {
        color: colors.text,
        fontSize: fontSize.sm,
        lineHeight: 20,
        marginBottom: spacing.md,
    },
    footer: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        textAlign: 'center',
        marginTop: spacing.xl,
    }
});
