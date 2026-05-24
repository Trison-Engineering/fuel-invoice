import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [invoiceNumber, setInvoiceNumber] = useState(generateInvoiceNumber);
  const [productType, setProductType] = useState("Petrol");
  const [fuelRate, setFuelRate] = useState("");
  const [volume, setVolume] = useState("");
  const [date, setDate] = useState(getTodayISO);
  const [time, setTime] = useState(getCurrentTime24);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [nozzleNo, setNozzleNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  const fieldRefs = useRef<Record<string, unknown>>({});
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setInvoiceNumber(generateInvoiceNumber());
    setDate(getTodayISO());
    setTime(getCurrentTime24());
  }, []);

  const totalAmount = useMemo(() => {
    const rate = parseFloat(fuelRate);
    const vol = parseFloat(volume);
    if (isNaN(rate) || isNaN(vol)) return 0;
    return rate * vol;
  }, [fuelRate, volume]);

  const totalDisplay = formatCurrency(totalAmount);

  const formData: FormData = useMemo(
    () => ({
      stationName: station.stationName,
      stationAddress: station.stationAddress,
      paymentMethod: station.paymentMethod,
      invoiceNumber,
      productType,
      fuelRate,
      volume,
      date,
      time,
      vehicleNumber,
      nozzleNo,
      customerName,
    }),
    [
      station.stationName,
      station.stationAddress,
      station.paymentMethod,
      invoiceNumber,
      productType,
      fuelRate,
      volume,
      date,
      time,
      vehicleNumber,
      nozzleNo,
      customerName,
    ]
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

  const validate = useCallback((): boolean => {
    const newErrors = validateForm(formData);
    setErrors(newErrors);
    const firstField = getFirstErrorField(newErrors);
    if (firstField && scrollRef.current) {
      const ref = fieldRefs.current[firstField] as { measureLayout?: Function } | undefined;
      if (ref && typeof ref === "object" && "y" in (ref as object)) {
        scrollRef.current.scrollTo({ y: (ref as { y: number }).y, animated: true });
      }
    }
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const getReceiptData = useCallback((): ReceiptData => {
    return {
      stationName: station.stationName,
      stationAddress: station.stationAddress,
      invoiceNumber,
      date,
      time,
      paymentMethod: station.paymentMethod,
      productType,
      fuelRate,
      volume,
      totalAmount,
      vehicleNumber,
      nozzleNo,
      customerName,
      logoDataUrl: station.logoDataUrl,
      includeLogoInPrint: station.includeLogoInPrint,
    };
  }, [
    station,
    invoiceNumber,
    date,
    time,
    productType,
    fuelRate,
    volume,
    totalAmount,
    vehicleNumber,
    nozzleNo,
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
    invoiceNumber,
    setInvoiceNumber,
    productType,
    setProductType,
    fuelRate,
    updateFuelRate,
    volume,
    updateVolume,
    date,
    setDate,
    time,
    setTime,
    vehicleNumber,
    updateVehicleNumber,
    nozzleNo,
    setNozzleNo,
    customerName,
    setCustomerName,
    clearFieldError,
    validate: runValidation,
    getReceiptData,
    station,
  };
}
