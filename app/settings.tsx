import { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useStationStore } from "../stores/stationStore";
import { FormSection } from "../components/FormSection";
import { InputField } from "../components/InputField";
import { TextAreaField } from "../components/TextAreaField";
import { LogoUploader } from "../components/LogoUploader";
import { Toast } from "../components/Toast";
import { colors, spacing } from "../constants/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const station = useStationStore();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });

  const handleSave = async () => {
    if (!station.stationName.trim() || !station.stationAddress.trim()) {
      setToast({ visible: true, message: "Station name and address are required", type: "error" });
      return;
    }
    setSaving(true);
    await station.saveProfile();
    setSaving(false);
    setToast({ visible: true, message: "Profile saved", type: "success" });
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear All Data",
      "This will remove your station profile, logo, and printer preferences. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await station.clearAll();
            setToast({ visible: true, message: "All data cleared", type: "success" });
            router.replace("/");
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <FormSection icon="business-outline" title="Station Profile">
          <InputField
            label="Station Name"
            required
            value={station.stationName}
            onChangeText={station.setStationName}
            placeholder="Enter station name"
          />
          <TextAreaField
            label="Station Address"
            required
            value={station.stationAddress}
            onChangeText={station.setStationAddress}
            placeholder="Enter station address"
          />
        </FormSection>

        <FormSection icon="cloud-upload-outline" title="Station Logo">
          <LogoUploader logoDataUrl={station.logoDataUrl} onLogoChange={station.setLogoDataUrl} />
        </FormSection>

        <Pressable
          onPress={() => router.push("/printer-setup")}
          style={{
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.white,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.lg,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Printer Setup</Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            height: 48,
            backgroundColor: colors.primary,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.md,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>Save Profile</Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleClearAll}
          style={{
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.error,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Clear All Data</Text>
        </Pressable>

        <Text
          style={{
            textAlign: "center",
            color: colors.muted,
            fontSize: 12,
            marginTop: spacing.xxl,
          }}
        >
          Version {Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </View>
  );
}
