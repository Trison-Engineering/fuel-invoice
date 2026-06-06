package woyou.stu.sdkservice.clientinterface;

interface ICallback {
  void onRunResult(boolean isSuccess);
  void onReturnString(String result);
  void onRaiseException(int code, String msg);
  void onPrintResult(int code, String msg);
}
