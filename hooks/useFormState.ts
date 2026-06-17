import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import {
  generateInvoiceNumber,
  getCurrentTime24,
  getTodayISO,
  formatCurrency,
} from "../utils/formatters";
import {
  FormData,
  FormErrors,
  getFirstErrorField,
  isValidDecimal,
  validateForm,
} from "../utils/validation";
import { useStationStore } from "../stores/stationStore";
import { ReceiptData } from "../utils/generateReceipt";

export function useFormState() {
  const station = useStationStore();

  const [productType, setProductType] = useState("Petrol");
  const [fuelRate, setFuelRate] = useState("");
  const [volume, setVolume] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [lubricantName, setLubricantName] = useState("");
  const [lubricantPrice, setLubricantPrice] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  const fieldRefs = useRef<Record<string, unknown>>({});
  const scrollRef = useRef<ScrollView>(null);

  const totalAmount = useMemo(() => {
    if (productType === "Lubricants") {
      const price = parseFloat(lubricantPrice);
      return isNaN(price) ? 0 : price;
    }
    if (productType === "Car Service") return 0;
    const rate = parseFloat(fuelRate);
    const vol = parseFloat(volume);
    if (isNaN(rate) || isNaN(vol)) return 0;
    return rate * vol;
  }, [productType, fuelRate, volume, lubricantPrice]);

  const totalDisplay = formatCurrency(totalAmount);

  const formData: FormData = useMemo(
    () => ({
      fuelRate,
      volume,
      vehicleNumber,
    }),
    [fuelRate, volume, vehicleNumber]
  );

  const clearFieldError = useCallback((field: keyof FormData) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const updateFuelRate = useCallback(
    (value: string) => {
      if (isValidDecimal(value)) {
        setFuelRate(value);
        clearFieldError("fuelRate");
      }
    },
    [clearFieldError]
  );

  const updateVolume = useCallback(
    (value: string) => {
      if (isValidDecimal(value)) {
        setVolume(value);
        clearFieldError("volume");
      }
    },
    [clearFieldError]
  );

  const updateVehicleNumber = useCallback(
    (value: string) => {
      setVehicleNumber(value.toUpperCase());
      clearFieldError("vehicleNumber");
    },
    [clearFieldError]
  );

  const updateLubricantName = useCallback((value: string) => {
    setLubricantName(value);
  }, []);

  const updateLubricantPrice = useCallback(
    (value: string) => {
      if (isValidDecimal(value)) {
        setLubricantPrice(value);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setProductType("Petrol");
    setFuelRate("");
    setVolume("");
    setVehicleNumber("");
    setLubricantName("");
    setLubricantPrice("");
    setErrors({});
  }, []);

  const getReceiptData = useCallback((): ReceiptData => {
    const isLubricants = productType === "Lubricants";
    const isCarService = productType === "Car Service";

    return {
      stationName: station.stationName,
      stationAddress: station.stationAddress,
      invoiceNumber: generateInvoiceNumber(),
      date: getTodayISO(),
      time: getCurrentTime24(),
      paymentMethod: "Cash",
      productType,
      fuelRate: isLubricants ? lubricantPrice : isCarService ? "" : fuelRate,
      volume: isLubricants || isCarService ? "" : volume,
      totalAmount,
      vehicleNumber,
      customerName: "",
      lubricantName: isLubricants ? lubricantName : undefined,
      stationPhone: station.stationPhone,
      logoDataUrl: station.logoDataUrl,
      logo2DataUrl: station.logo2DataUrl,
      includeLogoInPrint: station.includeLogoInPrint,
      useTwoLogos: station.useTwoLogos,
    };
  }, [
    station,
    productType,
    fuelRate,
    volume,
    totalAmount,
    vehicleNumber,
    lubricantName,
    lubricantPrice,
  ]);

  const registerFieldRef = useCallback((field: string, y: number) => {
    fieldRefs.current[field] = { y };
  }, []);

  const scrollToField = useCallback((field: keyof FormData) => {
    const ref = fieldRefs.current[field] as { y?: number } | undefined;
    if (ref?.y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: ref.y, animated: true });
    }
  }, []);

  const runValidation = useCallback((): boolean => {
    if (productType === "Car Service") {
      setErrors({});
      return true;
    }

    if (productType === "Lubricants") {
      const lubricantErrors: FormErrors = {};
      if (!lubricantName.trim()) {
        lubricantErrors.fuelRate = "Lubricant name is required";
      }
      const price = parseFloat(lubricantPrice);
      if (!lubricantPrice.trim() || isNaN(price) || price <= 0) {
        lubricantErrors.volume = "Lubricant price must be greater than 0";
      }
      setErrors(lubricantErrors);
      return Object.keys(lubricantErrors).length === 0;
    }

    const newErrors = validateForm(formData);
    setErrors(newErrors);
    const firstField = getFirstErrorField(newErrors);
    if (firstField) {
      scrollToField(firstField);
    }
    return Object.keys(newErrors).length === 0;
  }, [productType, lubricantName, lubricantPrice, formData, scrollToField]);

  return {
    formData,
    errors,
    totalAmount,
    totalDisplay,
    scrollRef,
    registerFieldRef,
    productType,
    setProductType,
    fuelRate,
    updateFuelRate,
    volume,
    updateVolume,
    vehicleNumber,
    updateVehicleNumber,
    lubricantName,
    updateLubricantName,
    lubricantPrice,
    updateLubricantPrice,
    reset,
    clearFieldError,
    validate: runValidation,
    getReceiptData,
    station,
  };
}
