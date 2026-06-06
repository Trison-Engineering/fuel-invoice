import { create } from "zustand";
import { getItem, setItem, StorageKeys } from "../utils/storage";

export interface StationProfile {
  stationName: string;
  stationAddress: string;
  paymentMethod: string;
  logoDataUrl: string | null;
  includeLogoInPrint: boolean;
}

interface StationState extends StationProfile {
  isHydrated: boolean;
  setStationName: (name: string) => void;
  setStationAddress: (address: string) => void;
  setPaymentMethod: (method: string) => void;
  setLogoDataUrl: (url: string | null) => void;
  setIncludeLogoInPrint: (include: boolean) => void;
  isProfileComplete: () => boolean;
  hydrate: () => Promise<void>;
  saveProfile: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const defaultProfile: StationProfile = {
  stationName: "",
  stationAddress: "",
  paymentMethod: "Cash",
  logoDataUrl: null,
  includeLogoInPrint: false,
};

export const useStationStore = create<StationState>((set, get) => ({
  ...defaultProfile,
  isHydrated: false,

  setStationName: (stationName) => set({ stationName }),
  setStationAddress: (stationAddress) => set({ stationAddress }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setLogoDataUrl: (logoDataUrl) => set({ logoDataUrl }),
  setIncludeLogoInPrint: (includeLogoInPrint) => set({ includeLogoInPrint }),

  isProfileComplete: () => {
    const { stationName, stationAddress } = get();
    return Boolean(stationName.trim() && stationAddress.trim());
  },

  hydrate: async () => {
    const profile = await getItem<StationProfile>(StorageKeys.STATION_PROFILE);
    const includeLogo = await getItem<boolean>(StorageKeys.INCLUDE_LOGO_IN_PRINT);
    if (profile) {
      set({
        ...profile,
        paymentMethod: "Cash",
        includeLogoInPrint: includeLogo ?? profile.includeLogoInPrint ?? false,
        isHydrated: true,
      });
    } else {
      set({ isHydrated: true });
    }
  },

  saveProfile: async () => {
    const state = get();
    const profile: StationProfile = {
      stationName: state.stationName,
      stationAddress: state.stationAddress,
      paymentMethod: "Cash",
      logoDataUrl: state.logoDataUrl,
      includeLogoInPrint: state.includeLogoInPrint,
    };
    await setItem(StorageKeys.STATION_PROFILE, profile);
    await setItem(StorageKeys.INCLUDE_LOGO_IN_PRINT, state.includeLogoInPrint);
  },

  clearAll: async () => {
    const { clearAll: clearStorage } = await import("../utils/storage");
    await clearStorage();
    set({ ...defaultProfile, isHydrated: true });
  },
}));
