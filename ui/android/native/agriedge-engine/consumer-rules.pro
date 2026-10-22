-keep class ai.redesignededge.engine.AgriEdgeEnginePlugin { *; }
-keep class ai.onnxruntime.** { *; }
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}
