import { useEffect, useState, useCallback } from "react";
import { Platform, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrinterProvider } from "../contexts/PrinterContext";
import { useStationStore } from "../stores/stationStore";
import { Colors } from "../constants/theme";
import { logPrinterNativeModules } from "../src/services/printerNativeModule";
import { getInvoices } from "../src/services/InvoiceHistoryService";
import { PoweredBySplash } from "../components/PoweredBySplash";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const hydrate = useStationStore((s) => s.hydrate);
  const isHydrated = useStationStore((s) => s.isHydrated);
  const isProfileComplete = useStationStore((s) => s.isProfileComplete);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    hydrate();
    getInvoices().catch(() => undefined);
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated) return;
    if (isProfileComplete()) return;
    const onSettings = segments[0] === "settings";
    if (!onSettings) {
      router.replace("/settings?setup=1");
    }
  }, [isHydrated, isProfileComplete, segments, router]);

  return <>{children}</>;
}

function RootNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar style="light" backgroundColor={Colors.bg.primary} translucent={false} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: Colors.bg.primary,
            ...(Platform.OS === "android" && {
              paddingTop: insets.top,
              height: 56 + insets.top,
            }),
          },
          headerTintColor: Colors.text.accent,
          headerTitleStyle: { fontWeight: "600", color: Colors.text.primary },
          contentStyle: { backgroundColor: Colors.bg.primary },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: "Petro Slip Pro" }} />
        <Stack.Screen name="printer-setup" options={{ title: "Printer Setup", headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: "Settings", headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const isHydrated = useStationStore((s) => s.isHydrated);
  const [typingDone, setTypingDone] = useState(false);
  const [appReady, setAppReady] = useState(false);

  const handleTypingComplete = useCallback(() => {
    setTypingDone(true);
  }, []);

  useEffect(() => {
    if (Platform.OS === "android") {
      logPrinterNativeModules();
    }
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!typingDone || !isHydrated) return;
    setAppReady(true);
  }, [typingDone, isHydrated]);

  return (
    <SafeAreaProvider>
      <PrinterProvider>
        <View style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
          <AppBootstrap>
            {appReady ? <RootNavigator /> : null}
          </AppBootstrap>
          {!appReady ? <PoweredBySplash onTypingComplete={handleTypingComplete} /> : null}
        </View>
      </PrinterProvider>
    </SafeAreaProvider>
  );
}
