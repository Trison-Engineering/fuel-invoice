import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useEffect } from "react";
import { usePrinterContext } from "../contexts/PrinterContext";
import { colors, spacing } from "../constants/theme";

export default function PrinterSetupScreen() {
  const printer = usePrinterContext();

  useEffect(() => {
    if (!printer.connectedDevice) {
      printer.autoReconnect();
    }
  }, [printer.connectedDevice, printer.autoReconnect]);

  return (
    <View style={{ flex: 1, padding: spacing.lg }}>
      {printer.isReconnecting ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            marginBottom: spacing.md,
            padding: spacing.md,
            backgroundColor: colors.primaryLight,
            borderRadius: 8,
          }}
        >
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={{ color: colors.primary, fontSize: 14 }}>
            Reconnecting to saved Bluetooth printer...
          </Text>
        </View>
      ) : null}

      {printer.connectedDevice ? (
        <View
          style={{
            backgroundColor: colors.white,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: spacing.lg,
            marginBottom: spacing.lg,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
            Connected via Bluetooth
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: spacing.md }}>
            {printer.connectedDevice.name}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: spacing.md }}>
            {printer.connectedDevice.id}
          </Text>
          <Text style={{ fontSize: 12, color: colors.success, marginBottom: spacing.md }}>
            This printer reconnects automatically when you reopen the app.
          </Text>
          <Pressable
            onPress={printer.disconnect}
            style={{
              height: 44,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.error,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.error, fontWeight: "600" }}>Disconnect</Text>
          </Pressable>
        </View>
      ) : null}

      <Text
        style={{
          fontSize: 14,
          color: colors.muted,
          marginBottom: spacing.lg,
          lineHeight: 20,
        }}
      >
        Pair your 58mm POS thermal printer over Bluetooth. Turn the printer on and tap Scan.
      </Text>

      <Pressable
        onPress={printer.scanForPrinters}
        disabled={printer.isScanning}
        style={{
          height: 48,
          backgroundColor: colors.primary,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.lg,
          opacity: printer.isScanning ? 0.7 : 1,
        }}
      >
        {printer.isScanning ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>
            Scan Bluetooth Printers
          </Text>
        )}
      </Pressable>

      {printer.error ? (
        <View
          style={{
            backgroundColor: "#FEE2E2",
            padding: spacing.md,
            borderRadius: 8,
            marginBottom: spacing.md,
          }}
        >
          <Text style={{ color: colors.error, fontSize: 14 }}>{printer.error}</Text>
          <Pressable onPress={printer.scanForPrinters} style={{ marginTop: spacing.sm }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!printer.bluetoothEnabled ? (
        <Text style={{ color: colors.error, marginBottom: spacing.md }}>
          Bluetooth is disabled. Please enable it in device settings.
        </Text>
      ) : null}

      <FlatList
        data={printer.devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          !printer.isScanning ? (
            <Text style={{ textAlign: "center", color: colors.muted, marginTop: spacing.xl }}>
              No Bluetooth printers found. Tap Scan to search.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: colors.white,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: spacing.lg,
              marginBottom: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: "600" }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.id}</Text>
              {item.rssi !== null ? (
                <Text style={{ fontSize: 11, color: colors.muted }}>Signal: {item.rssi} dBm</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => printer.connectToPrinter(item)}
              disabled={printer.isConnecting}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                backgroundColor: colors.primary,
                borderRadius: 8,
                opacity: printer.isConnecting ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: "600" }}>Connect</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
