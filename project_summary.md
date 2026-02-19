# 📝 Résumé du Projet Eben

## 🎯 Objectif
Créer une plateforme digitale multimédia polyvalente permettant de suivre l'actualité sportive en direct, de gérer des flux IPTV MPEG-TS complexes sur le web, et d'assurer une expérience utilisateur fluide sans coupures (anti-jitter).

---

## 🏗️ Architecture Technique (Triple-Proxy)

Le projet utilise une architecture unique de "Triple-Proxy" pour contourner les limitations de Vercel (timeout 10s) et les blocages IP des fournisseurs.

### 1. Structure Globale du Projet

````mermaid
graph TD
    A[Client Expo App / Web] -->|Requêtes API| B[Vercel Serverless api/iptv.js]
    B -->|Bypass Blocage| C[SofaScore API]
    B -->|Routage Intelligent| D[Oracle VM Cloudflare Tunnel]
    D -->|Streaming / Playlist| E[IPTV Provider]
    
    subgraph "Oracle VM (Ubuntu)"
    D1[Cloudflare Tunnel Endpoint] --> D2[Express Proxy proxy.js]
    D2 --> D3[FFmpeg Engine Jitter-Fix]
    end
````

### 2. Organisation des Fichiers

#### **📂 Racine / (Local Repo)**
- **`app/`** : Code source React Native / Expo. Contient les onglets `Streaming`, `Leagues`, `News`.
- **`api/`** : Backend intelligent sur Vercel. Le fichier `iptv.js` gère le routage dynamique vers le tunnel Cloudflare.
- **`services/`** : Logique frontend.
    - `iptv.js` : Découverte automatique du tunnel, filtrage des chaînes sportives françaises, persistance locale (AsyncStorage).
    - `footballAPIs.js` : Accès aux scores via le proxy Vercel pour éviter les bans IP.
- **`server/`** : Code déployé sur la VM Oracle.
    - `proxy.js` : Serveur Express qui filtre la playlist (9MB -> 71KB) et transforme les flux MPEG-TS difficiles en flux HTTP stables.
    - `start-tunnel.sh` : Script Bash qui lance le tunnel Cloudflare et pousse l'URL vers GitHub via le "GitHub Bridge".
    - `update.sh` : Script d'automatisation de déploiement (git pull + restart pm2).

#### **📂 Oracle VM — `/home/ubuntu/sport-app-sync/`**
- **`proxy.js`** : Fichier principal exécuté par PM2.
- **`tunnel_url.txt`** : Contient l'URL dynamique du tunnel Cloudflare (ex: `https://...trycloudflare.com`).
- **`.env`** : Variables d'environnement critiques (URL IPTV, Clé API, GitHub Token).

---

## 🛠️ Oracle VM — Connexion & Maintenance

| Paramètre | Valeur |
|-----------|--------|
| **IP Publique** | `152.70.45.91` (Note: Souvent bloquée, utiliser le tunnel) |
| **Utilisateur** | `ubuntu` |
| **Tunnel Actuel** | `https://determined-satisfaction-richard-seeks.trycloudflare.com` |
| **Clé SSH** | `C:\Users\USER\Downloads\ssh-key-2026-02-14.key` |
| **Outil Process** | PM2 (`streaming-proxy`) |

### 🔄 Cycle de Mise à Jour (Recommandé)
```bash
# 1. En local (après modification du code dans /server)
git add -f server/proxy.js
git commit -m "MAJ Proxy"
git push origin master

# 2. Déploiement VM (One-liner)
ssh -i "C:\[CHEMIN_VERS_CLE]" ubuntu@152.70.45.91 "cd ~/sport-app-sync && ./update.sh"
```

---

## 🐛 Historique des Problèmes & Solutions

| # | Problème Rencontré | Cause Technique | Solution Appliquée |
|---|-------------------|-------------------|--------------------|
| **1** | **Gateway Timeout 504** | La playlist originale fait 9MB. Vercel a un timeout de 10s. Le fetch prenait 14s. | **Filtrage Intelligent** : La VM Oracle prétraite la playlist pour ne garder que ~300 chaînes sportives/FR (**71KB**). |
| **2** | **Blocage IP (Oracle)** | Oracle est souvent listé comme "Datacenter" et bloqué par les fournisseurs ou SofaScore. | **Proxy Direct Vercel** : Les scores passent directement par l'IP résidentielle de Vercel. Les streams passent par **Cloudflare Tunnel**. |
| **3** | **Mixed Content (SSL)** | Les navigateurs bloquent les flux HTTP (`http://152...`) sur un site HTTPS. | **Cloudflare Tunnel** : Fournit une URL HTTPS (`https://...trycloudflare.com`) sécurisée de bout en bout. |
| **4** | **URL Tunnel Dynamique** | L'URL Cloudflare change à chaque reboot de la VM. | **GitHub Bridge** : La VM écrit son URL dans `tunnel_url.txt` et la pousse sur GitHub. L'app la récupère automatiquement. |
| **5** | **Micro-Coupures (Jitter)** | Les flux MPEG-TS sont instables sur le web. | **Engine FFmpeg** : On utilise FFmpeg sur la VM avec un buffer optimisé pour lisser le flux avant de l'envoyer au client. |
| **6** | **Playlist Vide (0 bytes)** | Double-encodage des paramètres d'URL lors du passage par le proxy Vercel. | **Path Extraction Nettoyé** : Réécriture du proxy pour utiliser des URLs "propres" sans double-traitement du query. |
| **7** | **Cold Start Slowness** | Vercel timeout quand la VM doit rafraîchir son cache. | **Stale-While-Revalidate** : La VM renvoie immédiatement le cache "stale" tout en rafraîchissant en arrière-plan. |

---

## 📈 Prochaines Étapes
- [ ] Optimisation de la latence du tunnel.
- [ ] Ajout de redondance (plusieurs tunnels).
- [ ] Dashboard de monitoring de l'état de la plateforme sur l'onglet `Streaming`.

*Dernière mise à jour : 19/02/2026 - Version 1.5.0 (Triple-Proxy Architecture & GitHub Bridge Sync)*
