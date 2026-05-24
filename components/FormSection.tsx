import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../constants/theme";
import { ReactNode } from "react";

interface FormSectionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function FormSection({ icon, title, subtitle, children }: FormSectionProps) {
  return (
    <View
      style={{
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: spacing.lg,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: colors.primaryLight,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.sm,
          }}
        >
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.black }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </View>
  );
}
