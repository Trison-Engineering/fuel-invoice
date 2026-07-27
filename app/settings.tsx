import { useState, useLayoutEffect, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
  TextInput,
  Image,
  Animated,
  Modal,
  StyleSheet,
  TextInputProps,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "../components/ActionButton";
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStationStore } from "../stores/stationStore";
import { Colors, Typography, Radius, Spacing, Shadow, Buttons } from "../constants/theme";
import { isValidDecimal } from "../utils/validation";
import { getItem, StorageKeys, EZPUMP_EMAIL, EZPUMP_PASSWORD, EZPUMP_IP, NOZZLE_FILTER_ENABLED, NOZZLE_FILTER_IDS, MOCK_DATA_ENABLED } from "../utils/storage";
import { recordPriceChange } from "../src/services/PriceHistoryService";
import { fetchRates } from "../src/services/EzPumpService";
import { clearNozzleSalesHistory } from "../src/services/NozzleSalesHistoryService";
import { preprocessLogoForUpload } from "../src/utils/printLogoUtil";
import type { StationProfile } from "../stores/stationStore";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const FUEL_PRICE_ROWS = [
  { key: "petrol", label: "Petrol", color: Colors.product.petrol },
  { key: "diesel", label: "Diesel", color: Colors.product.diesel },
  { key: "hiOctane", label: "Hi-Octane", color: Colors.product.hiOctane },
] as const;

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function SectionGroup({ children }: { children: ReactNode }) {
  return <View style={styles.sectionGroup}>{children}</View>;
}

