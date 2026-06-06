export const safeStr = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
};

export const formatCurrency = (value: unknown): string => {
  const num = parseFloat(safeStr(value));
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
};

export const formatVolume = (value: unknown): string => {
  const num = parseFloat(safeStr(value));
  if (isNaN(num)) return "0";
  return Number.isInteger(num) ? num.toString() : num.toFixed(2);
};
