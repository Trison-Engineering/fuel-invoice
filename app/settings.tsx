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
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStationStore } from "../stores/stationStore";
import { Colors, Typography, Radius, Spacing, Shadow, Buttons } from "../constants/theme";
import { isValidDecimal } from "../utils/validation";
import { getItem, StorageKeys, EZPUMP_EMAIL, EZPUMP_PASSWORD, LIVE_FEED_FILTER_ENABLED, LIVE_FEED_FILTER_PRODUCT } from "../utils/storage";
import { recordPriceChange } from "../src/services/PriceHistoryService";
import { preprocessLogoForUpload } from "../src/utils/printLogoUtil";
import type { StationProfile } from "../stores/stationStore";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const FUEL_PRICE_ROWS = [
  { key: "petrol", label: "Petrol", color: Colors.product.petrol },
  { key: "diesel", label: "Diesel", color: Colors.product.diesel },
  { key: "hiOctane", label: "Hi-Octane", color: Colors.product.hiOctane },
] as const;

const LIVE_FEED_PRODUCTS = [
  { id: "Petrol" as const, label: "Petrol", color: Colors.product.petrol },
  { id: "Diesel" as const, label: "Diesel", color: Colors.product.diesel },
  { id: "Hi-Octane" as const, label: "Hi-Octane", color: Colors.product.hiOctane },
];

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function SectionGroup({ children }: { children: ReactNode }) {
  return <View style={styles.sectionGroup}>{children}</View>;
}

function LiveFeedRadioRow({
  label,
  color,
  selected,
  isLast,
  onPress,
}: {
  label: string;
  color: string;
  selected: boolean;
  isLast?: boolean;
  onPress: () => void;
}) {
  return (
    <>
      <Pressable onPress={onPress} style={styles.liveFeedRadioRow}>
        <View style={styles.liveFeedRadioLeft}>
          <View
            style={[
              styles.liveFeedRadioOuter,
              selected && { borderColor: color },
            ]}
          >
            {selected ? (
              <View style={[styles.liveFeedRadioInner, { backgroundColor: color }]} />
            ) : null}
          </View>
          <Text
            style={[
              styles.liveFeedRadioLabel,
              { color: selected ? color : Colors.text.secondary },
            ]}
          >
            {label}
          </Text>
        </View>
        <View style={[styles.liveFeedColorDot, { backgroundColor: color }]} />
      </Pressable>
      {!isLast ? <View style={styles.liveFeedRadioSeparator} /> : null}
    </>
  );
}

