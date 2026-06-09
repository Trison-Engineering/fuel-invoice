import { useState, useLayoutEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import Constants from "expo-constants";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { useStationStore } from "../stores/stationStore";
import { FormSection } from "../components/FormSection";
import { InputField } from "../components/InputField";
import { TextAreaField } from "../components/TextAreaField";
import { LogoUploader } from "../components/LogoUploader";
import { Toast } from "../components/Toast";
import { colors, spacing } from "../constants/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const isInitialSetup = setup === "1";
  const station = useStationStore();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isInitialSetup ? "Station Setup" : "Settings",
      headerBackVisible: !isInitialSetup,
    });
  }, [navigation, isInitialSetup]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });

  const hideToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  const handleSave = async () => {
    if (!station.stationName.trim() || !station.stationAddress.trim()) {
      setToast({ visible: true, message: "Station name and address are required", type: "error" });
      return;
    }
    setSaving(true);
    await station.saveProfile();
    setSaving(false);

    if (isInitialSetup) {
      router.replace("/");
      return;
    }

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
            router.replace("/settings?setup=1");
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {isInitialSetup ? (
          <View
            style={{
              backgroundColor: colors.primaryLight,
              borderRadius: 8,
              padding: spacing.md,
              marginBottom: spacing.lg,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary, marginBottom: 4 }}>
              Welcome
            </Text>
            <Text style={{ fontSize: 13, color: colors.black, lineHeight: 20 }}>
              Set up your station profile to start printing fuel receipts. This information is saved
              and used on every receipt.
            </Text>
          </View>
        ) : null}

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
          {station.includeLogoInPrint && station.useTwoLogos ? (
            <LogoUploader
              label="Logo 1 (Left Side)"
              logoDataUrl={station.logoDataUrl}
              onLogoChange={station.setLogoDataUrl}
            />
          ) : (
            <LogoUploader logoDataUrl={station.logoDataUrl} onLogoChange={station.setLogoDataUrl} />
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.black, flex: 1 }}>
              Include logo in print
            </Text>
            <Switch
              value={station.includeLogoInPrint}
              onValueChange={station.setIncludeLogoInPrint}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={station.includeLogoInPrint ? colors.primary : colors.muted}
            />
          </View>
          {station.includeLogoInPrint ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.black, flex: 1 }}>Use Two Logos</Text>
              <Switch
                value={station.useTwoLogos}
                onValueChange={station.setUseTwoLogos}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={station.useTwoLogos ? colors.primary : colors.muted}
              />
            </View>
          ) : null}
          {station.includeLogoInPrint && station.useTwoLogos ? (
            <View style={{ marginTop: spacing.md }}>
              <LogoUploader
                label="Logo 2 (Right Side)"
                logoDataUrl={station.logo2DataUrl}
                onLogoChange={station.setLogo2DataUrl}
              />
            </View>
          ) : null}
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
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>
              {isInitialSetup ? "Save & Continue" : "Save Profile"}
            </Text>
          )}
        </Pressable>

        {!isInitialSetup ? (
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
        ) : null}

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
        onHide={hideToast}
      />
    </View>
  );
}
