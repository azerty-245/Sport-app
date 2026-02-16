# 🏆 Eben - Solution Digitale

**Eben** est une plateforme digitale multimédia polyvalente permettant de suivre l'actualité, de gérer des flux d'informations et d'accéder à des contenus multimédias intégrés.

---

## 🔥 Fonctionnalités Principales

### 📺 Portail Multimédia & Monétisation
- **Accès Sécurisé** : Gestion des flux via un proxy robuste (Oracle Cloud).
- **Optimisation** : Stabilité accrue via transcodage FFmpeg AAC.
- **Monétisation Android** : Publicités Start.io intégrées.
- **Monétisation Web** : Publicités Monetag (Vignette, In-Page Push, Direct Link).

### 📊 Données & Info
- **Actualisation Temps Réel** : Données et statistiques synchronisées.
- **Portail d'Actualités** : Flux continu d'informations traduit et optimisé.

---

## 🛠️ Architecture Technique

### 📱 Frontend (Expo / React Native)
- **Framework** : Expo Router.
- **UI** : Design Premium optimisé.

### ☁️ Backend (Oracle Cloud)
- **Proxy Node.js** : Serveur intermédiaire assurant la sécurité et l'isolation des sources de données.

---

## 📦 Installation & Déploiement

### 🌐 Web (Vercel)
```bash
npx expo export --platform web
npx vercel --prod
```

### 🤖 Android (APK)
Généré via EAS Build.
```bash
npx eas-cli build --platform android --profile preview
```

---

## 🤝 Crédits
Développé par **Eben**.
*Propulsé par Expo, React Native & Oracle Cloud.*
