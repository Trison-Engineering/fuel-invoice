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
import { RECEIPT_LINE_WIDTH } from "../../constants/printerPaper";
import type { ReceiptData } from "../../utils/generateReceipt";
import {
  buildFuelReceiptBodyLines,
  getReceiptHeaderLines,
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
  const header = getReceiptHeaderLines(view);
  const bodyLines = buildFuelReceiptBodyLines(view);
  const receiptPaperWidth = Math.round(280 * (RECEIPT_LINE_WIDTH / 32));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>Receipt Preview</Text>
          <Text style={styles.previewSubtitle}>Review before printing</Text>
        </View>

        <View style={styles.scrollWrapper}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            bounces
          >
            <View
              style={[
                styles.receiptPaper,
                { maxWidth: receiptPaperWidth, alignSelf: "center", width: "100%" },
              ]}
            >
              {data.includeLogoInPrint && view.logoDataUrl ? (
                <Image
                  source={{ uri: view.logoDataUrl }}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              ) : null}

              {header.storeNameLines.map((line, index) => (
                <Text key={`store-${index}`} style={styles.storeName}>
                  {line}
                </Text>
              ))}
              {header.addressLines.map((line, index) => (
                <Text key={`addr-${index}`} style={styles.storeAddress}>
                  {line}
                </Text>
              ))}
              <Text style={styles.receiptTitle}>{header.title}</Text>

              {bodyLines.map((line, index) => {
                const isTotal = line.trimStart().startsWith("Total Amount");
                return (
                  <Text
                    key={`${index}-${line}`}
                    style={[styles.mono, isTotal && styles.totalText]}
                  >
                    {line || " "}
                  </Text>
                );
              })}
            </View>
          </ScrollView>
        </View>

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
      </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  scrollWrapper: {
    flex: 1,
    minHeight: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 8,
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
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 1,
  },
  storeAddress: {
    fontFamily: "monospace",
    fontSize: 10,
    textAlign: "center",
    marginBottom: 1,
  },
  receiptTitle: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 14,
    color: "#000",
  },
  totalText: {
    fontWeight: "bold",
    fontSize: 10,
  },
  buttonContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
