# Fuel Receipt App

Cross-platform mobile app (Android & iOS) for generating fuel pump receipts with Bluetooth thermal printer support and PDF export. Built with **React Native**, **Expo**, and **expo-router**. Works fully offline.

## Features

- Receipt form with station details, payment, fuel data, and vehicle info
- Auto-calculated total, invoice number, date/time defaults
- Bluetooth thermal printer discovery, pairing, and ESC/POS printing (58mm)
- Save/share receipt as 58mm PDF
- Live receipt preview
- Persisted station profile (AsyncStorage + Zustand)

## Requirements

- Node.js 18+
- Expo development build (not Expo Go — native BLE modules required)
- Physical device with Bluetooth for printer testing

## Setup

```bash
npm install
npx expo prebuild
```

## Run

```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

## Production builds

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

## Project structure

```
app/           Screens (form, printer setup, settings)
components/    UI components
hooks/         Form state & printer logic
stores/        Zustand station profile
utils/         ESC/POS, PDF, validation, formatters
constants/     Theme tokens
```

## Notes

- Thermal printing uses `react-native-ble-plx` with raw ESC/POS bytes.
- Logo printing on thermal paper is optional (toggle, default OFF). PDF always includes the logo when set.
- Target printers: 58mm ESC/POS (POS58, SpeedX 400, generic Bluetooth thermal).
