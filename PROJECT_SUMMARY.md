# Petro Slip Pro — Project Summary

Cross-platform mobile app (Android & iOS) for generating fuel pump receipts with Bluetooth thermal printer support. Built with **React Native**, **Expo**, and **expo-router**. Works fully offline for printing, with optional live sales feed from a local EzPump/TrisonPump portal on station WiFi.

**Package:** `com.petroslip.pro`  
**App name:** Petro Slip Pro  
**Version:** 2.0.0 (`app.json`)  
**EAS owner:** `arslan_eas_5`  
**EAS project:** `@arslan_eas_5/petroslip-pro`  
**EAS project ID:** `569a0308-70cc-45c8-902d-5fe9758e8445`  
**Dashboard:** https://expo.dev/accounts/arslan_eas_5/projects/petroslip-pro

---

## Table of Contents

1. [What the App Does](#1-what-the-app-does)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [App Startup Flow](#4-app-startup-flow)
5. [Screens & Functionality](#5-screens--functionality)
6. [Styling System](#6-styling-system)
7. [Data & State Architecture](#7-data--state-architecture)
8. [Services Layer](#8-services-layer)
9. [Native Android Plugins](#9-native-android-plugins)
10. [Receipt Printing Flow](#10-receipt-printing-flow)
11. [Build & Deploy](#11-build--deploy)
12. [Button Style Reference](#12-button-style-reference)
13. [Recent Changes](#13-recent-changes)

---

## 1. What the App Does

| Area | Purpose |
|------|---------|
| **Home (`app/index.tsx`)** | Dashboard with live receipts + 3-step manual receipt wizard |
| **Settings (`app/settings.tsx`)** | Station profile, fuel prices, logo, EzPump credentials, live feed filter |
| **Admin (`app/admin.tsx`)** | Invoice history, price history, slip counter sessions, portal config |
| **Printer Setup (`app/printer-setup.tsx`)** | Connect/test Sunmi built-in printer |
| **Printing** | ESC/POS thermal receipts via native Bluetooth module |
| **Persistence** | AsyncStorage + Zustand for station profile and history |

### Core Features

- Receipt form with station details, payment, fuel data, and vehicle info
- Auto-calculated total, invoice number, date/time defaults
- Bluetooth thermal printer discovery, pairing, and ESC/POS printing (58mm)
- Save/share receipt as 58mm PDF
- Live receipt preview component (preview screen currently commented out in home)
- Persisted station profile (AsyncStorage + Zustand)
- Live sales feed from local pump controller (EzPump)
- Slip counter sessions for shift tracking
- Invoice history with reprint support

---

## 2. Tech Stack

```
React Native 0.79  +  Expo 53  +  expo-router 5
TypeScript
Zustand (station state)
AsyncStorage (local persistence)
NativeWind 4 + Tailwind (installed but NOT actively used)
Custom native Android plugins (Sunmi, Bluetooth ESC/POS, Nyx printer)
EAS Build for production APKs
```

**Important:** This is **not Expo Go** — it requires a **dev client / custom APK** because of native printer modules.

### Key Dependencies

| Package | Role |
|---------|------|
| `expo-router` | File-based navigation |
| `zustand` | Station profile state |
| `@react-native-async-storage/async-storage` | Local persistence |
| `@vardrz/react-native-bluetooth-escpos-printer` | Bluetooth ESC/POS printing |
| `nativewind` / `tailwindcss` | Installed; UI does not use `className` |
| `expo-image-picker` | Station logo upload |
| `expo-print` / `expo-sharing` | PDF export |

---

## 3. Project Structure

```
fuel-invoice/
├── app/                          # Screens (expo-router file-based routing)
│   ├── _layout.tsx               # Root: splash, providers, navigation stack
│   ├── index.tsx                 # Main home (~2,510 lines)
│   ├── settings.tsx              # Station setup + EzPump config
│   ├── admin.tsx                 # Admin panel (4 tabs)
│   └── printer-setup.tsx         # Printer diagnostics & test prints
│
├── components/                   # Reusable UI (mostly legacy light-theme)
│   ├── InputField.tsx, TextAreaField.tsx, SelectField.tsx
│   ├── FormSection.tsx, LogoUploader.tsx
│   ├── ReceiptPreview.tsx, Toast.tsx, PrinterStatus.tsx
│   └── PoweredBySplash.tsx       # Animated boot splash
│
├── constants/
│   ├── theme.ts                  # ★ Design system (Colors, Typography, Buttons, etc.)
│   └── printerPaper.ts           # 58mm paper width, font sizes for receipts
│
├── contexts/
│   └── PrinterContext.tsx        # Wraps usePrinter hook app-wide
│
├── hooks/
│   ├── useFormState.ts           # Manual receipt form logic
│   └── usePrinter.ts             # Printer connection + print actions
│
├── stores/
│   └── stationStore.ts           # Zustand: station profile, fuel prices, logos
│
├── src/
│   ├── services/                 # Business logic layer
│   │   ├── EzPumpService.ts      # Portal HTTP scraping (live sales + rates)
│   │   ├── PrinterService.ts     # Printer orchestration
│   │   ├── SunmiPrinterService.ts
│   │   ├── BluetoothPrinterService.ts
│   │   ├── InvoiceHistoryService.ts
│   │   ├── SlipCounterService.ts
│   │   ├── PriceHistoryService.ts
│   │   └── printerNativeModule.ts
│   ├── screens/
│   │   └── ReceiptPreviewScreen.tsx  (currently commented out in index)
│   └── utils/
│       ├── logoStorage.ts, printLogoUtil.ts, printerUtils.ts
│
├── utils/                        # Shared utilities
│   ├── generateReceipt.ts        # ESC/POS byte generation
│   ├── receiptFormat.ts          # Receipt layout plan
│   ├── generatePDF.ts            # PDF export
│   ├── formatters.ts, validation.ts, storage.ts
│   └── bluetoothPermissions.ts, bluetoothSettings.ts
│
├── plugins/                      # Expo config plugins (native Android)
│   ├── withSunmiPrinter.js
│   ├── withUnifiedPrinter.js
│   ├── withBluetoothRawPrinter.js
│   ├── withNyxPrinter.js
│   ├── withCleartextTraffic.js
│   └── unified-printer/          # Kotlin native module (Sunmi AIDL)
│
├── assets/                       # Icons, splash, PSO logo
├── global.css                    # Tailwind entry (imported in _layout)
├── tailwind.config.js            # Tailwind config (light theme — unused in UI)
├── app.json                      # Expo config, permissions, EAS project
├── eas.json                      # EAS build profiles
├── package.json
└── PROJECT_SUMMARY.md            # This document
```

---

## 4. App Startup Flow

```
App Launch
    ↓
PoweredBySplash (typing animation)
    ↓
stationStore.hydrate() from AsyncStorage
    ↓
Profile complete? ──No──→ Redirect to /settings?setup=1
    │
   Yes
    ↓
Show Home Dashboard

Parallel: PrinterProvider auto-inits Sunmi printer on Android
```

**Profile complete** = station name + address + all 3 fuel prices > 0.

Defined in `stores/stationStore.ts` → `isProfileComplete()`.

Bootstrap logic lives in `app/_layout.tsx` (`AppBootstrap` component).

---

## 5. Screens & Functionality

### 5.1 Home — `app/index.tsx`

Two modes controlled by `currentStep`:

| Step | View | Behavior |
|------|------|----------|
| **0** | Dashboard | Live feed from EzPump + "Print New Receipt" CTA |
| **1** | Product picker | Petrol / Diesel / Hi-Octane |
| **2** | Volume entry | Large numeric input, auto-fetches official rate |
| **3** | Summary + vehicle | Review totals, optional vehicle #, print |

#### Dashboard (Step 0)

- Polls `EzPumpService.getRecentSales()` every 10 seconds
- Pull-to-refresh
- Product filter (configured in Settings)
- Each sale card → bottom sheet → print with optional vehicle override
- Header: slip counter badge, admin login, settings gear

#### Manual Wizard (Steps 1–3)

- Animated step transitions (`slideAnim`, `stepOpacity`)
- Progress bar at top (`StepProgressBar`)
- Step 2 fetches official rate from EzPump when available
- After print → duplicate overlay (10s countdown) to reprint same receipt
- Wizard buttons are absolutely positioned inside `KeyboardAvoidingView` (`stepKeyboard` has `position: 'relative'`)

#### Admin Access

Modal login (`admin@admin.com` / `admin@123`) → navigates to `/admin`

#### Key Module-Level Constants (Home)

```typescript
const PRODUCTS = [
  { name: "Petrol", label: "PETROL", color: Colors.product.petrol },
  { name: "Diesel", label: "DIESEL", color: Colors.product.diesel },
  { name: "Hi-Octane", label: "HI-OCTANE", color: Colors.product.hiOctane },
];
```

Product list uses `flexDirection: 'row'` with dot, label, and selection circle as direct children of each `Pressable`.

---

### 5.2 Settings — `app/settings.tsx`

Two modes:

1. **First-run wizard** (`?setup=1`) — 3-step onboarding cards
2. **Normal settings** — full editable profile

#### Sections

| Section | Details |
|---------|---------|
| **Station info** | Name, address, phone |
| **Fuel prices** | Petrol, Diesel, Hi-Octane (records price history on save) |
| **Logo** | Upload PNG/JPG (max 2MB), include in print toggle, dual-logo option |
| **Live feed** | Filter by product toggle + radio selection |
| **EzPump portal** | Email/password for local pump controller |
| **Save** | Persists via `stationStore.saveProfile()` |

---

### 5.3 Admin — `app/admin.tsx`

Four tabs:

| Tab | Features |
|-----|----------|
| **Invoices** | Search, product filter pills, reprint from history |
| **Price History** | Table of fuel price changes over time |
| **Slip Counter** | Active session, daily counts, end session, history |
| **Portal** | Update/test EzPump credentials, view cached rates |

---

### 5.4 Printer Setup — `app/printer-setup.tsx`

- Init/reconnect Sunmi InnerPrinter via Bluetooth
- Status display (connected, paper out, etc.)
- Test prints: calibration line, hello world, full test receipt, diagnostic

---

## 6. Styling System

### 6.1 Primary Approach: StyleSheet + Theme Tokens

The app uses a **dark navy design system** defined in `constants/theme.ts`.

#### Design Tokens

| Token | Purpose |
|-------|---------|
| `Colors` | Dark backgrounds, text hierarchy, product colors, accent blue |
| `Typography` | Font sizes (xs→xxxl), weights, letter-spacing |
| `Radius` | Border radius scale (xs→full) |
| `Spacing` | 4px-based spacing scale |
| `Shadow` | card, elevated, glow shadows |
| `Buttons` | Pre-built button style objects to spread into StyleSheets |

#### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `Colors.bg.primary` | `#0A0F1E` | App background |
| `Colors.bg.card` | `#141B2D` | Cards |
| `Colors.bg.input` | `#1E2A40` | Text inputs |
| `Colors.accent` | `#3B82F6` | Primary CTA blue |
| `Colors.accentDark` | `#1D4ED8` | Pressed state |
| `Colors.text.primary` | `#FFFFFF` | Main text |
| `Colors.text.secondary` | `#8892A4` | Secondary text |
| `Colors.text.tertiary` | `#4E5A6E` | Hints, labels |
| `Colors.product.petrol` | `#22C55E` | Petrol badge |
| `Colors.product.diesel` | `#3B82F6` | Diesel badge |
| `Colors.product.hiOctane` | `#A855F7` | Hi-Octane badge |

#### Standard Usage Pattern

```typescript
import { Colors, Typography, Radius, Spacing, Shadow, Buttons } from "../constants/theme";

const styles = StyleSheet.create({
  primaryButton: {
    ...Buttons.primary,
    marginHorizontal: Spacing.lg,
  },
  primaryButtonPressed: {
    ...Buttons.primaryPressed,
  },
});

// In JSX:
<Pressable
  style={({ pressed }) => [
    styles.primaryButton,
    pressed && styles.primaryButtonPressed,
    disabled && styles.buttonDisabled,
  ]}
>
```

---

### 6.2 Button Styling — Unified Across All Screens

**Source of truth:** `constants/theme.ts` → `Buttons` object

All main screens (`index.tsx`, `settings.tsx`, `admin.tsx`, `printer-setup.tsx`) spread `Buttons.*` into local StyleSheet entries.

#### `app/index.tsx` Button StyleSheet Aliases

| Style key | Spreads from `Buttons` |
|-----------|------------------------|
| `primaryBtn` | `primary` |
| `primaryBtnPressed` | `primaryPressed` |
| `primaryBtnDisabled` | `primaryDisabled` |
| `primaryBtnText` | `primaryText` |
| `primaryBtnTextDisabled` | `primaryTextDisabled` |
| `secondaryBtn` | `secondary` |
| `accentOutlineBtn` | `accentOutline` |
| `iconBtn` | `icon` |
| `loadingRow` | `loadingRow` |
| `destructiveBtn` | `destructive` |
| `absoluteBottomBtn` | Layout only (absolute bottom wizard buttons) |

#### Where Buttons Are Used in `index.tsx`

| UI element | Styles used |
|------------|-------------|
| Step 1/2 Continue | `primaryBtn` + `absoluteBottomBtn` |
| Step 3 Print Receipt | `primaryBtn` + `absoluteBottomBtn` + `loadingRow` |
| Print New Receipt (home) | `printNewReceiptButton` (spreads `Buttons.primary`) |
| Card Print (live feed) | `cardPrintButton` (spreads `Buttons.reprint`) |
| Duplicate overlay — Print Duplicate? | `accentOutlineBtn` |
| Duplicate overlay — Skip | `secondaryBtn` |
| Duplicate overlay — ✕ close | `iconBtn` |
| Admin login modal — Login | `primaryBtn` + `loginPrimaryBtn` |
| Admin login modal — Cancel | `secondaryBtn` + `loginSecondaryBtn` |
| Back button (wizard) | `backButton` (spreads `Buttons.secondary`) |

---

### 6.3 NativeWind / Tailwind — Installed but Unused

- `global.css` is imported in `app/_layout.tsx`
- `tailwind.config.js` defines a **light theme** that conflicts with the dark UI
- **Zero `className=` usage** anywhere in the codebase
- Not the active styling system

---

### 6.4 Legacy Components — Old Light Theme

Files in `components/` like `InputField.tsx` use deprecated `colors` / `spacing` from theme. Main screens do not use these components.

---

### 6.5 Visual Design Language

| Element | Style |
|---------|-------|
| Background | `#0A0F1E` (deep navy) |
| Cards | `#141B2D` with `rgba(255,255,255,0.08)` borders |
| Primary CTA | Blue `#3B82F6`, 56–60px height, glow shadow |
| Product colors | Petrol green, Diesel blue, Hi-Octane purple |
| Typography | White primary, `#8892A4` secondary, `#4E5A6E` tertiary |
| Section labels | Uppercase, wide letter-spacing, xs size |
| Icons | `@expo/vector-icons` (Ionicons) |

---

## 7. Data & State Architecture

```
Screens (UI)
    ├── stationStore (Zustand) ──→ AsyncStorage (utils/storage)
    ├── PrinterContext ──→ usePrinter ──→ PrinterService
    │                                         └── SunmiPrinterService
    │                                               └── BluetoothPrinterService
    │                                                     └── Native Kotlin Module
    ├── useFormState (local form state for manual wizard)
    ├── EzPumpService (HTTP to local portal)
    ├── InvoiceHistoryService (AsyncStorage)
    └── SlipCounterService (AsyncStorage)
```

### Station Store (`stores/stationStore.ts`)

| Field | Description |
|-------|-------------|
| `stationName`, `stationAddress`, `stationPhone` | Station identity |
| `fuelPrices` | `{ petrol, diesel, hiOctane }` strings |
| `logoDataUrl`, `logo2DataUrl` | Base64 logo images |
| `includeLogoInPrint`, `useTwoLogos` | Print options |
| `paymentMethod` | Always saved as "Cash" |
| `isHydrated` | AsyncStorage load complete |

Key methods: `hydrate()`, `saveProfile()`, `isProfileComplete()`, `getFuelPrice(productType)`, `clearAll()`

### Form State (`hooks/useFormState.ts`)

Manages manual receipt wizard fields:
- `productType`, `fuelRate`, `volume`, `vehicleNumber`
- Auto-calculates `totalAmount`
- `validate()` + scroll-to-error
- `getReceiptData()` builds `ReceiptData` for printing

### Storage Keys

| Key | Data |
|-----|------|
| `@fuel_receipt:station_profile` | Station name, address, prices, logos |
| `@fuel_receipt:include_logo_in_print` | Logo print toggle |
| `@fuel_receipt:use_two_logos` | Dual logo toggle |
| `@fuel_receipt:ezpump_email` / `ezpump_password` | Portal credentials |
| `@fuel_receipt:live_feed_filter_enabled` | Live feed filter on/off |
| `@fuel_receipt:live_feed_filter_product` | Filtered product name |
| `invoice_history` | Last 2000 invoices (7-day prune) |
| `current_slip_session` / `slip_sessions` | Slip counter sessions |

---

## 8. Services Layer

### EzPumpService (`src/services/EzPumpService.ts`)

- Connects to local pump controller at `http://192.168.0.100`
- Session cookie auth (HTML form login)
- `getRecentSales()` — scrapes recent sales HTML
- `fetchRates()` — official fuel rates with 10-min cache
- `getEffectiveRate(sale)` — picks official or calculated rate
- Requires station WiFi + saved credentials
- Errors: `CREDENTIALS_NOT_SET`, `NETWORK_UNAVAILABLE`

### Printer Pipeline

```
usePrinter (hook)
    ↓
PrinterService (orchestration)
    ↓
SunmiPrinterService (maps ReceiptData → print view)
    ↓
BluetoothPrinterService (sends ESC/POS bytes)
    ↓
Native Kotlin Module (Sunmi AIDL / Bluetooth raw)
```

Supporting files:
- `utils/generateReceipt.ts` — ESC/POS byte generation
- `utils/receiptFormat.ts` — Receipt layout plan
- `constants/printerPaper.ts` — 58mm width, font sizes

### InvoiceHistoryService

- Saves every print (original + duplicates flagged with `isDuplicate`)
- Max 2000 invoices, prunes entries older than 7 days
- Admin tab reads/reprints from here
- Product keys: `PETROL`, `DIESEL`, `HI-OCTANE`

### SlipCounterService

- Tracks slips per session/day
- Header badge shows today's count when session active
- `incrementSlipCount()` called after each successful print
- `endSlipSession()` archives session to history

### PriceHistoryService

- Records fuel price changes when settings are saved
- Admin "Price History" tab displays chronological changes

---

## 9. Native Android Plugins

Configured in `app.json` plugins array:

| Plugin | Purpose |
|--------|---------|
| `withSunmiPrinter.js` | Sunmi built-in printer AIDL |
| `withUnifiedPrinter.js` | Unified printer Kotlin module |
| `withBluetoothRawPrinter.js` | Raw ESC/POS over Bluetooth |
| `withNyxPrinter.js` | Nyx printer support |
| `withCleartextTraffic` | Allows HTTP to local EzPump (no HTTPS) |

Kotlin sources live in `plugins/unified-printer/` (includes Sunmi AIDL interfaces).

### Android Permissions

Bluetooth (connect, scan, advertise), location (BLE scan), camera, photo library, audio (image picker).

---

## 10. Receipt Printing Flow

1. Build `ReceiptData` object (from `useFormState.getReceiptData()` or EzPump sale via `ezPumpSaleToReceiptData()`)
2. `printer.printReceipt(data, isDuplicate?)` via `usePrinterContext()`
3. `PrinterService.printFuelReceipt()` ensures Bluetooth connection
4. `SunmiPrinterService.printSunmiReceiptFromFuelData()` maps to print view
5. `BluetoothPrinterService` sends ESC/POS bytes from `generateReceipt.ts`
6. Optional logo bitmap if `includeLogoInPrint` is true
7. Save to `InvoiceHistoryService` + increment slip counter via `SlipCounterService`
8. Show duplicate overlay (manual wizard) or success feedback

### ReceiptData Shape

```typescript
interface ReceiptData {
  stationName: string;
  stationAddress: string;
  invoiceNumber: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:mm
  paymentMethod: string;
  productType: string;
  fuelRate: string;
  volume: string;
  totalAmount: number;
  vehicleNumber: string;
  customerName: string;
  stationPhone?: string;
  logoDataUrl?: string | null;
  logo2DataUrl?: string | null;
  includeLogoInPrint?: boolean;
  useTwoLogos?: boolean;
}
```

---

## 11. Build & Deploy

### Requirements

- Node.js 18+
- Expo development build (not Expo Go)
- Physical Android device with Bluetooth for printer testing
- EAS account: `arslan_eas_5`

### Setup

```bash
npm install
npx expo prebuild
```

### Development

```bash
npm start              # Metro
npm run start:dev      # Dev client
npx expo run:android   # Run on device
npx expo run:ios
```

### Production Builds (EAS)

```bash
npm run build:apk          # Android production APK
npm run build:dev          # Development client
npm run build:ios          # iOS preview
npm run build:all          # Both platforms
```

Local APK build:

```bash
npm run build:dev:local
```

### EAS Configuration (`eas.json`)

| Profile | Purpose |
|---------|---------|
| `development` | Dev client, internal distribution, APK |
| `preview` | Internal distribution, APK |
| `production` | Auto-increment version, APK |
| `ios-simulator` | iOS simulator build |

---

## 12. Button Style Reference

### Pressable Pattern (Standard)

```typescript
<Pressable
  onPress={handleAction}
  disabled={loading}
  style={({ pressed }) => [
    styles.primaryBtn,
    pressed && !loading && styles.primaryBtnPressed,
    loading && styles.primaryBtnDisabled,
  ]}
>
  {loading ? (
    <View style={styles.loadingRow}>
      <ActivityIndicator size="small" color={Colors.text.primary} />
      <Text style={styles.primaryBtnText}>Saving...</Text>
    </View>
  ) : (
    <Text style={styles.primaryBtnText}>Save</Text>
  )}
</Pressable>
```

### Wizard Bottom Button Pattern

```typescript
<Pressable
  style={({ pressed }) => [
    styles.primaryBtn,
    styles.absoluteBottomBtn,
    pressed && canContinue && styles.primaryBtnPressed,
    !canContinue && styles.primaryBtnDisabled,
  ]}
>
```

Requires parent `stepKeyboard` to have `position: 'relative'` so absolute buttons anchor correctly.

### Buttons Object Variants (`constants/theme.ts`)

| Variant | Use case |
|---------|----------|
| `Buttons.primary` | Main CTAs |
| `Buttons.secondary` | Back, cancel, skip |
| `Buttons.accentOutline` | Print duplicate, outlined actions |
| `Buttons.icon` | Header icons, close ✕ |
| `Buttons.reprint` | Small print on receipt cards |
| `Buttons.destructive` | Delete/end session |
| `Buttons.loadingRow` | Spinner + label row |

---

## 13. Recent Changes

| Change | Details |
|--------|---------|
| **Button unification (`index.tsx`)** | All wizard, overlay, and modal buttons now use `Buttons.*` spreads via local StyleSheet aliases (`primaryBtn`, `secondaryBtn`, etc.) |
| **Product list fix** | `PRODUCTS` array at module level; row layout with dot + label + circle as direct `Pressable` children |
| **Admin login modal** | Login/Cancel buttons migrated to `primaryBtn` / `secondaryBtn` |
| **Wizard layout** | `stepKeyboard` set to `position: 'relative'` for correct absolute bottom button positioning |
| **EAS account migration** | Owner changed from `arslan_eas_4` → `arslan_eas_5`; new project ID `569a0308-70cc-45c8-902d-5fe9758e8445` |

---

## Quick Reference: File → Responsibility

| File | Responsibility |
|------|----------------|
| `app/_layout.tsx` | Providers, splash, profile redirect, stack navigator |
| `app/index.tsx` | Home dashboard, wizard, live feed, print flows |
| `app/settings.tsx` | Station profile, logos, EzPump config |
| `app/admin.tsx` | Invoices, prices, slip counter, portal |
| `app/printer-setup.tsx` | Printer init and test prints |
| `constants/theme.ts` | All design tokens and button variants |
| `stores/stationStore.ts` | Station profile state + persistence |
| `hooks/useFormState.ts` | Manual receipt form |
| `hooks/usePrinter.ts` | Printer connection and print API |
| `contexts/PrinterContext.tsx` | App-wide printer access |
| `src/services/EzPumpService.ts` | Live sales + rates from portal |
| `src/services/PrinterService.ts` | Print orchestration |
| `utils/generateReceipt.ts` | ESC/POS receipt bytes |
| `utils/validation.ts` | Form validation rules |
| `app.json` | Expo config, EAS owner + project ID |
| `eas.json` | EAS build profiles |

---

*Last updated: June 2026*
