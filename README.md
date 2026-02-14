# Sport Zone

**Sport Zone** is a cross-platform (Web, Android, Windows) application for following live football scores, matches, and streaming live TV channels.

## Features

-   **Live Scores & Statistics**: Real-time updates for football matches worldwide.
-   **Live TV Streaming**: Watch sports channels directly within the app (IPTV integration).
    -   *Supports MPEG-TS and HLS streams natively.*
-   **Match Highlights**: Replay goals and key moments.
-   **Cross-Platform**:
    -   📱 **Android**: Optimized mobile experience.
    -   💻 **Windows**: Desktop application with native window management.
    -   🌐 **Web**: Responsive web app.

## Tech Stack

-   **Framework**: [React Native](https://reactnative.dev/) with [Expo](https://expo.dev/).
-   **Navigation**: [Expo Router](https://docs.expo.dev/router/introduction/).
-   **Desktop**: [Electron](https://www.electronjs.org/) for Windows build.
-   **Video Player**: HTML5 Video with [hls.js](https://github.com/video-dev/hls.js) and [mpegts.js](https://github.com/xqq/mpegts.js) for robust stream support.

## Prerequisites

-   [Node.js](https://nodejs.org/) (LTS version recommended).
-   [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`.
-   [EAS CLI](https://docs.expo.dev/eas/): `npm install -g eas-cli` (for Android builds).

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/sport-zone.git
    cd sport-zone
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

## Configuration

Create a `.env` file in the root directory with your API keys:

```ini
EXPO_PUBLIC_FOOTBALL_API_KEY=your_api_key_here
EXPO_PUBLIC_IPTV_URL=http://your-iptv-provider.com/playlist.m3u
```

> **Note:** The application uses `mpegts.js` to play raw MPEG-TS streams from IPTV providers without triggering file downloads.

## Running Locally

### Development (Web & Mobile)
Start the Expo development server:
```bash
npm start
```
-   Press `w` for Web.
-   Press `a` for Android (requires Emulator or connected device).

### Development (Windows / Electron)
Run the Electron app in development mode:
```bash
npm run electron:start
```

## Building for Production

### 1. Web (Static Site)
Build the static website for hosting (e.g., Vercel, Netlify):
```bash
npm run build:web
```
*Output directory: `dist/`*

### 2. Android (APK)
Build the Android APK using EAS Build:
```bash
npm run build:android
```
*Note: Requires an Expo account and configured EAS project.*

### 3. Windows (Portable Exe)
Build the Windows executable:
```bash
npm run build:windows
```
*Output directory: `dist-electron/`*

## Troubleshooting

-   **IPTV streams download instead of play?**
    Ensure you are using the latest version of `streaming.tsx` which includes the `mpegts.js` integration. The app is configured to block direct downloads of stream files in `main.mjs`.

-   **Electron build fails?**
    Make sure you have run `npm install` and that `electron-builder` is installed correctly.

## License

MIT
