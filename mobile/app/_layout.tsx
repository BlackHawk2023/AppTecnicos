// MUST BE FIRST - Global text color overrides
import './global-styles';

import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { RouteProvider } from '../contexts/RouteContext';
import { TextSizeProvider } from '../contexts/TextSizeContext';
import { useEffect, useState } from 'react';
import { DarkTheme, ThemeProvider, Theme } from '@react-navigation/native';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { useAppPermissions } from '../hooks/useAppPermissions';
import { PermissionGateScreen } from '../components/PermissionGateScreen';

// Custom Dark Theme - NO BLUE COLORS
// Override React Navigation's DarkTheme which has blue primary (#0a84ff)
const CustomDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#3498db',        // Cyan accent (not blue like system default)
    background: '#121212',     // Dark background
    card: '#1a1a1a',           // Dark card
    text: '#ffffff',           // White text
    border: '#333333',         // Dark border
    notification: '#3498db',   // Cyan for badges
  },
};

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors if splash screen is already hidden
});

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const { allGranted, permissions, isChecking, recheckPermissions } = useAppPermissions();

  // Load Ionicons font - required for standalone builds
  // In release/standalone, fonts are preloaded via expo-font plugin in app.json
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });

  // Single effect to handle app readiness with fast timeout
  useEffect(() => {
    let mounted = true;

    const makeReady = async () => {
      if (mounted) {
        setAppIsReady(true);
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          // Ignore splash errors
        }
      }
    };

    // If fonts loaded or errored, ready immediately
    if (fontsLoaded || fontError) {
      console.log('Fonts ready:', { fontsLoaded, fontError: !!fontError });
      makeReady();
    } else {
      // Fast timeout for debug mode - 2 seconds max
      const timer = setTimeout(() => {
        console.log('Font loading timeout - continuing without waiting');
        makeReady();
      }, 2000);

      return () => {
        mounted = false;
        clearTimeout(timer);
      };
    }

    return () => { mounted = false; };
  }, [fontsLoaded, fontError]);

  // Always wrap with SafeAreaProvider so hooks are available everywhere
  return (
    <SafeAreaProvider>
      {!appIsReady || isChecking ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
          <ActivityIndicator size="large" color="#3498db" />
        </View>
      ) : !allGranted ? (
        <PermissionGateScreen permissions={permissions} onRecheck={recheckPermissions} />
      ) : (
        <AuthProvider>
          <TextSizeProvider>
            <RouteProvider>
              <ThemeProvider value={CustomDarkTheme}>
                <Stack>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="detalle" options={{ title: 'Detalle de Servicio' }} />
                  <Stack.Screen name="servicio" options={{ headerShown: false }} />
                  <Stack.Screen name="auditoria-campo" options={{ headerShown: true }} />
                </Stack>
              </ThemeProvider>
            </RouteProvider>
          </TextSizeProvider>
        </AuthProvider>
      )}
    </SafeAreaProvider>
  );
}
