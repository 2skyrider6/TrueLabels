import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import { ResultProvider } from '@/context/ResultContext';
import { appEnvironment, isDevelopment, sentryDsn } from '@/config/env';
import { colors, typography } from '@/theme/tokens';
import { useEffect } from 'react';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: appEnvironment,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 20000,
    tracesSampleRate: isDevelopment ? 0 : 0.05,
    profilesSampleRate: isDevelopment ? 0 : 0.05,
    enableLogs: !isDevelopment,
    sendDefaultPii: false,
  });
}

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ResultProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: {
            ...typography.subheading,
            color: colors.text,
          },
          // A hairline rather than a heavy divider keeps the chrome quiet.
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'TrueLabels', headerShown: false }} />
        <Stack.Screen name="label-scan" options={{ title: 'Scan label' }} />
        <Stack.Screen name="paste" options={{ title: 'Type ingredients' }} />
        <Stack.Screen name="result" options={{ title: 'Result' }} />
        <Stack.Screen name="not-found" options={{ title: 'Product not found' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
      </Stack>
    </ResultProvider>
  );
}

const WrappedRootLayout = Sentry.wrap(RootLayout);

export { WrappedRootLayout as default };
