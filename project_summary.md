# 📝 Résumé du Projet Eben

## 🎯 Objectif
Créer une plateforme digitale multimédia polyvalente permettant de suivre l'actualité, de gérer des flux d'informations et d'accéder à des contenus multimédias intégrés sur n'importe quel écran.

## 🏗️ Architecture & Choix Techniques

### 1. Le Défi de la Persistance (Timeout 10s & HTTPS)
Le défi principal a été de maintenir des flux IPTV (MPEG-TS) sur le Web, car Vercel Serverless coupe les connexions après 10 secondes et bloque les flux HTTP non sécurisés.
**Solution :** Architecture **Dual Proxy & Cloudflare Tunnel**.
- **Tunnel Sécurisé** : Exposition de la VM Oracle via Cloudflare (HTTPS) pour satisfaire les navigateurs et assurer des connexions illimitées.
- **Cache Intelligent** : Playlist stockée 7 jours avec Failover automatique de source.
- **Anti-Jitter** : FFmpeg tuné pour supprimer les micro-coupures et sauts d'image.

### 2. Une seule base de code (Expo)
- **Expo + React Native Web** pour une portabilité maximale.
- **EAS Build** pour le déploiement mobile.

### 3. Mises à jour OTA (Over-The-Air)
- Déploiement instantané des corrections via `eas update`.

## 🚀 État Actuel
- **Web** : 🟢 Déployé sur Vercel avec Tunnel Sécurisé actif.
- **Android** : 🟢 APK généré avec publicités Start.io intégrées.
- **Sécurité** : 🟢 HTTPS de bout en bout et isolation Zero-Exposure.
- **Légal** : 🟢 Politique de confidentialité et licence Eben à jour.

---
*Dernière mise à jour : 18/02/2026 - Version 1.3.0 (Streaming Stable)*
