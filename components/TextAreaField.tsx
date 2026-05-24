import { View, Text, TextInput, TextInputProps } from "react-native";
import { colors, spacing } from "../constants/theme";
import { useState } from "react";

interface TextAreaFieldProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
}

export function TextAreaField({ label, error, required, ...props }: TextAreaFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.black, marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      <TextInput
        {...props}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        placeholderTextColor={colors.muted}
        style={{
          minHeight: 88,
          fontSize: 14,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: error ? colors.error : focused ? colors.primary : colors.border,
          backgroundColor: colors.white,
          color: colors.black,
        }}
      />
      {error ? (
        <Text style={{ fontSize: 12, color: colors.error, marginTop: 4 }}>{error}</Text>
      ) : null}
    </View>
  );
}
