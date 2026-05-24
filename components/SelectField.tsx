import { View, Text, Pressable, Modal, FlatList } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../constants/theme";

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  error,
  required,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.black, marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          height: 44,
          paddingHorizontal: spacing.md,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: error ? colors.error : colors.border,
          backgroundColor: colors.white,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 14, color: colors.black }}>{value}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {error ? (
        <Text style={{ fontSize: 12, color: colors.error, marginTop: 4 }}>{error}</Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: 320,
              paddingBottom: 24,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                padding: spacing.lg,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              {label}
            </Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={{
                    padding: spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: item === value ? colors.primaryLight : colors.white,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: item === value ? colors.primary : colors.black,
                      fontWeight: item === value ? "600" : "400",
                    }}
                  >
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
