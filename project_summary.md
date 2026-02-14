# Sport Zone - Résumé du Projet et Défis Techniques

## 📝 Présentation du Projet
**Sport Zone** est une application multiplateforme (Web, Android, Windows) conçue pour centraliser le streaming sportif en direct. L'application propose des scores en temps réel, des résumés de matchs (highlights) et l'accès à une playlist IPTV premium.

### Stack Technique
- **Frontend** : React Native (Expo) pour une base de code unique.
- **Web Player** : `mpegts.js` et `hls.js` pour une lecture fluide des flux IPTV.
- **Backend (Proxy)** : Node.js (Express) déployé sur **Oracle Cloud Infrastructure**.
- **Moteur de Transcodage** : **FFmpeg** pour la conversion audio en temps réel.

---

## 🛠️ Défis Rencontrés et Solutions

### 1. Blocages CORS (Navigateur Web)
- **Problème** : Les navigateurs web interdisent de télécharger une playlist IPTV (.m3u) directement depuis un serveur tiers pour des raisons de sécurité.
- **Solution** : Création d'un **Proxy de Streaming**. L'application demande au serveur proxy de récupérer la liste pour elle, contournant ainsi les restrictions CORS.

### 2. Absence de Son (Format AC3/Dolby)
- **Problème** : La plupart des flux IPTV utilisent le format audio AC3 (Dolby Digital Plus). Les navigateurs (Chrome, Safari) ne savent pas lire ce format nativement, ce qui rendait les chaînes muettes sur le Web.
- **Solution** : Utilisation de **FFmpeg** sur le serveur. Chaque flux est traité à la volée : la vidéo est copiée telle quelle (pas de perte de qualité) et le son est converti en **AAC** (format universel pour le Web).

### 3. Instabilité et Coupures de Flux
- **Problème** : Les flux IPTV sont souvent instables. La moindre micro-coupure de connexion faisait planter le lecteur vidéo.
- **Solution** : 
    - **Côté Serveur** : Ajout de drapeaux de reconnexion dans FFmpeg (`-reconnect`).
    - **Côté Application** : Mise en place d'un "Stash Buffer" de **5 secondes**. L'application télécharge toujours 5 secondes d'avance pour absorber les ralentissements réseau.
    - **Bouton Reload** : Ajout d'une option manuelle pour relancer le flux instantanément en cas de gel complet.

### 4. Déploiement Cloud (Oracle Cloud)
- **Problème** : Difficultés initiales à créer une instance (problèmes de capacité Oracle) et pare-feu Linux bloquant les ports par défaut.
- **Solution** : Configuration d'une instance **Standard.E2.1.Micro** (toujours gratuit) et ouverture manuelle des ports (3005) via la console Oracle ET les règles `iptables` du serveur Ubuntu.

---

## 🚀 Conclusion
L'architecture actuelle est **industrielle** et **robuste**. 
Grâce au serveur Cloud, l'application fonctionne désormais de manière identique sur Windows, Android et Web, offrant une expérience premium sans les limitations habituelles des navigateurs.

**Le système est 100% opérationnel.** 🥇⚽️🔊
