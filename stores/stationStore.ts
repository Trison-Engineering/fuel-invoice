import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getItem, setItem, StorageKeys } from "../utils/storage";
import { RawLogoKeys, clearRawLogoStorage, syncRawLogoStorage } from "../src/utils/logoStorage";

export interface FuelPrices {
  petrol: string;
  diesel: string;
  hiOctane: string;
}

export interface StationProfile {
  stationName: string;
  stationAddress: string;
  stationPhone: string;
  stationPhone2: string;
  paymentMethod: string;
  fuelPrices: FuelPrices;
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
  setStationPhone2: (phone: string) => void;
  setPetrolPrice: (price: string) => void;
  setDieselPrice: (price: string) => void;
  setHiOctanePrice: (price: string) => void;
  getFuelPrice: (productType: string) => string;
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

const defaultFuelPrices: FuelPrices = {
  petrol: "",
  diesel: "",
  hiOctane: "",
};

const defaultProfile: StationProfile = {
  stationName: "",
  stationAddress: "",
  stationPhone: "",
  stationPhone2: "",
  paymentMethod: "Cash",
  fuelPrices: defaultFuelPrices,
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
  setStationPhone: (stationPhone) => set({ stationPhone: stationPhone.replace(/\D/g, "") }),
  setStationPhone2: (stationPhone2) => set({ stationPhone2: stationPhone2.replace(/\D/g, "") }),
  setPetrolPrice: (petrol) =>
    set((state) => ({ fuelPrices: { ...state.fuelPrices, petrol } })),
  setDieselPrice: (diesel) =>
    set((state) => ({ fuelPrices: { ...state.fuelPrices, diesel } })),
  setHiOctanePrice: (hiOctane) =>
    set((state) => ({ fuelPrices: { ...state.fuelPrices, hiOctane } })),
  getFuelPrice: (productType) => {
    const { fuelPrices } = get();
    switch (productType) {
      case "Diesel":
        return fuelPrices.diesel;
      case "Hi-Octane":
        return fuelPrices.hiOctane;
      default:
        return fuelPrices.petrol;
    }
  },
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
    const { stationName, stationAddress, fuelPrices } = get();
    const hasPrices =
      parseFloat(fuelPrices.petrol) > 0 &&
      parseFloat(fuelPrices.diesel) > 0 &&
      parseFloat(fuelPrices.hiOctane) > 0;
    return Boolean(stationName.trim() && stationAddress.trim() && hasPrices);
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
        stationPhone2: profile.stationPhone2 ?? "",
        fuelPrices: profile.fuelPrices ?? defaultFuelPrices,
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
      stationPhone2: state.stationPhone2,
      paymentMethod: "Cash",
      fuelPrices: state.fuelPrices,
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
