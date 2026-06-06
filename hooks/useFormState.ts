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
  const [customerName, setCustomerName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  const fieldRefs = useRef<Record<string, unknown>>({});
  const scrollRef = useRef<ScrollView>(null);

  const totalAmount = useMemo(() => {
    const rate = parseFloat(fuelRate);
    const vol = parseFloat(volume);
    if (isNaN(rate) || isNaN(vol)) return 0;
    return rate * vol;
  }, [fuelRate, volume]);

  const totalDisplay = formatCurrency(totalAmount);

  const formData: FormData = useMemo(
    () => ({
      fuelRate,
      volume,
      vehicleNumber,
      customerName,
    }),
    [fuelRate, volume, vehicleNumber, customerName]
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

  const getReceiptData = useCallback((): ReceiptData => {
    return {
      stationName: station.stationName,
      stationAddress: station.stationAddress,
      invoiceNumber: generateInvoiceNumber(),
      date: getTodayISO(),
      time: getCurrentTime24(),
      paymentMethod: "Cash",
      productType,
      fuelRate,
      volume,
      totalAmount,
      vehicleNumber,
      customerName,
      logoDataUrl: station.logoDataUrl,
      includeLogoInPrint: station.includeLogoInPrint,
    };
  }, [
    station,
    productType,
    fuelRate,
    volume,
    totalAmount,
    vehicleNumber,
    customerName,
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
    const newErrors = validateForm(formData);
    setErrors(newErrors);
    const firstField = getFirstErrorField(newErrors);
    if (firstField) {
      scrollToField(firstField);
    }
    return Object.keys(newErrors).length === 0;
  }, [formData, scrollToField]);

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
    customerName,
    setCustomerName,
    clearFieldError,
    validate: runValidation,
    getReceiptData,
    station,
  };
}
