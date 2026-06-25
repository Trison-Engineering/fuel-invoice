import React from "react";
import {
  Pressable,
  Text,
  View,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Buttons, Colors } from "../constants/theme";

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

const VARIANT_STYLES: Record<
  ActionButtonVariant,
  {
    button: ViewStyle;
    pressed: ViewStyle;
    disabled: ViewStyle;
    loading: ViewStyle;
    text: TextStyle;
    textDisabled: TextStyle;
    spinnerColor: string;
  }
> = {
  primary: {
    button: Buttons.primary,
    pressed: Buttons.primaryPressed,
    disabled: Buttons.primaryDisabled,
    loading: Buttons.primaryLoading,
    text: Buttons.primaryText,
    textDisabled: Buttons.primaryTextDisabled,
    spinnerColor: Colors.text.primary,
  },
  secondary: {
    button: Buttons.secondary,
    pressed: Buttons.secondaryPressed,
    disabled: { opacity: 0.5 },
    loading: { opacity: 0.7 },
    text: Buttons.secondaryText,
    textDisabled: Buttons.secondaryText,
    spinnerColor: Colors.text.secondary,
  },
  outline: {
    button: Buttons.accentOutline,
    pressed: Buttons.accentOutlinePressed,
    disabled: { opacity: 0.5 },
    loading: { opacity: 0.7 },
    text: Buttons.accentOutlineText,
    textDisabled: Buttons.accentOutlineText,
    spinnerColor: Colors.text.accent,
  },
  destructive: {
    button: Buttons.destructive,
    pressed: Buttons.destructivePressed,
    disabled: { opacity: 0.5 },
    loading: { opacity: 0.7 },
    text: Buttons.destructiveText,
    textDisabled: Buttons.destructiveText,
    spinnerColor: Colors.text.danger,
  },
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
  const v = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        v.button,
        styles.stretch,
        style,
        pressed && !isDisabled && v.pressed,
        isDisabled && v.disabled,
        loading && v.loading,
      ]}
    >
      {loading ? (
        <View style={Buttons.loadingRow}>
          <ActivityIndicator size="small" color={v.spinnerColor} />
          <Text style={[v.text, textStyle]}>{loadingLabel ?? label}</Text>
        </View>
      ) : (
        <View style={Buttons.loadingRow}>
          {icon ? (
            <Ionicons name={icon} size={18} color={v.text.color as string} />
          ) : null}
          <Text style={[v.text, isDisabled && v.textDisabled, textStyle]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = {
  stretch: {
    alignSelf: "stretch" as const,
    width: undefined,
  },
};
