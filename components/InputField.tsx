import { View, Text, TextInput, TextInputProps } from "react-native";
import { colors, spacing } from "../constants/theme";
import { useState } from "react";

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
}

export function InputField({
  label,
  error,
  required,
  editable = true,
  ...props
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.black, marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      <TextInput
        {...props}
        editable={editable}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        placeholderTextColor={colors.muted}
        style={[
          {
            height: 44,
            fontSize: 14,
            paddingHorizontal: spacing.md,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: error ? colors.error : focused ? colors.primary : colors.border,
            backgroundColor: editable ? colors.white : colors.disabled,
            color: colors.black,
          },
          focused && !error
            ? {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 2,
              }
            : {},
          props.style,
        ]}
      />
      {error ? (
        <Text style={{ fontSize: 12, color: colors.error, marginTop: 4 }}>{error}</Text>
      ) : null}
    </View>
  );
}
