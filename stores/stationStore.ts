import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getItem, setItem, StorageKeys } from "../utils/storage";
import { RawLogoKeys, clearRawLogoStorage, syncRawLogoStorage } from "../src/utils/logoStorage";

export interface StationProfile {
  stationName: string;
  stationAddress: string;
  stationPhone: string;
  paymentMethod: string;
  logoDataUrl: string | null;
  logo2DataUrl: string | null;
  includeLogoInPrint: boolean;
  useTwoLogos: boolean;
}

interface StationState extends StationProfile {
  isHydrated: boolean;
  setStationName: (name: string) => void;
  setStationAddress: (address: string) => void;
  setStationPhone: (phone: string) => void;
  setPaymentMethod: (method: string) => void;
  setLogoDataUrl: (url: string | null) => void;
  setLogo2DataUrl: (url: string | null) => void;
  setIncludeLogoInPrint: (include: boolean) => void;
  setUseTwoLogos: (use: boolean) => void;
  isProfileComplete: () => boolean;
  hydrate: () => Promise<void>;
  saveProfile: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const defaultProfile: StationProfile = {
  stationName: "",
  stationAddress: "",
  stationPhone: "",
  paymentMethod: "Cash",
  logoDataUrl: null,
  logo2DataUrl: null,
  includeLogoInPrint: false,
  useTwoLogos: false,
};

export const useStationStore = create<StationState>((set, get) => ({
  ...defaultProfile,
  isHydrated: false,

  setStationName: (stationName) => set({ stationName }),
  setStationAddress: (stationAddress) => set({ stationAddress }),
  setStationPhone: (stationPhone) => set({ stationPhone }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setLogoDataUrl: (logoDataUrl) => set({ logoDataUrl }),
  setLogo2DataUrl: (logo2DataUrl) => set({ logo2DataUrl }),
  setIncludeLogoInPrint: (includeLogoInPrint) =>
    set({
      includeLogoInPrint,
      useTwoLogos: includeLogoInPrint ? get().useTwoLogos : false,
    }),
  setUseTwoLogos: (useTwoLogos) => {
    set({ useTwoLogos });
    AsyncStorage.setItem(RawLogoKeys.USE_TWO_LOGOS, useTwoLogos ? "true" : "false").catch(
      () => undefined
    );
  },

  isProfileComplete: () => {
    const { stationName, stationAddress } = get();
    return Boolean(stationName.trim() && stationAddress.trim());
  },

  hydrate: async () => {
    const profile = await getItem<StationProfile>(StorageKeys.STATION_PROFILE);
    const includeLogo = await getItem<boolean>(StorageKeys.INCLUDE_LOGO_IN_PRINT);
    const useTwoLogosStored = await getItem<boolean>(StorageKeys.USE_TWO_LOGOS);
    const useTwoLogosRaw = await AsyncStorage.getItem(RawLogoKeys.USE_TWO_LOGOS);

    if (profile) {
      const useTwoLogos =
        useTwoLogosStored ??
        (useTwoLogosRaw === "true" ? true : useTwoLogosRaw === "false" ? false : profile.useTwoLogos ?? false);

      set({
        ...profile,
        stationPhone: profile.stationPhone ?? "",
        logo2DataUrl: profile.logo2DataUrl ?? null,
        paymentMethod: "Cash",
        includeLogoInPrint: includeLogo ?? profile.includeLogoInPrint ?? false,
        useTwoLogos: (includeLogo ?? profile.includeLogoInPrint) ? useTwoLogos : false,
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
      stationPhone: state.stationPhone,
      paymentMethod: "Cash",
      logoDataUrl: state.logoDataUrl,
      logo2DataUrl: state.logo2DataUrl,
      includeLogoInPrint: state.includeLogoInPrint,
      useTwoLogos: state.includeLogoInPrint ? state.useTwoLogos : false,
    };
    await setItem(StorageKeys.STATION_PROFILE, profile);
    await setItem(StorageKeys.INCLUDE_LOGO_IN_PRINT, profile.includeLogoInPrint);
    await setItem(StorageKeys.USE_TWO_LOGOS, profile.useTwoLogos);
    await syncRawLogoStorage({
      logoDataUrl: profile.logoDataUrl,
      logo2DataUrl: profile.logo2DataUrl,
      useTwoLogos: profile.useTwoLogos,
    });
  },

  clearAll: async () => {
    const { clearAll: clearStorage } = await import("../utils/storage");
    await clearStorage();
    await clearRawLogoStorage();
    set({ ...defaultProfile, isHydrated: true });
  },
}));
