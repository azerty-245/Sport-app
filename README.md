# 🏆 Sport Zone - Streaming & Live Scores

**Sport Zone** est une application multiplateforme (Web, Android, Windows) permettant de suivre le football en direct : streaming IPTV, scores en temps réel, actualités et statistiques détaillées.

---

## 🔥 Fonctionnalités Principales

### 📺 Live Streaming
- **IPTV Intégré** : Accès aux chaînes sportives (Canal+, beIN, RMC, etc.) via un proxy sécurisé.
- **Proxy Oracle Cloud** : Contourne les blocages CORS et assure la stabilité (transcodage FFmpeg AAC).
- **Lecteur optimisé** : Buffer intelligent (5s) pour éviter les coupures.

### ⚽️ Scores & Stats
- **Traqueurs en direct** : Scores mis à jour en temps réel pour toutes les ligues majeures (Ligue 1, Premier League, Liga, etc.).
- **Recherche Avancée** : Fiches détaillées pour joueurs (valeur marchande, contrat, stats physiques) et équipes (stade, staff, historique).

### 📰 Actualités
- **Flux continu** : Dernières news football traduites en français.
- **Interface fluide** : Lecture rapide sans quitter l'application.

---

## 🛠️ Architecture Technique

### 📱 Frontend (Expo / React Native)
- **Framework** : Expo Router (File-based routing).
- **UI** : React Native Paper + Styles personnalisés (Dark Mode par défaut).
- **Navigation** : Tabs (Streaming, News, Scores, Recherche).

### ☁️ Backend (Oracle Cloud)
- **Proxy Node.js** : Serveur intermédiaire hébergé sur une instance Oracle Cloud (Francfort).
- **Rôle** : 
  - Masque les identifiants IPTV.
  - Convertit les flux pour le web (HLS/MPEG-TS).
  - Gère les headers CORS et Referer.

### 🔒 Sécurité
- **Obfuscation** : Code minifié en production.
- **Variables d'environnement** : `EXPO_PUBLIC_*` injectées au build (pas de secrets dans le code source).
- **Git** : Fichiers sensibles (`ffmpeg.exe`, `.env`, scripts de test) exclus du dépôt.

---

## 📦 Installation & Déploiement

### 🌐 Web (Vercel)
L'application est hébergée gratuitement sur Vercel avec le preset **Vite**.
```bash
# Build & Deploy
npx expo export --platform web
npx vercel --prod
```

### 🤖 Android (APK)
Généré via **EAS Build** (Expo Application Services).
```bash
# Générer l'APK
npx eas-cli build --platform android --profile preview
```

### 💻 Windows (Electron)
Portage desktop via **Electron**.
```bash
# Créer l'exécutable Windows
npx expo export --platform web
npx electron-builder --win
```

### 🔄 Mises à jour (OTA)
Les mises à jour JS (textes, couleurs, bugs) sont poussées instantanément sans réinstaller l'app.
```bash
npx eas-cli update --branch preview --message "Correction mineure"
```

---

## 🤝 Crédits
Développé par **Eben-Tech**.
*Propulsé par Expo, React Native & Oracle Cloud.*
