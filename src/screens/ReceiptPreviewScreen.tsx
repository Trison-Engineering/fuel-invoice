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
import { RECEIPT_LINE_WIDTH } from "../../constants/printerPaper";
import type { ReceiptData } from "../../utils/generateReceipt";
import {
  buildFuelReceiptBodyLines,
  centerText,
  mapFuelReceiptToPrintView,
} from "../../utils/receiptFormat";

interface ReceiptPreviewScreenProps {
  visible: boolean;
  data: ReceiptData | null;
  isPrinting?: boolean;
  onPrint: () => void;
  onCancel: () => void;
}

export function ReceiptPreviewScreen({
  visible,
  data,
  isPrinting = false,
  onPrint,
  onCancel,
}: ReceiptPreviewScreenProps) {
  if (!data) return null;

  const view = mapFuelReceiptToPrintView(data);
  const bodyLines = buildFuelReceiptBodyLines(view);
  const receiptPaperWidth = Math.round(280 * (RECEIPT_LINE_WIDTH / 32));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>Receipt Preview</Text>
          <Text style={styles.previewSubtitle}>Review before printing</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={[styles.receiptPaper, { maxWidth: receiptPaperWidth, alignSelf: "center", width: "100%" }]}>
            {data.includeLogoInPrint && view.logoDataUrl ? (
              <Image
                source={{ uri: view.logoDataUrl }}
                style={styles.logoImage}
                resizeMode="contain"
              />
            ) : null}

            <Text style={styles.storeName}>{view.storeName}</Text>
            {view.address ? <Text style={styles.storeAddress}>{view.address}</Text> : null}
            <Text style={styles.receiptTitle}>FUEL RECEIPT</Text>

            {bodyLines.map((line, index) => {
              const isTotal = line.startsWith("TOTAL AMOUNT:");
              return (
                <Text
                  key={`${index}-${line}`}
                  style={[styles.mono, isTotal && styles.totalText]}
                >
                  {line || " "}
                </Text>
              );
            })}

            <View style={styles.bottomSpace} />
          </View>
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
              <Text style={styles.printText}>Print Receipt</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
  previewHeader: {
    backgroundColor: "#1D4ED8",
    padding: 16,
    paddingTop: 48,
    alignItems: "center",
  },
  previewTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  previewSubtitle: {
    color: "#dbeafe",
    fontSize: 13,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  receiptPaper: {
    backgroundColor: "white",
    borderRadius: 4,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  logoImage: {
    width: 100,
    height: 100,
    alignSelf: "center",
    marginBottom: 8,
  },
  storeName: {
    fontFamily: "monospace",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  storeAddress: {
    fontFamily: "monospace",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 2,
  },
  receiptTitle: {
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 18,
    color: "#000",
  },
  totalText: {
    fontWeight: "bold",
    fontSize: 12,
  },
  bottomSpace: {
    height: 20,
  },
  buttonContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    color: "#666",
  },
  printButton: {
    flex: 2,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
  },
  printButtonDisabled: {
    opacity: 0.7,
  },
  printText: {
    fontSize: 16,
    color: "white",
    fontWeight: "bold",
  },
});
