import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/theme";
import type { PrinterConnectionStatus } from "../hooks/usePrinter";

interface PrinterStatusProps {
  connected: boolean;
  connectionStatus: PrinterConnectionStatus;
  connectionStatusLabel: string;
  printerName?: string;
  onPress: () => void;
}

export function PrinterStatus({
  connected,
  connectionStatus,
  connectionStatusLabel,
  printerName,
  onPress,
}: PrinterStatusProps) {
  const dotColor =
    connectionStatus === "connected"
      ? colors.success
      : connectionStatus === "connecting"
        ? colors.primary
        : colors.error;

  return (
    <Pressable onPress={onPress} style={{ padding: 8, alignItems: "flex-end" }}>
      <View style={{ position: "relative" }}>
        <Ionicons name="print-outline" size={26} color={colors.primary} />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: dotColor,
            borderWidth: 1.5,
            borderColor: colors.white,
          }}
        />
      </View>
      <Text
        style={{
          fontSize: 10,
          color: connected ? colors.success : colors.error,
          marginTop: 2,
          maxWidth: 110,
          textAlign: "right",
        }}
        numberOfLines={1}
      >
        {connectionStatusLabel}
      </Text>
      {connected && printerName ? (
        <Text
          style={{
            fontSize: 9,
            color: colors.muted,
            maxWidth: 110,
            textAlign: "right",
          }}
          numberOfLines={1}
        >
          {printerName}
        </Text>
      ) : null}
    </Pressable>
  );
}
