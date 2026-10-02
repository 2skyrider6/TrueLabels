import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ResultProvider } from '@/context/ResultContext';
import { colors, typography } from '@/theme/tokens';

export default function RootLayout() {
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