
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Start.io App ID provided by user
const STARTIO_APP_ID = '201699988';

export default function StartIoBanner() {
    // Start.io ads configured here are primarily for the Android APK.
    // On Web and Windows, we hide them to avoid errors with the Android-only ID.
    if (Platform.OS !== 'android') {
        return null;
    }

    // Mobile Web Tag integration for Start.io inside a WebView
    // This is the safest way to integrate without breaking EAS builds.
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; background: transparent; display: flex; justify-content: center; align-items: center; height: 100vh; }
        </style>
      </head>
      <body>
        <!-- Start.io Ad Tag Placeholder -->
        <script>
          window.startio = window.startio || function() { (window.startio.q = window.startio.q || []).push(arguments) };
          window.startio('init', '${STARTIO_APP_ID}');
          window.startio('banner', 'startio-banner');
        </script>
        <div id="startio-banner"></div>
        <script src="https://cdn.startapp.com/sdk/javascript/1.5.0/startapp.js"></script>
      </body>
    </html>
  `;

    return (
        <View style={styles.container}>
            <WebView
                originWhitelist={['*']}
                source={{ html }}
                scrollEnabled={false}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                transparent={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 60,
        width: '100%',
        backgroundColor: '#000',
        borderTopWidth: 1,
        borderTopColor: '#222',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