function NozzleFilterSection({
  filterEnabled,
  nozzleIds,
  draft,
  onToggle,
  onChangeDraft,
  onAddNozzle,
  onRemoveNozzle,
}: {
  filterEnabled: boolean;
  nozzleIds: string[];
  draft: string;
  onToggle: (value: boolean) => void;
  onChangeDraft: (value: string) => void;
  onAddNozzle: () => void;
  onRemoveNozzle: (id: string) => void;
}) {
  const expandAnim = useRef(new Animated.Value(filterEnabled ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: filterEnabled ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [filterEnabled, expandAnim]);

  const expandMaxHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  return (
    <>
      <Text style={styles.liveFeedSectionLabel}>LIVE FEED</Text>
      <SectionGroup>
        <View style={[styles.row, !filterEnabled && styles.rowLast]}>
          <View style={styles.mockRowLabelWrap}>
            <Text style={styles.rowLabel}>Fetch by nozel id</Text>
            <Text style={styles.mockRowHint}>
              Accumulate matching live sales locally
            </Text>
          </View>
          <Switch
            value={filterEnabled}
            onValueChange={onToggle}
            trackColor={{ false: Colors.bg.hover, true: Colors.accentAlpha }}
            thumbColor={filterEnabled ? Colors.accent : Colors.text.tertiary}
          />
        </View>
        <Animated.View
          style={{
            opacity: expandAnim,
            maxHeight: expandMaxHeight,
            overflow: "hidden",
          }}
        >
          <View style={styles.nozzleFilterBody}>
            {nozzleIds.length > 0 ? (
              <View style={styles.nozzleChipRow}>
                {nozzleIds.map((id) => (
                  <Pressable
                    key={id}
                    onPress={() => onRemoveNozzle(id)}
                    style={({ pressed }) => [
                      styles.nozzleChip,
                      pressed && styles.nozzleChipPressed,
                    ]}
                    accessibilityLabel={`Remove nozzle ${id}`}
                  >
                    <Text style={styles.nozzleChipText}>{id}</Text>
                    <Ionicons name="close" size={14} color={Colors.text.accent} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.nozzleInputRow}>
              <TextInput
                style={styles.nozzleInput}
                value={draft}
                onChangeText={(text) => onChangeDraft(text.replace(/[^0-9]/g, ""))}
                placeholder="Type nozel id"
                placeholderTextColor={Colors.text.tertiary}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={onAddNozzle}
              />
              <Pressable
                onPress={onAddNozzle}
                disabled={!draft.trim()}
                style={({ pressed }) => [
                  styles.nozzleAddBtn,
                  !draft.trim() && styles.nozzleAddBtnDisabled,
                  pressed && draft.trim() && styles.nozzleAddBtnPressed,
                ]}
              >
                <Text style={styles.nozzleAddBtnText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </SectionGroup>
    </>
  );
}

function SettingsInputRow({
  label,
  fieldLabel,
  value,
  onChangeText,
  placeholder,
  multiline,
  isLast,
  textAlign,
  ...props
}: {
  label: string;
  fieldLabel?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  isLast?: boolean;
  textAlign?: "left" | "right" | "center";
} & Omit<TextInputProps, "value" | "onChangeText">) {
  const [focused, setFocused] = useState(false);
  const displayLabel = fieldLabel ?? label.toUpperCase();

  return (
    <View style={[styles.stackedField, isLast && styles.stackedFieldLast]}>
      <Text style={styles.stackedFieldLabel}>{displayLabel}</Text>
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        placeholderTextColor={Colors.text.tertiary}
        style={[
          styles.stackedFieldInput,
          multiline && styles.stackedFieldInputMultiline,
          textAlign === "right" && styles.stackedFieldInputRight,
          {
            borderColor: focused ? Colors.border.strong : Colors.border.default,
          },
          props.style,
        ]}
      />
    </View>
  );
}

function SettingsToast({
  visible,
  message,
  type,
  onHide,
}: {
  visible: boolean;
  message: string;
  type: "success" | "error";
  onHide: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(20);
      return;
    }

    let cancelled = false;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      dismissTimer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished && !cancelled) {
              setTimeout(() => onHideRef.current(), 0);
            }
          }
        );
      }, 2500);
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (dismissTimer) clearTimeout(dismissTimer);
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [visible, message, opacity, translateY]);

  const dotColor = type === "success" ? Colors.text.success : Colors.text.danger;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.toastWrap,
          {
            bottom: insets.bottom + Spacing.lg,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.toastCard}>
          <View style={[styles.toastDot, { backgroundColor: dotColor }]} />
          <Text style={styles.toastText}>{message}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const isInitialSetup = setup === "1";
  const station = useStationStore();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const [email, password, ip] = await Promise.all([
            AsyncStorage.getItem(EZPUMP_EMAIL),
            AsyncStorage.getItem(EZPUMP_PASSWORD),
            AsyncStorage.getItem(EZPUMP_IP),
          ]);
          if (!email || !password || !ip || cancelled) return;
          await fetchRates();
        } catch {
          // Keep existing station prices when EzPump is unreachable.
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  const [saving, setSaving] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [nozzleFilterEnabled, setNozzleFilterEnabled] = useState(false);
  const [nozzleIds, setNozzleIds] = useState<string[]>([]);
  const [nozzleDraft, setNozzleDraft] = useState("");
  const [mockDataEnabled, setMockDataEnabled] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });

  const hideToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  useEffect(() => {
    (async () => {
      const enabled = await AsyncStorage.getItem(NOZZLE_FILTER_ENABLED);
      const idsRaw = await AsyncStorage.getItem(NOZZLE_FILTER_IDS);
      const mock = await AsyncStorage.getItem(MOCK_DATA_ENABLED);
      setNozzleFilterEnabled(enabled === "true");
      try {
        const parsed = idsRaw ? (JSON.parse(idsRaw) as unknown) : [];
        setNozzleIds(
          Array.isArray(parsed)
            ? parsed.map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id))
            : []
        );
      } catch {
        setNozzleIds([]);
      }
      setMockDataEnabled(mock === "true");
      // Clean up removed product-filter keys
      await AsyncStorage.multiRemove([
        "@fuel_receipt:live_feed_filter_enabled",
        "@fuel_receipt:live_feed_filter_product",
      ]);
    })();
  }, []);

  const handleToggleMockData = useCallback(async (value: boolean) => {
    setMockDataEnabled(value);
    await AsyncStorage.setItem(MOCK_DATA_ENABLED, value ? "true" : "false");
  }, []);

  const persistNozzleIds = useCallback(async (ids: string[]) => {
    setNozzleIds(ids);
    await AsyncStorage.setItem(NOZZLE_FILTER_IDS, JSON.stringify(ids));
  }, []);

  const handleToggleNozzleFilter = useCallback(async (value: boolean) => {
    setNozzleFilterEnabled(value);
    await AsyncStorage.setItem(NOZZLE_FILTER_ENABLED, value ? "true" : "false");
    if (!value) {
      await clearNozzleSalesHistory();
    }
  }, []);

  const handleAddNozzle = useCallback(async () => {
    const id = nozzleDraft.trim();
    if (!/^\d+$/.test(id)) return;
    if (nozzleIds.includes(id)) {
      setNozzleDraft("");
      return;
    }
    setNozzleDraft("");
    await persistNozzleIds([...nozzleIds, id]);
  }, [nozzleDraft, nozzleIds, persistNozzleIds]);

  const handleRemoveNozzle = useCallback(
    async (id: string) => {
      await persistNozzleIds(nozzleIds.filter((n) => n !== id));
    },
    [nozzleIds, persistNozzleIds]
  );

  const handlePriceChange =
    (setter: (value: string) => void) => (value: string) => {
      if (isValidDecimal(value)) setter(value);
    };

  const pickLogoImage = async (useCamera: boolean) => {
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
    if (asset.fileSize && asset.fileSize > MAX_LOGO_BYTES) {
      Alert.alert("File too large", "Logo must be under 2MB. Please choose a smaller image.");
      return;
    }

    setLogoProcessing(true);
    try {
      const mime = asset.mimeType ?? "image/jpeg";
      const source =
        asset.uri ?? (asset.base64 ? `data:${mime};base64,${asset.base64}` : null);
      if (!source) return;

      const processed = await preprocessLogoForUpload(source);
      station.setLogoDataUrl(processed);
    } catch {
      Alert.alert("Logo error", "Could not process the selected image. Try another file.");
    } finally {
      setLogoProcessing(false);
    }
  };

  const showLogoPickerOptions = () => {
    Alert.alert("Upload Logo", "Choose a source", [
      { text: "Gallery", onPress: () => pickLogoImage(false) },
      { text: "Camera", onPress: () => pickLogoImage(true) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSave = async () => {
    if (!station.stationName.trim() || !station.stationAddress.trim()) {
      setToast({ visible: true, message: "Station name and address are required", type: "error" });
      return;
    }
    const { petrol, diesel, hiOctane } = station.fuelPrices;
    if (
      parseFloat(petrol) <= 0 ||
      parseFloat(diesel) <= 0 ||
      parseFloat(hiOctane) <= 0
    ) {
      setToast({
        visible: true,
        message: "Enter price per litre for Petrol, Diesel, and Hi-Octane",
        type: "error",
      });
      return;
    }
    setSaving(true);

    const oldProfile = await getItem<StationProfile>(StorageKeys.STATION_PROFILE);
    const oldPrices = oldProfile?.fuelPrices;

    const recordIfChanged = async (
      product: "PETROL" | "DIESEL" | "HI-OCTANE",
      oldVal: string | undefined,
      newVal: string
    ) => {
      const oldP = parseFloat(oldVal ?? "0");
      const newP = parseFloat(newVal);
      if (isNaN(newP)) return;
      if (oldPrices && !isNaN(oldP) && oldP > 0 && Math.abs(oldP - newP) > 0.001) {
        await recordPriceChange(product, oldP, newP);
      }
    };

    await recordIfChanged("PETROL", oldPrices?.petrol, petrol);
    await recordIfChanged("DIESEL", oldPrices?.diesel, diesel);
    await recordIfChanged("HI-OCTANE", oldPrices?.hiOctane, hiOctane);

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
            await clearNozzleSalesHistory();
            await station.clearAll();
            setNozzleFilterEnabled(false);
            setNozzleIds([]);
            setNozzleDraft("");
            setToast({ visible: true, message: "All data cleared", type: "success" });
            router.replace("/settings?setup=1");
          },
        },
      ]
    );
  };

  const fuelValues = {
    petrol: station.fuelPrices.petrol,
    diesel: station.fuelPrices.diesel,
    hiOctane: station.fuelPrices.hiOctane,
  };

  const fuelSetters = {
    petrol: handlePriceChange(station.setPetrolPrice),
    diesel: handlePriceChange(station.setDieselPrice),
    hiOctane: handlePriceChange(station.setHiOctanePrice),
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + Spacing.xl, paddingBottom: Math.max(insets.bottom, 32) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!isInitialSetup ? (
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backLink, pressed && styles.backLinkPressed]} hitSlop={8}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>
          ) : null}

          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>{isInitialSetup ? "Initial Setup" : "Settings"}</Text>
            <Text style={styles.pageSubtitle}>Petro Slip Pro</Text>
          </View>

          <SectionLabel>STATION PROFILE</SectionLabel>
          <SectionGroup>
            <View style={styles.sectionGroupPadded}>
              <SettingsInputRow
                label="Station Name"
                fieldLabel="STATION NAME"
                value={station.stationName}
                onChangeText={station.setStationName}
                placeholder="Enter station name"
              />
              <SettingsInputRow
                label="Station Address"
                fieldLabel="STATION ADDRESS"
                value={station.stationAddress}
                onChangeText={station.setStationAddress}
                placeholder="Enter station address"
                multiline
              />
              <SettingsInputRow
                label="Contact Phone"
                fieldLabel="CONTACT PHONE"
                value={station.stationPhone}
                onChangeText={station.setStationPhone}
                placeholder="e.g. 03001234567"
                keyboardType="number-pad"
                isLast
              />
            </View>
          </SectionGroup>

          <SectionLabel>FUEL PRICES</SectionLabel>
          <SectionGroup>
            <View style={styles.sectionGroupPadded}>
              {FUEL_PRICE_ROWS.map((fuel, index) => (
                <FuelPriceRow
                  key={fuel.key}
                  label={fuel.label}
                  value={fuelValues[fuel.key]}
                  onChangeText={fuelSetters[fuel.key]}
                  isLast={index === FUEL_PRICE_ROWS.length - 1}
                />
              ))}
            </View>
          </SectionGroup>

          <SectionLabel>STATION LOGO</SectionLabel>
          <Pressable
            onPress={showLogoPickerOptions}
            disabled={logoProcessing}
            style={styles.logoUploadArea}
          >
            {logoProcessing ? (
              <ActivityIndicator color={Colors.accent} />
            ) : station.logoDataUrl ? (
              <View style={styles.logoPreviewWrap}>
                <Image
                  source={{ uri: station.logoDataUrl }}
                  style={styles.logoPreview}
                  resizeMode="contain"
                />
                <Text style={styles.changeLogoText}>Change Logo</Text>
              </View>
            ) : (
              <View style={styles.logoUploadContent}>
                <Ionicons name="cloud-upload-outline" size={24} color={Colors.text.tertiary} />
                <Text style={styles.logoUploadTitle}>Tap to upload logo</Text>
                <Text style={styles.logoUploadHint}>PNG/JPG, max 2MB</Text>
              </View>
            )}
          </Pressable>

          <SectionLabel>PRINT OPTIONS</SectionLabel>
          <SectionGroup>
            <View style={[styles.row, styles.rowLast]}>
              <Text style={styles.rowLabel}>Include logo in print</Text>
              <Switch
                value={station.includeLogoInPrint}
                onValueChange={station.setIncludeLogoInPrint}
                trackColor={{ false: Colors.bg.hover, true: Colors.accentAlpha }}
                thumbColor={
                  station.includeLogoInPrint ? Colors.accent : Colors.text.tertiary
                }
              />
            </View>
          </SectionGroup>

          <NozzleFilterSection
            filterEnabled={nozzleFilterEnabled}
            nozzleIds={nozzleIds}
            draft={nozzleDraft}
            onToggle={handleToggleNozzleFilter}
            onChangeDraft={setNozzleDraft}
            onAddNozzle={handleAddNozzle}
            onRemoveNozzle={handleRemoveNozzle}
          />

          <SectionLabel>DEVELOPER</SectionLabel>
          <SectionGroup>
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.mockRowLabelWrap}>
                <Text style={styles.rowLabel}>Enable Mock Data</Text>
                <Text style={styles.mockRowHint}>
                  Simulates live receipts every 10s on Home
                </Text>
              </View>
              <Switch
                value={mockDataEnabled}
                onValueChange={handleToggleMockData}
                trackColor={{ false: Colors.bg.hover, true: Colors.accentAlpha }}
                thumbColor={mockDataEnabled ? Colors.accent : Colors.text.tertiary}
              />
            </View>
          </SectionGroup>

          {isInitialSetup ? (
            <ActionButton
              label="Save & Continue"
              icon="arrow-forward"
              onPress={handleSave}
              loading={saving}
              loadingLabel="Saving..."
              disabled={saving}
              style={styles.saveContinueButton}
            />
          ) : (
            <>
              <ActionButton
                label="Save Station Profile"
                icon="save-outline"
                onPress={handleSave}
                loading={saving}
                loadingLabel="Saving..."
                disabled={saving}
                style={styles.saveProfileButton}
              />

              <ActionButton
                label="Clear All Data"
                icon="trash-outline"
                variant="destructive"
                onPress={handleClearAll}
                style={styles.clearAllButton}
              />
            </>
          )}

          <Text style={styles.versionText}>
            Version {Constants.expoConfig?.version ?? "1.0.0"}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <SettingsToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </View>
  );
}

