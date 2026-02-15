import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { LogBox, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

// Ignore specific warnings
LogBox.ignoreLogs(['Listening to push token changes']);

import CookieBanner from '../components/CookieBanner';
import CustomErrorBoundary from '../components/ErrorBoundary';
import { useConnectivity } from '../services/connectivity';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

function OfflineBanner() {
  const isConnected = useConnectivity();
  if (isConnected) return null;

  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineText}>Offline Mode - Check your connection</Text>
    </View>
  );
}

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();


import { useMatchNotifications } from '../hooks/useMatchNotifications';

import { Analytics } from '@vercel/analytics/react';

export default function RootLayout() {
  useMatchNotifications();
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <CustomErrorBoundary>
      <ThemeProvider value={DarkTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="legal" options={{ presentation: 'modal' }} />
        </Stack>
        <OfflineBanner />
        <CookieBanner />
        {/* Vercel Analytics - Tracks Web and Windows (Remote) users */}
        <Analytics />
      </ThemeProvider>
    </CustomErrorBoundary>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: '#ff6b6b',
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  offlineText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  }
});
