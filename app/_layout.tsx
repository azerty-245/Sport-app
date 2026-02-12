import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

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


export default function RootLayout() {
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
