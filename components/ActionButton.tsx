import React, { useState } from "react";
import {
  Pressable,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius, Spacing, Typography } from "../constants/theme";

type ActionButtonVariant = "primary" | "secondary" | "outline" | "destructive";

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  loadingLabel?: string;
};

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  loadingLabel,
}: ActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  const isDisabled = disabled || loading;

  const buttonStyle = [
    styles.base,
    styles[variant],
    pressed && !isDisabled ? styles[`${variant}Pressed`] : null,
    isDisabled ? styles[`${variant}Disabled`] : null,
    loading && variant === "primary" ? styles.primaryLoading : null,
    style,
  ];

  const labelStyle = [
    styles[`${variant}Text`],
    isDisabled && variant === "primary" ? styles.primaryTextDisabled : null,
    textStyle,
  ];

  const spinnerColor =
    variant === "primary"
      ? Colors.text.primary
      : variant === "destructive"
        ? Colors.text.danger
        : Colors.text.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={buttonStyle}
    >
      {loading ? (
        <View style={styles.contentRow}>
          <ActivityIndicator size="small" color={spinnerColor} />
          <Text style={labelStyle}>{loadingLabel ?? label}</Text>
        </View>
      ) : (
        <View style={styles.contentRow}>
          {icon ? (
            <Ionicons name={icon} size={18} color={styles[`${variant}Text`].color as string} />
          ) : null}
          <Text style={labelStyle}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "stretch",
    minHeight: 48,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  primary: {
    backgroundColor: Colors.accent,
    minHeight: 56,
  },
  primaryPressed: {
    backgroundColor: Colors.accentDark,
    transform: [{ scale: 0.98 }],
  },
  primaryDisabled: {
    backgroundColor: Colors.bg.hover,
    opacity: 0.7,
  },
  primaryLoading: {
    backgroundColor: Colors.accentDark,
    opacity: 0.85,
  },
  primaryText: {
    color: Colors.text.primary,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  primaryTextDisabled: {
    color: Colors.text.tertiary,
  },
  secondary: {
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    minHeight: 50,
    borderRadius: Radius.md,
  },
  secondaryPressed: {
    backgroundColor: Colors.bg.hover,
    borderColor: Colors.border.strong,
  },
  secondaryDisabled: {
    opacity: 0.5,
  },
  secondaryText: {
    color: Colors.text.secondary,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
  },
  outline: {
    backgroundColor: Colors.accentAlpha,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    minHeight: 48,
    borderRadius: Radius.md,
  },
  outlinePressed: {
    backgroundColor: "rgba(59,130,246,0.2)",
    transform: [{ scale: 0.98 }],
  },
  outlineDisabled: {
    opacity: 0.5,
  },
  outlineText: {
    color: Colors.text.accent,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  destructive: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    minHeight: 50,
    borderRadius: Radius.md,
  },
  destructivePressed: {
    backgroundColor: "rgba(239,68,68,0.18)",
  },
  destructiveDisabled: {
    opacity: 0.5,
  },
  destructiveText: {
    color: Colors.text.danger,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
  },
});
