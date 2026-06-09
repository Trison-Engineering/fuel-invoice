import { useState } from "react";
import { View, Text, Image, Pressable, Alert, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../constants/theme";
import { preprocessLogoForUpload } from "../src/utils/printLogoUtil";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;

interface LogoUploaderProps {
  logoDataUrl: string | null;
  onLogoChange: (dataUrl: string | null) => void;
  label?: string;
}

export function LogoUploader({ logoDataUrl, onLogoChange, label }: LogoUploaderProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission required", "Please grant permission to access photos or camera.");
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.7,
          base64: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
          base64: true,
        });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_SIZE_BYTES) {
      Alert.alert("File too large", "Logo must be under 2MB. Please choose a smaller image.");
      return;
    }

    setIsProcessing(true);
    try {
      const mime = asset.mimeType ?? "image/jpeg";
      const source =
        asset.uri ?? (asset.base64 ? `data:${mime};base64,${asset.base64}` : null);
      if (!source) return;

      const processed = await preprocessLogoForUpload(source);
      onLogoChange(processed);
    } catch {
      Alert.alert("Logo error", "Could not process the selected image. Try another file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const showPickerOptions = () => {
    Alert.alert("Upload Logo", "Choose a source", [
      { text: "Gallery", onPress: () => pickImage(false) },
      { text: "Camera", onPress: () => pickImage(true) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View>
      {label ? (
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.black, marginBottom: spacing.sm }}>
          {label}
        </Text>
      ) : null}
      {logoDataUrl ? (
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <Image
            source={{ uri: logoDataUrl }}
            style={{ width: 120, height: 120, borderRadius: 8, resizeMode: "contain" }}
          />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable
              onPress={showPickerOptions}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.primary,
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 14 }}>Change</Text>
            </Pressable>
            <Pressable
              onPress={() => onLogoChange(null)}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.error,
              }}
            >
              <Text style={{ color: colors.error, fontSize: 14 }}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={showPickerOptions}
          disabled={isProcessing}
          style={{
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: colors.border,
            borderRadius: 12,
            padding: spacing.xl,
            alignItems: "center",
            justifyContent: "center",
            opacity: isProcessing ? 0.7 : 1,
          }}
        >
          {isProcessing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={40} color={colors.muted} />
          )}
          <Text style={{ marginTop: spacing.sm, fontSize: 14, color: colors.muted }}>
            {isProcessing ? "Processing logo..." : "Tap to upload logo (PNG/JPG, max 2MB)"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
