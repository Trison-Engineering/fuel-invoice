export function logPrinterAttempt(message: string, detail?: unknown): void {
  const stamp = new Date().toISOString();
  if (detail !== undefined) {
    console.log(`[Printer ${stamp}] ${message}`, detail);
  } else {
    console.log(`[Printer ${stamp}] ${message}`);
  }
}
