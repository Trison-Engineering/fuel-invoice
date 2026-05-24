import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { usePrinterContext } from "../contexts/PrinterContext";
import { colors, spacing } from "../constants/theme";

export default function PrinterSetupScreen() {
  const printer = usePrinterContext();

  return (
    <View style={{ flex: 1, padding: spacing.lg }}>
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
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Connected Printer</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: spacing.md }}>
            {printer.connectedDevice.name}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: spacing.md }}>
            ID: {printer.connectedDevice.id}
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
        Make sure your thermal printer is powered on and in pairing mode.
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
          <Text style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>Scan for Printers</Text>
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
              No printers found. Tap Scan to search.
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
