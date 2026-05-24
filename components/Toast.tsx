import { useEffect, useRef } from "react";
import { View, Text, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../constants/theme";

export type ToastType = "success" | "error";

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  onHide: () => void;
  duration?: number;
}

export function Toast({
  visible,
  message,
  type = "success",
  onHide,
  duration = 3000,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(duration),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide());
    }
  }, [visible, duration, onHide, opacity]);

  if (!visible) return null;

  const bg = type === "success" ? colors.success : colors.error;
  const icon = type === "success" ? "checkmark-circle" : "alert-circle";

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: insets.top + spacing.sm,
        left: spacing.lg,
        right: spacing.lg,
        opacity,
        zIndex: 1000,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: bg,
          padding: spacing.md,
          borderRadius: 8,
          gap: spacing.sm,
        }}
      >
        <Ionicons name={icon} size={22} color={colors.white} />
        <Text style={{ flex: 1, color: colors.white, fontSize: 14 }}>{message}</Text>
      </View>
    </Animated.View>
  );
}
