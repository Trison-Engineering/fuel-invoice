import { useEffect, useRef } from "react";
import {
  View,
  Text,
  Animated,
  Modal,
  Platform,
  StatusBar,
  InteractionManager,
} from "react-native";
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

const TOP_OFFSET =
  Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) + spacing.sm : spacing.lg + 44;

export function Toast({
  visible,
  message,
  type = "success",
  onHide,
  duration = 3000,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }

    let cancelled = false;
    const interaction = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(duration),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && !cancelled) {
          // Avoid scheduling parent updates during useInsertionEffect (React 19).
          setTimeout(() => onHideRef.current(), 0);
        }
      });
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      opacity.stopAnimation();
    };
  }, [visible, message, duration, opacity]);

  const bg = type === "success" ? colors.success : colors.error;
  const icon = type === "success" ? "checkmark-circle" : "alert-circle";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onHideRef.current()}
    >
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: TOP_OFFSET,
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
    </Modal>
  );
}