function LiveFeedFilterSection({
  filterEnabled,
  selectedProduct,
  onToggle,
  onSelectProduct,
}: {
  filterEnabled: boolean;
  selectedProduct: string | null;
  onToggle: (value: boolean) => void;
  onSelectProduct: (product: "Petrol" | "Diesel" | "Hi-Octane") => void;
}) {
  const radioAnim = useRef(new Animated.Value(filterEnabled ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(radioAnim, {
      toValue: filterEnabled ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [filterEnabled, radioAnim]);

  const radioMaxHeight = radioAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 170],
  });

  return (
    <>
      <Text style={styles.liveFeedSectionLabel}>LIVE FEED</Text>
      <SectionGroup>
        <View style={[styles.row, !filterEnabled && styles.rowLast]}>
          <Text style={styles.rowLabel}>Filter by specific product</Text>
          <Switch
            value={filterEnabled}
            onValueChange={onToggle}
            trackColor={{ false: Colors.bg.hover, true: Colors.accentAlpha }}
            thumbColor={filterEnabled ? Colors.accent : Colors.text.tertiary}
          />
        </View>
        <Animated.View
          style={{
            opacity: radioAnim,
            maxHeight: radioMaxHeight,
            overflow: "hidden",
          }}
        >
          <View style={styles.liveFeedRadioContainer}>
            {LIVE_FEED_PRODUCTS.map((product, index) => (
              <LiveFeedRadioRow
                key={product.id}
                label={product.label}
                color={product.color}
                selected={selectedProduct === product.id}
                isLast={index === LIVE_FEED_PRODUCTS.length - 1}
                onPress={() => onSelectProduct(product.id)}
              />
            ))}
          </View>
        </Animated.View>
      </SectionGroup>
    </>
  );
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

  const [saving, setSaving] = useState(false);
  const [showEzPumpSetup, setShowEzPumpSetup] = useState(false);
  const [ezPumpEmail, setEzPumpEmail] = useState("");
  const [ezPumpPassword, setEzPumpPassword] = useState("");
  const [savingEzPump, setSavingEzPump] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [liveFeedFilterProduct, setLiveFeedFilterProduct] = useState<string | null>(null);
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

      const enabled = await AsyncStorage.getItem(LIVE_FEED_FILTER_ENABLED);
      const product = await AsyncStorage.getItem(LIVE_FEED_FILTER_PRODUCT);
      setFilterEnabled(enabled === "true");
      setLiveFeedFilterProduct(product || null);
    })();
  }, []);

  const handleToggleLiveFeedFilter = useCallback(async (value: boolean) => {
    setFilterEnabled(value);
    await AsyncStorage.setItem(LIVE_FEED_FILTER_ENABLED, value ? "true" : "false");
    if (!value) {
      setLiveFeedFilterProduct(null);
      await AsyncStorage.removeItem(LIVE_FEED_FILTER_PRODUCT);
    }
  }, []);

  const handleSelectLiveFeedProduct = useCallback(
    async (product: "Petrol" | "Diesel" | "Hi-Octane") => {
      setLiveFeedFilterProduct(product);
      await AsyncStorage.setItem(LIVE_FEED_FILTER_PRODUCT, product);
    },
    []
  );

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

  const setupStep = isInitialSetup ? 1 : 0;

  const renderSetupForm = () => (
    <>
      <SetupSectionCard step={1} title="Station Profile">
        <View style={styles.stackedFieldsWrap}>
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
      </SetupSectionCard>

      <SetupSectionCard step={2} title="Fuel Prices">
        <View style={styles.stackedFieldsWrap}>
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

      <LiveFeedFilterSection
        filterEnabled={filterEnabled}
        selectedProduct={liveFeedFilterProduct}
        onToggle={handleToggleLiveFeedFilter}
        onSelectProduct={handleSelectLiveFeedProduct}
      />
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
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backLink, pressed && styles.backLinkPressed]} hitSlop={8}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>
          )}

          {!isInitialSetup ? (
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Settings</Text>
              <Text style={styles.pageSubtitle}>Petro Slip Pro</Text>
            </View>
          ) : null}

          {isInitialSetup ? renderSetupForm() : null}

          {!isInitialSetup ? (
            <>
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
            </>
          ) : null}

          {showEzPumpSetup && !isInitialSetup ? (
            <>
              <SectionLabel>EZPUMP PORTAL</SectionLabel>
              <SectionGroup>
                <View style={styles.ezPumpInfoRow}>
                  <Ionicons name="wifi-outline" size={16} color={Colors.text.tertiary} />
                  <Text style={styles.ezPumpInfoText}>Connect to live receipt feed</Text>
                </View>
                <View style={styles.sectionGroupPadded}>
                  <SettingsInputRow
                    label="Portal Email"
                    fieldLabel="PORTAL EMAIL"
                    value={ezPumpEmail}
                    onChangeText={setEzPumpEmail}
                    placeholder="admin@ez-pump.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <SettingsInputRow
                    label="Portal Password"
                    fieldLabel="PORTAL PASSWORD"
                    value={ezPumpPassword}
                    onChangeText={setEzPumpPassword}
                    placeholder="Enter password"
                    secureTextEntry
                    isLast
                  />
                </View>
                <ActionButton
                  label="Save & Connect"
                  icon="wifi-outline"
                  onPress={handleSaveEzPumpCredentials}
                  loading={savingEzPump}
                  loadingLabel="Saving..."
                  disabled={savingEzPump}
                  style={styles.saveEzPumpButton}
                />
              </SectionGroup>
            </>
          ) : null}

          {!isInitialSetup ? (
            <LiveFeedFilterSection
              filterEnabled={filterEnabled}
              selectedProduct={liveFeedFilterProduct}
              onToggle={handleToggleLiveFeedFilter}
              onSelectProduct={handleSelectLiveFeedProduct}
            />
          ) : null}

          {!isInitialSetup ? (
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
          ) : null}

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
  setupGetStartedText: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  welcomeProgressDots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  welcomeProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  stackedFieldsWrap: {
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
  liveFeedRadioContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.bg.secondary,
  },
  liveFeedRadioRow: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xs,
  },
  liveFeedRadioLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  liveFeedRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  liveFeedRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  liveFeedRadioLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    marginLeft: Spacing.md,
  },
  liveFeedColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveFeedRadioSeparator: {
    height: 1,
    backgroundColor: Colors.border.subtle,
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
  saveEzPumpButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    height: 52,
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
