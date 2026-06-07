package woyou.aidlservice.jiuiv5;

import android.graphics.Bitmap;
import woyou.aidlservice.jiuiv5.ICallback;

interface IWoyouService {
  void printerInit();
  int updatePrinterState();
  void sendRAWData(in byte[] data, ICallback callback);
  void setPrinterStyle(int wtmKey, String wtmVal);
  void setAlignment(int alignment, ICallback callback);
  void setFontName(String typeface, ICallback callback);
  void setFontSize(float fontSize, ICallback callback);
  void printText(String text, ICallback callback);
  void printTextWithFont(String text, String typeface, float fontSize, ICallback callback);
  void printColumnsText(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, ICallback callback);
  void printBitmap(in Bitmap bitmap, ICallback callback);
  void printBarCode(String data, int symbology, int height, int width, int textposition, ICallback callback);
  void printQRCode(String data, int modulesize, int errorlevel, ICallback callback);
  void lineWrap(int n, ICallback callback);
  void cutPaper(ICallback callback);
  void enterPrinterBuffer(boolean clean);
  void exitPrinterBuffer(boolean commit);
  void exitPrinterBufferWithCallback(boolean commit, ICallback callback);
  void commitPrinterBuffer();
}
