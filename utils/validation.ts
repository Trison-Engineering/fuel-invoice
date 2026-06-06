export interface FormData {
  fuelRate: string;
  volume: string;
  vehicleNumber: string;
}

export type FormErrors = Partial<Record<keyof FormData, string>>;

const ERROR_PRIORITY: (keyof FormData)[] = ["fuelRate", "volume"];

export function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};

  const fuelRate = parseFloat(data.fuelRate);
  if (!data.fuelRate.trim() || isNaN(fuelRate) || fuelRate <= 0) {
    errors.fuelRate = "Fuel rate must be greater than 0";
  }

  const volume = parseFloat(data.volume);
  if (!data.volume.trim() || isNaN(volume) || volume <= 0) {
    errors.volume = "Volume must be greater than 0";
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
