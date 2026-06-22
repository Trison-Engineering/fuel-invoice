export const Colors = {
  bg: {
    primary: "#0A0F1E",
    secondary: "#0F1629",
    card: "#141B2D",
    elevated: "#1A2338",
    input: "#1E2A40",
    hover: "#243048",
  },
  border: {
    subtle: "rgba(255,255,255,0.05)",
    default: "rgba(255,255,255,0.08)",
    strong: "rgba(255,255,255,0.14)",
    accent: "rgba(59,130,246,0.4)",
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#8892A4",
    tertiary: "#4E5A6E",
    accent: "#3B82F6",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444",
    purple: "#A855F7",
  },
  product: {
    petrol: "#22C55E",
    diesel: "#3B82F6",
    hiOctane: "#A855F7",
    lubricants: "#F59E0B",
    carService: "#EF4444",
  },
  accent: "#3B82F6",
  accentDark: "#1D4ED8",
  accentAlpha: "rgba(59,130,246,0.12)",
};

export const Typography = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 38,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  black: "900" as const,
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1.5,
  widest: 2.5,
};

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  elevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  glow: {
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};

/** @deprecated Use Colors — kept for legacy components */
export const colors = {
  primary: Colors.accent,
  primaryLight: Colors.accentAlpha,
  background: Colors.bg.primary,
  white: Colors.text.primary,
  black: Colors.text.primary,
  muted: Colors.text.tertiary,
  border: Colors.border.default,
  success: Colors.text.success,
  error: Colors.text.danger,
  disabled: Colors.bg.input,
};

/** @deprecated Use Spacing — kept for legacy components */
export const spacing = Spacing;
