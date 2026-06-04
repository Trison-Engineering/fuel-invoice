import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useEffect } from "react";
import { usePrinterContext } from "../contexts/PrinterContext";
import { colors, spacing } from "../constants/theme";

export default function PrinterSetupScreen() {
  const printer = usePrinterContext();

  useEffect(() => {
    printer.autoReconnect().catch(() => {
      // ignore — user can connect manually from this screen
    });
  }, [printer.autoReconnect]);

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
            Connecting to printer...
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={printer.testPrint}
        disabled={printer.isTestingPrint || printer.isReconnecting}
        style={{
          height: 48,
          backgroundColor: colors.primary,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.lg,
          opacity: printer.isTestingPrint || printer.isReconnecting ? 0.7 : 1,
        }}
      >
        {printer.isTestingPrint ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>
            Test Print
          </Text>
        )}
      </Pressable>

      {printer.testResults.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.white,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: spacing.lg,
            marginBottom: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: spacing.xs }}>
            Connection test results
          </Text>
          {printer.testResults.map((result) => (
            <View key={result.method}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: result.success ? colors.success : colors.error,
                }}
              >
                {result.success ? "OK" : "FAILED"} — {result.label}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {result.message}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {printer.isBuiltInSupported ? (
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
            Handheld POS built-in printer
          </Text>
          <Text style={{ fontSize: 14, color: colors.black, marginBottom: spacing.md, lineHeight: 20 }}>
            Your EzPump / Handheld-POS uses the built-in printer via the system iPos service.
            The app connects automatically — no Bluetooth pairing needed for the internal printer.
          </Text>
          {printer.printerMode === "builtin" && printer.connectedDevice ? (
            <>
              <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: spacing.sm }}>
                {printer.connectedDevice.name}
              </Text>
              <Text style={{ fontSize: 12, color: colors.success }}>
                Ready to print receipts
              </Text>
            </>
          ) : (
            <Pressable
              onPress={printer.connectBuiltIn}
              disabled={printer.isReconnecting}
              style={{
                height: 44,
                backgroundColor: colors.primary,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                marginTop: spacing.sm,
                opacity: printer.isReconnecting ? 0.7 : 1,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: "600" }}>
                Connect Built-in Printer
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {printer.connectedDevice && printer.printerMode === "serial" ? (
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
            Connected via serial port
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: spacing.md }}>
            {printer.connectedDevice.name}
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

      {printer.connectedDevice && printer.printerMode === "bluetooth" ? (
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

      <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: spacing.sm }}>
        External Bluetooth printer (optional)
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: colors.muted,
          marginBottom: spacing.lg,
          lineHeight: 20,
        }}
      >
        Only needed if you use a separate Bluetooth thermal printer instead of the built-in one.
      </Text>

      <Pressable
        onPress={printer.scanForPrinters}
        disabled={printer.isScanning}
        style={{
          height: 48,
          backgroundColor: colors.white,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.lg,
          opacity: printer.isScanning ? 0.7 : 1,
        }}
      >
        {printer.isScanning ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>
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
        </View>
      ) : null}

      <FlatList
        data={printer.devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          !printer.isScanning ? (
            <Text style={{ textAlign: "center", color: colors.muted, marginTop: spacing.xl }}>
              No external Bluetooth printers found.
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
