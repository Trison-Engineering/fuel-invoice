import React, { useState, useCallback, useLayoutEffect, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useFormState } from "../hooks/useFormState";
import { usePrinterContext } from "../contexts/PrinterContext";
import { FormSection } from "../components/FormSection";
import { InputField } from "../components/InputField";
import { SelectField } from "../components/SelectField";
import { PrinterStatus } from "../components/PrinterStatus";
import { Toast } from "../components/Toast";
import { ReceiptPreviewScreen } from "../src/screens/ReceiptPreviewScreen";
import type { ReceiptData } from "../utils/generateReceipt";
import { colors, spacing } from "../constants/theme";

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const printer = usePrinterContext();
  const form = useFormState();

  const [isPrinting, setIsPrinting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<ReceiptData | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({
    visible: false,
    message: "",
    type: "success",
  });

  const hideToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ visible: true, message, type });
  }, []);

  useEffect(() => {
    if (!form.station.isHydrated) return;
    if (!form.station.isProfileComplete()) {
      router.replace("/settings?setup=1");
    }
  }, [form.station.isHydrated, form.station.stationName, form.station.stationAddress, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => router.push("/settings")} style={{ padding: 8, marginRight: 4 }}>
            <Ionicons name="settings-outline" size={24} color={colors.primary} />
          </Pressable>
          <PrinterStatus
            connected={printer.connectionStatus === "connected"}
            connectionStatus={printer.connectionStatus}
            connectionStatusLabel={printer.connectionStatusLabel}
            printerName={printer.connectedDevice?.name}
            onPress={() => router.push("/printer-setup")}
          />
        </View>
      ),
    });
  }, [navigation, printer.connectedDevice, printer.connectionStatus, printer.connectionStatusLabel, router]);

  const handlePrint = () => {
    if (!form.station.isProfileComplete()) {
      Alert.alert("Station setup required", "Please complete your station profile in Settings first.");
      router.push("/settings?setup=1");
      return;
    }
    if (!form.validate()) return;
    setPreviewData(form.getReceiptData());
    setShowPreview(true);
  };

  const handleConfirmPrint = async () => {
    setIsPrinting(true);
    try {
      const connected = await printer.ensureConnected();
      if (!connected) {
        Alert.alert("Printer not ready", "Could not connect to the built-in printer. Open Printer settings to retry.");
        return;
      }

      if (!previewData) return;
      await printer.printReceipt(previewData);
      setShowPreview(false);
      showToast("Receipt printed successfully");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Print failed";
      Alert.alert("Print failed", msg);
    } finally {
      setIsPrinting(false);
    }
  };

  const fieldWrapper = (field: string, children: React.ReactNode) => (
    <View
      onLayout={(e) => form.registerFieldRef(field, e.nativeEvent.layout.y)}
      key={field}
    >
      {children}
    </View>
  );

  if (!form.station.isHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!form.station.isProfileComplete()) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={form.scrollRef}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {fieldWrapper(
          "fuelRate",
          <FormSection icon="receipt-outline" title="Fuel Details">
            <SelectField
              label="Product Type"
              value={form.productType}
              options={["Petrol", "Hi-Octane", "Diesel"]}
              onChange={form.setProductType}
            />
            <InputField
              label="Fuel Rate per litre (Rs.)"
              required
              value={form.fuelRate}
              onChangeText={form.updateFuelRate}
              error={form.errors.fuelRate}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <InputField
              label="Volume in litres"
              required
              value={form.volume}
              onChangeText={form.updateVolume}
              error={form.errors.volume}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <InputField
              label="Total Amount"
              value={form.totalDisplay}
              editable={false}
            />
          </FormSection>
        )}

        {fieldWrapper(
          "vehicleNumber",
          <FormSection icon="car-outline" title="Vehicle (optional)">
            <InputField
              label="Vehicle Number"
              value={form.vehicleNumber}
              onChangeText={form.updateVehicleNumber}
              error={form.errors.vehicleNumber}
              placeholder="e.g. ASX-428 (optional)"
              autoCapitalize="characters"
            />
          </FormSection>
        )}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: spacing.lg,
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          onPress={handlePrint}
          disabled={isPrinting || printer.isReconnecting}
          style={{
            height: 48,
            backgroundColor: colors.primary,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            opacity: isPrinting || printer.isReconnecting ? 0.7 : 1,
          }}
        >
          {isPrinting || printer.isReconnecting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>Print</Text>
          )}
        </Pressable>
      </View>

      <ReceiptPreviewScreen
        visible={showPreview}
        data={previewData}
        isPrinting={isPrinting}
        onPrint={handleConfirmPrint}
        onCancel={() => {
          if (!isPrinting) setShowPreview(false);
        }}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </View>
  );
}
