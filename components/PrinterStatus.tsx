import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/theme";

interface PrinterStatusProps {
  connected: boolean;
  printerName?: string;
  onPress: () => void;
}

export function PrinterStatus({ connected, printerName, onPress }: PrinterStatusProps) {
  return (
    <Pressable onPress={onPress} style={{ padding: 8 }}>
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
            backgroundColor: connected ? colors.success : colors.muted,
            borderWidth: 1.5,
            borderColor: colors.white,
          }}
        />
      </View>
      {connected && printerName ? (
        <Text
          style={{
            position: "absolute",
            top: 32,
            right: 0,
            fontSize: 10,
            color: colors.muted,
            maxWidth: 100,
          }}
          numberOfLines={1}
        />
      ) : null}
    </Pressable>
  );
}