function FuelPriceRow({
  label,
  value,
  onChangeText,
  isLast,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  isLast?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const fieldLabel = `${label.toUpperCase()} PRICE (PKR)`;

  return (
    <View style={[styles.stackedField, isLast && styles.stackedFieldLast]}>
      <Text style={styles.stackedFieldLabel}>{fieldLabel}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={Colors.text.tertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.stackedFieldInput,
          styles.stackedFieldInputRight,
          styles.fuelPriceStackedInput,
          {
            borderColor: focused ? Colors.border.strong : Colors.border.default,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    flexGrow: 1,
    width: "100%",
  },
  sectionGroupPadded: {
    padding: Spacing.lg,
  },
  stackedField: {
    marginBottom: Spacing.lg,
  },
  stackedFieldLast: {
    marginBottom: 0,
  },
  stackedFieldLabel: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  stackedFieldInput: {
    backgroundColor: Colors.bg.input,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.sm,
    height: 48,
    paddingHorizontal: 14,
    color: Colors.text.primary,
    fontSize: Typography.base,
    width: "100%",
  },
  stackedFieldInputMultiline: {
    height: 88,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  stackedFieldInputRight: {
    textAlign: "right",
  },
  fuelPriceStackedInput: {
    fontWeight: Typography.bold,
    color: Colors.text.accent,
  },
  loadingButtonRow: {
    ...Buttons.loadingRow,
  },
  buttonLoading: {
    ...Buttons.primaryLoading,
  },
  backLink: {
    ...Buttons.secondary,
    width: undefined,
    alignSelf: "flex-start",
    height: 44,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  backLinkPressed: {
    ...Buttons.secondaryPressed,
  },
  backLinkText: {
    ...Buttons.secondaryText,
  },
  pageHeader: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  pageTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
  },
  pageSubtitle: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    marginTop: Spacing.xs,
  },
  welcomeCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  welcomeTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.text.accent,
    marginBottom: Spacing.xs,
  },
  welcomeBody: {
    fontSize: Typography.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.text.tertiary,
    letterSpacing: Typography.widest,
    textTransform: "uppercase",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  liveFeedSectionLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.text.tertiary,
    letterSpacing: Typography.widest,
    textTransform: "uppercase",
    marginHorizontal: Spacing.lg,
    marginTop: 28,
    marginBottom: Spacing.sm,
  },
  nozzleFilterBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.bg.secondary,
    gap: Spacing.md,
  },
  nozzleChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  nozzleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentAlpha,
    borderWidth: 1,
    borderColor: Colors.border.accent,
  },
  nozzleChipPressed: {
    opacity: 0.75,
  },
  nozzleChipText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.text.accent,
  },
  nozzleInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  nozzleInput: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.bg.input,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    color: Colors.text.primary,
    fontSize: Typography.base,
  },
  nozzleAddBtn: {
    height: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  nozzleAddBtnPressed: {
    opacity: 0.85,
  },
  nozzleAddBtnDisabled: {
    opacity: 0.4,
  },
  nozzleAddBtnText: {
    color: "#FFFFFF",
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  sectionGroup: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.lg,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  rowMultiline: {
    minHeight: 72,
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    flexShrink: 0,
    marginRight: Spacing.md,
  },
  mockRowLabelWrap: {
    flex: 1,
    marginRight: Spacing.md,
  },
  mockRowHint: {
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
    marginTop: 2,
  },
  rowInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: Typography.base,
    textAlign: "right",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  rowInputMultiline: {
    textAlign: "right",
    minHeight: 56,
    textAlignVertical: "top",
  },
  fuelLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  fuelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fuelPriceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  fuelPricePrefix: {
    color: Colors.text.accent,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  fuelPriceInput: {
    color: Colors.text.accent,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    textAlign: "right",
    minWidth: 72,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  logoUploadArea: {
    backgroundColor: Colors.bg.input,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    height: 100,
    marginHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  logoUploadContent: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  logoUploadTitle: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
  },
  logoUploadHint: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
  },
  logoPreviewWrap: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  logoPreview: {
    height: 80,
    width: 160,
  },
  changeLogoText: {
    color: Colors.text.accent,
    fontSize: Typography.sm,
  },
  saveProfileButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: 0,
  },
  clearAllButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xxxl,
  },
  saveContinueButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxxl + Spacing.sm,
  },
  primaryButton: {
    ...Buttons.primary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  primaryButtonPressed: {
    ...Buttons.primaryPressed,
  },
  primaryButtonText: {
    ...Buttons.primaryText,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  versionText: {
    textAlign: "center",
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
    marginTop: Spacing.xxxl,
  },
  toastWrap: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: "center",
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toastText: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
  },
});
