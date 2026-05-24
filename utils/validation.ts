export interface FormData {
  stationName: string;
  stationAddress: string;
  paymentMethod: string;
  invoiceNumber: string;
  productType: string;
  fuelRate: string;
  volume: string;
  date: string;
  time: string;
  vehicleNumber: string;
  nozzleNo: string;
  customerName: string;
}

export type FormErrors = Partial<Record<keyof FormData, string>>;

const ERROR_PRIORITY: (keyof FormData)[] = [
  "stationName",
  "stationAddress",
  "fuelRate",
  "volume",
  "vehicleNumber",
];

export function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};

  if (!data.stationName.trim()) {
    errors.stationName = "Station name is required";
  }

  if (!data.stationAddress.trim()) {
    errors.stationAddress = "Station address is required";
  }

  const fuelRate = parseFloat(data.fuelRate);
  if (!data.fuelRate.trim() || isNaN(fuelRate) || fuelRate <= 0) {
    errors.fuelRate = "Fuel rate must be greater than 0";
  }

  const volume = parseFloat(data.volume);
  if (!data.volume.trim() || isNaN(volume) || volume <= 0) {
    errors.volume = "Volume must be greater than 0";
  }

  if (!data.vehicleNumber.trim()) {
    errors.vehicleNumber = "Vehicle number is required";
  }

  return errors;
}

export function getFirstErrorField(errors: FormErrors): keyof FormData | null {
  for (const field of ERROR_PRIORITY) {
    if (errors[field]) return field;
  }
  return null;
}

export function isValidDecimal(value: string): boolean {
  if (value === "" || value === ".") return true;
  return /^\d*\.?\d*$/.test(value);
}
