import "../global.css";
import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrinterProvider } from "../contexts/PrinterContext";
import { useStationStore } from "../stores/stationStore";
import { colors } from "../constants/theme";

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const hydrate = useStationStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}

function RootNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.white} translucent={false} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.white,
            ...(Platform.OS === "android" && {
              paddingTop: insets.top,
              height: 56 + insets.top,
            }),
          },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: "600", color: colors.black },
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: "Fuel Receipt" }} />
        <Stack.Screen name="printer-setup" options={{ title: "Bluetooth Printer" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrinterProvider>
        <AppBootstrap>
          <RootNavigator />
        </AppBootstrap>
      </PrinterProvider>
    </SafeAreaProvider>
  );
}
