# 📝 Résumé du Projet Sport Zone

## 🎯 Objectif
Créer une application unique pour centraliser l'expérience du fan de football : regarder les matchs, consulter les scores et lire les news, le tout sur n'importe quel écran (PC, Mobile, Web).

## 🏗️ Architecture & Choix Techniques

### 1. Le Défi du Streaming Web (CORS & Audio)
Le plus grand défi a été de lire des flux IPTV (souvent en HTTP non sécurisé ou avec des codecs audio AC3 non supportés par les navigateurs) sur une application Web moderne.
**Solution :** Création d'un **Proxy Node.js sur Oracle Cloud**.
- **FFmpeg en temps réel** : Le serveur transcode l'audio AC3 en AAC (lisible partout).
- **Tunneling** : Le flux passe par le serveur, contournant les restrictions CORS et HTTPS du navigateur.

### 2. Une seule base de code (Expo)
Au lieu de maintenir 3 projets (Web, Android, Desktop), nous avons utilisé **Expo + React Native Web**.
- **95% du code est partagé**.
- **Electron** encapsule la version Web pour créer un `.exe` Windows natif.
- **EAS Build** génère l'APK Android optimisé.

### 3. Mises à jour OTA (Over-The-Air)
Un système de mise à jour "invisible" a été mis en place.
- **Avantage** : Plus besoin de demander aux utilisateurs de télécharger une nouvelle version pour corriger une faute de frappe ou changer une couleur.
- **Vitesse** : Déploiement en 30 secondes via `eas update`.

## 🔒 Sécurité Mise en Place
- **Proxy** : Les identifiants IPTV ne quittent jamais le serveur Oracle. L'application ne connaît que l'adresse du proxy.
- **Variables d'environnement** : Utilisation stricte de `.env` pour toutes les clés API.
- **Git** : Nettoyage strict des fichiers sensibles et binaires lourds (`ffmpeg.exe`) pour un dépôt propre.

## 🚀 État Actuel
- **Web** : 🟢 Déployé sur Vercel (Monétisation Monetag active).
- **Android** : 🟢 APK généré avec publicités Start.io intégrées.
- **Windows** : 🟢 Build Electron prêt et sécurisé.
- **Sécurité** : 🟢 Toutes les IPs privées ont été retirées du code source.
- **Légal** : 🟢 Politique de confidentialité à jour incluant les partenaires pub.

## � Prochaines Étapes Possibles
- Ajouter des notifications Push pour les buts (via Expo Notifications).
- Intégrer un mode "Multi-View" pour regarder 2 matchs en même temps (possible grâce à la puissance du Proxy).
- Ajouter un chat en direct pendant les matchs.

---
*Dernière mise à jour : 15/02/2026 - Version 1.1.0*
