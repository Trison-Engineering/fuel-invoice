import React, { useState, useCallback, useLayoutEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFormState } from "../hooks/useFormState";
import { usePrinterContext } from "../contexts/PrinterContext";
import { FormSection } from "../components/FormSection";
import { InputField } from "../components/InputField";
import { SelectField } from "../components/SelectField";
import { TextAreaField } from "../components/TextAreaField";
import { LogoUploader } from "../components/LogoUploader";
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

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<ReceiptData | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({
    visible: false,
    message: "",
    type: "success",
  });

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ visible: true, message, type });
  }, []);

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
    if (!form.validate()) return;
    setPreviewData(form.getReceiptData());
    setShowPreview(true);
  };

  const handleConfirmPrint = async () => {
    setIsPrinting(true);
    try {
      const connected = await printer.ensureConnected();
      if (!connected) {
        Alert.alert("Printer not ready", "Could not connect to the built-in NYX printer. Open Printer settings to retry.");
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

  const parseDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const parseTime = (time24: string) => {
    const [h, min] = time24.split(":").map(Number);
    const d = new Date();
    d.setHours(h, min, 0, 0);
    return d;
  };

  const fieldWrapper = (field: string, y: number, children: React.ReactNode) => (
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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={form.scrollRef}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {fieldWrapper(
          "stationName",
          0,
          <FormSection icon="business-outline" title="Station Details" subtitle="Saved for future receipts">
            <InputField
              label="Station Name"
              required
              value={form.station.stationName}
              onChangeText={(v) => {
                form.station.setStationName(v);
                form.clearFieldError("stationName");
                form.station.saveProfile();
              }}
              error={form.errors.stationName}
              placeholder="Enter station name"
            />
            <TextAreaField
              label="Station Address"
              required
              value={form.station.stationAddress}
              onChangeText={(v) => {
                form.station.setStationAddress(v);
                form.clearFieldError("stationAddress");
                form.station.saveProfile();
              }}
              error={form.errors.stationAddress}
              placeholder="Enter station address"
            />
          </FormSection>
        )}

        <FormSection icon="card-outline" title="Payment Info">
          <SelectField
            label="Payment Method"
            value={form.station.paymentMethod}
            options={["Cash", "Card", "None"]}
            onChange={(v) => {
              form.station.setPaymentMethod(v);
              form.station.saveProfile();
            }}
          />
          <InputField
            label="Invoice Number"
            value={form.invoiceNumber}
            onChangeText={form.setInvoiceNumber}
            keyboardType="number-pad"
            placeholder="1000-9999"
          />
        </FormSection>

        {fieldWrapper(
          "fuelRate",
          0,
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
            <View>
              <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 6 }}>Date</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={{
                  height: 44,
                  justifyContent: "center",
                  paddingHorizontal: spacing.md,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.white,
                }}
              >
                <Text style={{ fontSize: 14 }}>{form.date}</Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={parseDate(form.date)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, selected) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (selected) {
                      const y = selected.getFullYear();
                      const m = String(selected.getMonth() + 1).padStart(2, "0");
                      const d = String(selected.getDate()).padStart(2, "0");
                      form.setDate(`${y}-${m}-${d}`);
                    }
                  }}
                />
              )}
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 6 }}>Time</Text>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                style={{
                  height: 44,
                  justifyContent: "center",
                  paddingHorizontal: spacing.md,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.white,
                }}
              >
                <Text style={{ fontSize: 14 }}>{form.time}</Text>
              </Pressable>
              {showTimePicker && (
                <DateTimePicker
                  value={parseTime(form.time)}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  is24Hour
                  onChange={(_, selected) => {
                    setShowTimePicker(Platform.OS === "ios");
                    if (selected) {
                      const h = String(selected.getHours()).padStart(2, "0");
                      const min = String(selected.getMinutes()).padStart(2, "0");
                      form.setTime(`${h}:${min}`);
                    }
                  }}
                />
              )}
            </View>
          </FormSection>
        )}

        {fieldWrapper(
          "vehicleNumber",
          0,
          <FormSection icon="person-outline" title="Customer / Vehicle">
            <InputField
              label="Vehicle Number"
              required
              value={form.vehicleNumber}
              onChangeText={form.updateVehicleNumber}
              error={form.errors.vehicleNumber}
              placeholder="e.g. ASX-428"
              autoCapitalize="characters"
            />
            <InputField
              label="Nozzle Number"
              value={form.nozzleNo}
              onChangeText={form.setNozzleNo}
              placeholder="Optional"
            />
            <InputField
              label="Customer Name"
              value={form.customerName}
              onChangeText={form.setCustomerName}
              placeholder="Optional"
            />
          </FormSection>
        )}

        <FormSection icon="cloud-upload-outline" title="Station Logo">
          <LogoUploader
            logoDataUrl={form.station.logoDataUrl}
            onLogoChange={(url) => {
              form.station.setLogoDataUrl(url);
              form.station.saveProfile();
            }}
          />
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
              value={form.station.includeLogoInPrint}
              onValueChange={(v) => {
                form.station.setIncludeLogoInPrint(v);
                form.station.saveProfile();
              }}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={form.station.includeLogoInPrint ? colors.primary : colors.muted}
            />
          </View>
        </FormSection>
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
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </View>
  );
}
