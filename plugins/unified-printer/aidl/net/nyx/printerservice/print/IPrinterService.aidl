package net.nyx.printerservice.print;

import android.graphics.Bitmap;
import net.nyx.printerservice.print.PrintTextFormat;

interface IPrinterService {
    String getServiceVersion();
    int getPrinterVersion(out String[] ver);
    int getPrinterModel(out String[] model);
    int getPrinterStatus();
    int paperOut(int px);
    int paperBack(int px);
    int printText(String text, in PrintTextFormat textFormat);
    int printText2(String text, in PrintTextFormat textFormat, int textWidth, int align);
    int printBarcode(String content, int width, int height, int textPosition, int align);
    int printQrCode(String content, int width, int height, int align);
    int printBitmap(in Bitmap bitmap, int type, int align);
    int labelLocate(int labelHeight, int labelGap);
    int labelPrintEnd();
    int labelLocateAuto();
    int labelDetectAuto();
    boolean hasLabelLearning();
    int clearLabelLearning();
    int printRasterData(in byte[] bytes);
    int printEscposData(in byte[] cmd);
    int printTableText(in String[] texts, in int[] weights, in PrintTextFormat[] formats);
    int printEndAutoOut();
    int showLcdBitmap(in Bitmap bitmap);
    int configLcd(int flag);
    int openCashBox();
    int triggerQscScan();
}
