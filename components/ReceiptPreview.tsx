import { Modal, View, Text, ScrollView, Pressable, Dimensions, Image } from "react-native";
import { buildReceiptLines, ReceiptData } from "../utils/generateReceipt";
import { colors, spacing } from "../constants/theme";

interface ReceiptPreviewProps {
  visible: boolean;
  data: ReceiptData;
  onClose: () => void;
}

export function ReceiptPreview({ visible, data, onClose }: ReceiptPreviewProps) {
  const lines = buildReceiptLines(data);
  const screenWidth = Dimensions.get("window").width;
  const receiptWidthPx = Math.min(screenWidth - 48, 280);
  const scale = receiptWidthPx / 280;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.white,
            borderRadius: 12,
            width: "100%",
            maxHeight: "80%",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Receipt Preview</Text>
            <Pressable onPress={onClose}>
              <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: "center" }}>
            <View
              style={{
                backgroundColor: colors.white,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                width: receiptWidthPx,
                transform: [{ scale }],
              }}
            >
              {data.logoDataUrl ? (
                <Image
                  source={{ uri: data.logoDataUrl }}
                  style={{
                    width: Math.round(receiptWidthPx * 0.45),
                    alignSelf: "center",
                    resizeMode: "contain",
                  }}
                />
              ) : null}
              {lines.map((line, index) => (
                <Text
                  key={`${index}-${line}`}
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: colors.black,
                    lineHeight: 16,
                  }}
                >
                  {line || " "}
                </Text>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
