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
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStationStore } from "../stores/stationStore";
import { Colors, Typography, Radius, Spacing, Shadow } from "../constants/theme";
import { isValidDecimal } from "../utils/validation";
import { getItem, StorageKeys, EZPUMP_EMAIL, EZPUMP_PASSWORD } from "../utils/storage";
import { recordPriceChange } from "../src/services/PriceHistoryService";
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

function SetupProgressHeader({ currentStep }: { currentStep: number }) {
  const dot1Scale = useRef(new Animated.Value(1)).current;
  const dot2Scale = useRef(new Animated.Value(0.75)).current;
  const dot3Scale = useRef(new Animated.Value(0.75)).current;
  const dot4Scale = useRef(new Animated.Value(0.75)).current;
  const dotScales = [dot1Scale, dot2Scale, dot3Scale, dot4Scale];

  useEffect(() => {
    dotScales.forEach((scale, index) => {
      const stepNum = index + 1;
      const isActive = currentStep === stepNum;
      Animated.timing(scale, {
        toValue: isActive ? 1 : 0.75,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [currentStep, dot1Scale, dot2Scale, dot3Scale, dot4Scale]);

  return (
    <View style={styles.setupProgressWrap}>
      <Text style={styles.setupProgressLabel}>
        SETUP {currentStep} OF 4
      </Text>
      <View style={styles.setupDotsRow}>
        {[1, 2, 3, 4].map((step, index) => {
          const completed = currentStep > step;
          const active = currentStep === step;
          const dotSize = active || completed ? 8 : 6;
          const dotColor = completed
            ? Colors.text.success
            : active
              ? Colors.accent
              : Colors.border.default;

          return (
            <Animated.View
              key={step}
              style={[
                styles.setupDot,
                {
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: dotColor,
                  transform: [{ scale: dotScales[index] }],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function SetupSectionCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.setupSectionCard}>
      <View style={styles.setupBadge}>
        <Text style={styles.setupBadgeText}>{step}</Text>
      </View>
      <Text style={styles.setupCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function LoadingButtonContent({ label, variant = "primary" }: { label: string; variant?: "primary" | "accent" }) {
  const textColor = variant === "accent" ? Colors.text.accent : Colors.text.primary;
  return (
    <View style={styles.loadingButtonRow}>
      <ActivityIndicator size="small" color={textColor} />
      <Text style={variant === "accent" ? styles.ezPumpSaveText : styles.primaryButtonText}>{label}</Text>
    </View>
  );
}

function SettingsInputRow({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  isLast,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  isLast?: boolean;
} & Omit<TextInputProps, "value" | "onChangeText">) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.row, multiline && styles.rowMultiline, isLast && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
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
          styles.rowInput,
          multiline && styles.rowInputMultiline,
          {
            borderBottomColor: focused ? Colors.border.strong : Colors.border.default,
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

  const [saving, setSaving] = useState(false);
  const [showEzPumpSetup, setShowEzPumpSetup] = useState(false);
  const [ezPumpEmail, setEzPumpEmail] = useState("");
  const [ezPumpPassword, setEzPumpPassword] = useState("");
  const [savingEzPump, setSavingEzPump] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [setupWelcomeVisible, setSetupWelcomeVisible] = useState(true);
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
      const savedEmail = await AsyncStorage.getItem(EZPUMP_EMAIL);
      setShowEzPumpSetup(!savedEmail);
    })();
  }, []);

  const handleSaveEzPumpCredentials = async () => {
    if (!ezPumpEmail.trim() || !ezPumpPassword.trim()) {
      setToast({
        visible: true,
        message: "Email and password are required",
        type: "error",
      });
      return;
    }

    setSavingEzPump(true);
    try {
      await AsyncStorage.setItem(EZPUMP_EMAIL, ezPumpEmail.trim());
      await AsyncStorage.setItem(EZPUMP_PASSWORD, ezPumpPassword);
      setShowEzPumpSetup(false);
      setEzPumpPassword("");
      setToast({
        visible: true,
        message: "Connected to EzPump portal",
        type: "success",
      });
      router.replace("/");
    } finally {
      setSavingEzPump(false);
    }
  };

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
    if (oldProfile?.fuelPrices) {
      const oldPetrol = parseFloat(oldProfile.fuelPrices.petrol);
      const oldDiesel = parseFloat(oldProfile.fuelPrices.diesel);
      const oldHiOctane = parseFloat(oldProfile.fuelPrices.hiOctane);
      const newPetrol = parseFloat(petrol);
      const newDiesel = parseFloat(diesel);
      const newHiOctane = parseFloat(hiOctane);

      if (oldPetrol > 0 && oldPetrol !== newPetrol) {
        await recordPriceChange("PETROL", oldPetrol, newPetrol);
      }
      if (oldDiesel > 0 && oldDiesel !== newDiesel) {
        await recordPriceChange("DIESEL", oldDiesel, newDiesel);
      }
      if (oldHiOctane > 0 && oldHiOctane !== newHiOctane) {
        await recordPriceChange("HI-OCTANE", oldHiOctane, newHiOctane);
      }
    }

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

  const setupStep = isInitialSetup
    ? setupWelcomeVisible
      ? 1
      : 2
    : 0;

  const renderSetupForm = () => (
    <>
      <SetupSectionCard step={1} title="Station Profile">
        <SectionGroup>
          <SettingsInputRow
            label="Station Name"
            value={station.stationName}
            onChangeText={station.setStationName}
            placeholder="Enter station name"
          />
          <SettingsInputRow
            label="Station Address"
            value={station.stationAddress}
            onChangeText={station.setStationAddress}
            placeholder="Enter station address"
            multiline
          />
          <SettingsInputRow
            label="Contact Phone"
            value={station.stationPhone}
            onChangeText={station.setStationPhone}
            placeholder="e.g. 03001234567"
            keyboardType="number-pad"
            isLast
          />
        </SectionGroup>
      </SetupSectionCard>

      <SetupSectionCard step={2} title="Fuel Prices">
        <SectionGroup>
          {FUEL_PRICE_ROWS.map((fuel, index) => (
            <FuelPriceRow
              key={fuel.key}
              label={fuel.label}
              color={fuel.color}
              value={fuelValues[fuel.key]}
              onChangeText={fuelSetters[fuel.key]}
              isLast={index === FUEL_PRICE_ROWS.length - 1}
            />
          ))}
        </SectionGroup>
      </SetupSectionCard>

      <SetupSectionCard step={3} title="Station Logo">
        <Pressable
          onPress={showLogoPickerOptions}
          disabled={logoProcessing}
          style={styles.logoUploadAreaSetup}
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
      </SetupSectionCard>

      <SetupSectionCard step={4} title="Print Options">
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
      </SetupSectionCard>
    </>
  );

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
          {isInitialSetup ? (
            <SetupProgressHeader currentStep={setupStep} />
          ) : (
            <Pressable onPress={() => router.back()} style={styles.backLink} hitSlop={8}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>
          )}

          {!isInitialSetup ? (
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Settings</Text>
              <Text style={styles.pageSubtitle}>PetrolSlip Pro Max</Text>
            </View>
          ) : null}

          {isInitialSetup && setupWelcomeVisible ? (
            <View style={styles.setupWelcomeCard}>
              <View style={styles.setupIconPlaceholder} />
              <Text style={styles.setupWelcomeTitle}>Welcome to PetrolSlip</Text>
              <Text style={styles.setupWelcomeSubtitle}>Let's set up your station</Text>
              <Pressable
                onPress={() => setSetupWelcomeVisible(false)}
                style={({ pressed }) => [
                  styles.setupGetStartedButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </Pressable>
            </View>
          ) : null}

          {isInitialSetup && !setupWelcomeVisible ? renderSetupForm() : null}

          {!isInitialSetup ? (
            <>
              <SectionLabel>STATION PROFILE</SectionLabel>
              <SectionGroup>
                <SettingsInputRow
                  label="Station Name"
                  value={station.stationName}
                  onChangeText={station.setStationName}
                  placeholder="Enter station name"
                />
                <SettingsInputRow
                  label="Station Address"
                  value={station.stationAddress}
                  onChangeText={station.setStationAddress}
                  placeholder="Enter station address"
                  multiline
                />
                <SettingsInputRow
                  label="Contact Phone"
                  value={station.stationPhone}
                  onChangeText={station.setStationPhone}
                  placeholder="e.g. 03001234567"
                  keyboardType="number-pad"
                  isLast
                />
              </SectionGroup>

              <SectionLabel>FUEL PRICES</SectionLabel>
              <SectionGroup>
                {FUEL_PRICE_ROWS.map((fuel, index) => (
                  <FuelPriceRow
                    key={fuel.key}
                    label={fuel.label}
                    color={fuel.color}
                    value={fuelValues[fuel.key]}
                    onChangeText={fuelSetters[fuel.key]}
                    isLast={index === FUEL_PRICE_ROWS.length - 1}
                  />
                ))}
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
            </>
          ) : null}

          {showEzPumpSetup ? (
            <>
              <SectionLabel>EZPUMP PORTAL</SectionLabel>
              <SectionGroup>
                <View style={styles.ezPumpInfoRow}>
                  <Ionicons name="wifi-outline" size={16} color={Colors.text.tertiary} />
                  <Text style={styles.ezPumpInfoText}>Connect to live receipt feed</Text>
                </View>
                <SettingsInputRow
                  label="Portal Email"
                  value={ezPumpEmail}
                  onChangeText={setEzPumpEmail}
                  placeholder="admin@ez-pump.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <SettingsInputRow
                  label="Portal Password"
                  value={ezPumpPassword}
                  onChangeText={setEzPumpPassword}
                  placeholder="Enter password"
                  secureTextEntry
                />
                <Pressable
                  onPress={handleSaveEzPumpCredentials}
                  disabled={savingEzPump}
                  style={styles.ezPumpSaveRow}
                >
                  {savingEzPump ? (
                    <LoadingButtonContent label="Updating..." variant="accent" />
                  ) : (
                    <Text style={styles.ezPumpSaveText}>Save & Connect</Text>
                  )}
                </Pressable>
              </SectionGroup>
            </>
          ) : null}

          {(!isInitialSetup || !setupWelcomeVisible) ? (
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryButton,
                saving && styles.buttonLoading,
                pressed && !saving && styles.primaryButtonPressed,
              ]}
            >
              {saving ? (
                <LoadingButtonContent label="Saving..." />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isInitialSetup ? "Save & Continue" : "Save Station Profile"}
                </Text>
              )}
            </Pressable>
          ) : null}

          {!isInitialSetup ? (
            <Pressable
              onPress={handleClearAll}
              style={({ pressed }) => [styles.dangerButton, pressed && styles.dangerButtonPressed]}
            >
              <Text style={styles.dangerButtonText}>Clear All Data</Text>
            </Pressable>
          ) : null}

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
  color,
  value,
  onChangeText,
  isLast,
}: {
  label: string;
  color: string;
  value: string;
  onChangeText: (text: string) => void;
  isLast?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <View style={styles.fuelLabelWrap}>
        <View style={[styles.fuelDot, { backgroundColor: color }]} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.fuelPriceInputWrap}>
        <Text style={styles.fuelPricePrefix}>PKR </Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={Colors.text.tertiary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.fuelPriceInput,
            {
              borderBottomColor: focused ? Colors.border.strong : Colors.border.default,
            },
          ]}
        />
      </View>
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
  },
  setupProgressWrap: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  setupProgressLabel: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    letterSpacing: Typography.widest,
    textTransform: "uppercase",
    textAlign: "center",
  },
  setupDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  setupDot: {
    marginHorizontal: 0,
  },
  setupWelcomeCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    alignItems: "center",
  },
  setupIconPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.bg.elevated,
  },
  setupWelcomeTitle: {
    fontSize: Typography.xxl,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  setupWelcomeSubtitle: {
    fontSize: Typography.base,
    color: Colors.text.secondary,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  setupGetStartedButton: {
    width: "100%",
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xxl,
    ...Shadow.glow,
  },
  setupSectionCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    position: "relative",
  },
  setupBadge: {
    position: "absolute",
    top: Spacing.lg,
    left: Spacing.lg,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accentAlpha,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  setupBadgeText: {
    color: Colors.text.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  setupCardTitle: {
    color: Colors.text.primary,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    marginBottom: Spacing.lg,
    paddingLeft: 32,
  },
  logoUploadAreaSetup: {
    backgroundColor: Colors.bg.input,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  buttonLoading: {
    backgroundColor: Colors.accentDark,
    opacity: 0.7,
  },
  backLink: {
    marginHorizontal: Spacing.xl,
    minHeight: 44,
    justifyContent: "center",
  },
  backLinkText: {
    color: Colors.text.tertiary,
    fontSize: Typography.base,
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
  ezPumpInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  ezPumpInfoText: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
  },
  ezPumpSaveRow: {
    backgroundColor: Colors.accentAlpha,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  ezPumpSaveText: {
    color: Colors.text.accent,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  primaryButton: {
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    ...Shadow.glow,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: Colors.accentDark,
  },
  primaryButtonText: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  dangerButton: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.text.danger,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    minHeight: 44,
  },
  dangerButtonPressed: {
    opacity: 0.85,
  },
  dangerButtonText: {
    color: Colors.text.danger,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
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
