import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReceiptData } from "../../utils/generateReceipt";
import {
  centerText,
  mapFuelReceiptToPrintView,
  splitAddressLines,
  wrapWords,
} from "../../utils/receiptFormat";
import { formatCurrency, formatVolume } from "../utils/printerUtils";

interface ReceiptPreviewScreenProps {
  visible: boolean;
  data: ReceiptData | null;
  isPrinting?: boolean;
  onPrint: () => void;
  onCancel: () => void;
}

const RECEIPT_WIDTH = 220;
const PREVIEW_LINE_WIDTH = 32;
const LOGO_PREVIEW_WIDTH = Math.round(RECEIPT_WIDTH * 0.45);

function ReceiptRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowBold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowBold]}>{value}</Text>
    </View>
  );
}

function ReceiptDivider() {
  return <View style={styles.divider} />;
}

const getStoreFontSize = (name: string): number => {
  if (name.length <= 16) return 12;
  if (name.length <= 22) return 11;
  if (name.length <= 28) return 10;
  return 9;
};

export function ReceiptPreviewScreen({
  visible,
  data,
  isPrinting = false,
  onPrint,
  onCancel,
}: ReceiptPreviewScreenProps) {
  if (!data) return null;

  const view = mapFuelReceiptToPrintView(data);
  const storeName = view.storeName.toUpperCase();
  const storeNameLines = wrapWords(storeName, PREVIEW_LINE_WIDTH).map((line) =>
    centerText(line, PREVIEW_LINE_WIDTH)
  );
  const addressLines = splitAddressLines(view.address, PREVIEW_LINE_WIDTH);
  const dateTime = `${view.date}  ${view.time}`;
  const showLogo = Boolean(data.includeLogoInPrint && view.logoDataUrl);
  const logoUri = showLogo ? view.logoDataUrl : null;
  const phone = data.stationPhone?.trim();
  const contactFooter = phone
    ? wrapWords(`Thank you for visiting us! Contact Us : ${phone}`, PREVIEW_LINE_WIDTH).map(
        (line) => centerText(line, PREVIEW_LINE_WIDTH)
      )
    : [centerText("Thank you for visiting us!", PREVIEW_LINE_WIDTH)];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.screenContainer} edges={["top", "bottom"]}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Receipt Preview</Text>
          <Text style={styles.headerSubtitle}>Review before printing</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.receiptPaper}>
            {logoUri ? (
              <View style={styles.logoContainer}>
                <Image source={{ uri: logoUri }} style={styles.logoImage} />
              </View>
            ) : null}

            <Text style={styles.welcomeText}>
              {centerText("Welcome to", PREVIEW_LINE_WIDTH)}
            </Text>

            {storeNameLines.map((line, i) => (
              <Text
                key={`store-${i}`}
                style={[styles.storeName, { fontSize: getStoreFontSize(storeName) }]}
              >
                {line}
              </Text>
            ))}

            {addressLines.map((line, i) => (
              <Text key={`addr-${i}`} style={styles.storeAddress}>
                {line}
              </Text>
            ))}

            <Text style={styles.receiptTitle}>FUEL RECEIPT</Text>

            <ReceiptDivider />

            <ReceiptRow label="DATE:" value={dateTime} />

            <ReceiptDivider />

            <ReceiptRow label="product:" value={view.product.toUpperCase()} />
            <ReceiptRow
              label="volume:"
              value={`${formatVolume(data.volume)} LTR`}
            />
            <ReceiptRow
              label="rateLtr:"
              value={`Rs. ${formatCurrency(data.fuelRate)}`}
            />

            <ReceiptDivider />

            <ReceiptRow
              label="totalAmount:"
              value={`Rs. ${formatCurrency(data.totalAmount)}`}
              bold
            />

            <ReceiptDivider />

            {view.vehicleNo ? (
              <>
                <ReceiptRow
                  label="vehicleNo:"
                  value={view.vehicleNo.toUpperCase()}
                />
                <ReceiptDivider />
              </>
            ) : null}

            <Text style={styles.footerText}>
              {centerText("POWERED BY TRISON", PREVIEW_LINE_WIDTH)}
            </Text>

            {contactFooter.map((line, i) => (
              <Text key={`contact-${i}`} style={styles.footerText}>
                {line}
              </Text>
            ))}

            <View style={styles.bottomSpacer} />
          </View>

          <View style={styles.receiptShadow} />
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isPrinting}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.printButton, isPrinting && styles.printButtonDisabled]}
            onPress={onPrint}
            disabled={isPrinting}
          >
            {isPrinting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.printText}>🖨 Print Receipt</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: "#e8e8e8",
  },
  headerBar: {
    backgroundColor: "#1a3a8f",
    padding: 16,
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  headerSubtitle: {
    color: "#aac4ff",
    fontSize: 12,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  receiptPaper: {
    width: RECEIPT_WIDTH,
    backgroundColor: "white",
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    marginBottom: 8,
    alignItems: "stretch",
  },
  logoContainer: {
    alignItems: "center",
  },
  logoImage: {
    width: LOGO_PREVIEW_WIDTH,
    maxWidth: "100%",
    resizeMode: "contain",
  },
  welcomeText: {
    fontFamily: "Courier New",
    fontSize: 9,
    textAlign: "center",
    color: "#333",
    marginBottom: 2,
  },
  storeName: {
    fontFamily: "Courier New",
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "center",
    color: "#000",
    marginBottom: 1,
    letterSpacing: 0.5,
  },
  storeAddress: {
    fontFamily: "Courier New",
    fontSize: 9,
    textAlign: "center",
    color: "#333",
    marginBottom: 1,
  },
  receiptTitle: {
    fontFamily: "Courier New",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    color: "#000",
    marginBottom: 4,
    letterSpacing: 1,
  },
  divider: {
    width: "100%",
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#000",
    marginVertical: 3,
  },
  row: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginVertical: 1,
  },
  rowLabel: {
    fontFamily: "Courier New",
    fontSize: 9,
    color: "#000",
    flexShrink: 1,
  },
  rowValue: {
    fontFamily: "Courier New",
    fontSize: 9,
    color: "#000",
    textAlign: "right",
    flexShrink: 0,
    marginLeft: 4,
  },
  rowBold: {
    fontSize: 10,
    fontWeight: "bold",
  },
  footerText: {
    fontFamily: "Courier New",
    fontSize: 9,
    textAlign: "center",
    color: "#333",
    lineHeight: 14,
  },
  bottomSpacer: {
    height: 8,
  },
  receiptShadow: {
    width: RECEIPT_WIDTH - 20,
    height: 6,
    backgroundColor: "#ccc",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  buttonContainer: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    backgroundColor: "white",
  },
  cancelText: {
    fontSize: 15,
    color: "#666",
  },
  printButton: {
    flex: 2,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#1a3a8f",
    alignItems: "center",
    justifyContent: "center",
  },
  printButtonDisabled: {
    opacity: 0.7,
  },
  printText: {
    fontSize: 15,
    color: "white",
    fontWeight: "bold",
  },
});
