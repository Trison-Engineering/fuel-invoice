import { useEffect, useRef } from "react";
import {
  View,
  Text,
  Animated,
  Modal,
  useWindowDimensions,
  InteractionManager,
  StyleSheet,
} from "react-native";
import { Colors, Typography, Radius, Spacing, Shadow } from "../constants/theme";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  onHide: () => void;
  duration?: number;
}

const DOT_COLORS: Record<ToastType, string> = {
  success: Colors.text.success,
  error: Colors.text.danger,
  info: Colors.text.accent,
};

export function Toast({
  visible,
  message,
  type = "success",
  onHide,
  duration = 2500,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(20);
      return;
    }

    let cancelled = false;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      dismissTimer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished && !cancelled) {
              setTimeout(() => onHideRef.current(), 0);
            }
          }
        );
      }, duration);
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (dismissTimer) clearTimeout(dismissTimer);
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [visible, message, duration, opacity, translateY]);

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
        style={[
          styles.wrap,
          {
            width: screenWidth - 48,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.card}>
          <View style={[styles.dot, { backgroundColor: DOT_COLORS[type] }]} />
          <Text style={styles.message}>{message}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    left: 24,
    right: 24,
    zIndex: 1000,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    ...Shadow.card,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  message: {
    flex: 1,
    marginLeft: Spacing.sm,
    color: Colors.text.primary,
    fontSize: Typography.sm,
  },
});
