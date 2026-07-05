const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

export function formatTime(time24: string): string {
  const [hoursStr, minutesStr] = time24.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = minutesStr ?? "00";
  if (isNaN(hours)) return time24;

  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${minutes.padStart(2, "0")} ${period}`;
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0.00";
  return `Rs. ${num.toFixed(2)}`;
}

export function formatCurrencyValue(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
}

export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCurrentTime24(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function generateInvoiceNumber(): string {
  return String(Math.floor(Math.random() * 9000) + 1000);
}

export function padLabelValue(label: string, value: string, width = 32): string {
  const labelPart = label.padEnd(16);
  const valuePart = value.padStart(16);
  return (labelPart + valuePart).slice(0, width);
}

export function centerText(text: string, width = 32): string {
  if (text.length >= width) return text.slice(0, width);
  const padding = Math.floor((width - text.length) / 2);
  return " ".repeat(padding) + text;
}

export function wrapText(text: string, width = 32): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 <= width) {
      current = current ? `${current} ${word}` : word;
    } else {
      if (current) lines.push(current);
      if (word.length > width) {
        for (let i = 0; i < word.length; i += width) {
          lines.push(word.slice(i, i + width));
        }
        current = "";
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export function uppercasePayment(method: string): string {
  return method.toUpperCase();
}

export function formatContactNumbers(phone1?: string, phone2?: string): string | null {
  const p1 = phone1?.trim();
  const p2 = phone2?.trim();
  if (p1 && p2) return `Contact Us : ${p1} | ${p2}`;
  if (p1) return `Contact Us : ${p1}`;
  if (p2) return `Contact Us : ${p2}`;
  return null;
}
