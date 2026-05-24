import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrinterProvider>
        <AppBootstrap>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.white },
              headerTintColor: colors.primary,
              headerTitleStyle: { fontWeight: "600", color: colors.black },
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ title: "Fuel Receipt" }} />
            <Stack.Screen name="printer-setup" options={{ title: "Printer Setup" }} />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
          </Stack>
        </AppBootstrap>
      </PrinterProvider>
    </SafeAreaProvider>
  );
}
