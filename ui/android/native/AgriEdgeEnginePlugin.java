package ai.redesignededge.app;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.pytorch.executorch.extension.llm.LlmCallback;
import org.pytorch.executorch.extension.llm.LlmModule;

@CapacitorPlugin(name = "AgriEdgeEngine")
public class AgriEdgeEnginePlugin extends Plugin {

  private static final String TAG = "AgriEdge";
  private static final String MODELS = "models";
  private static final String LLM_FILE = "llama32_1b_int4.pte";
  private static final String TOKENIZER_FILE = "tokenizer.model";
  private static final String ROUTER = "router";
  private static final float TEMPERATURE = 0.2f;
  private static final int MAX_SEQ_LEN = 2048;
  private static final boolean EXPLICIT_BOS = true;

  private final ExecutorService visionWork = Executors.newSingleThreadExecutor();
  private final ExecutorService llmWork = Executors.newSingleThreadExecutor();
  private final Object visionLock = new Object();
  private final Object llmLock = new Object();

  private OrtEnvironment env;
  private List<Vision> visions;
  private LlmModule llm;
  private TextToSpeech tts;
  private volatile boolean ttsReady = false;

  private static final class Vision {
    final String name;
    final OrtSession session;
    final String inputName;
    final String[] labels;
    final int side;

    Vision(String name, OrtSession session, String inputName, String[] labels, int side) {
      this.name = name;
      this.session = session;
      this.inputName = inputName;
      this.labels = labels;
      this.side = side;
    }
  }

  @Override
  public void load() {
    getActivity()
        .runOnUiThread(
            () ->
                tts =
                    new TextToSpeech(
                        getContext(), status -> ttsReady = status == TextToSpeech.SUCCESS));
  }

  @Override
  protected void handleOnDestroy() {
    if (tts != null) {
      tts.stop();
      tts.shutdown();
    }
    synchronized (llmLock) {
      if (llm != null) llm.resetNative();
      llm = null;
    }
    visionWork.shutdown();
    llmWork.shutdown();
  }

  @PluginMethod
  public void detect(PluginCall call) {
    final String b64 = call.getString("imageBase64");
    if (b64 == null || b64.isEmpty()) {
      call.reject("rejected");
      return;
    }
    visionWork.execute(
        () -> {
          try {
            byte[] raw = Base64.decode(b64, Base64.DEFAULT);
            Bitmap source = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (source == null) {
              call.reject("rejected");
              return;
            }
            List<Vision> models = visionModels();
            if (models.isEmpty()) {
              call.reject("vision_unavailable");
              return;
            }
            List<Scored> results = new ArrayList<>();
            for (Vision v : models) results.add(classify(v, source));
            float plant = plantRatio(source);
            source.recycle();
            Collections.sort(results, (a, b) -> Float.compare(b.score, a.score));
            Scored best = results.get(0);
            JSObject det = new JSObject();
            det.put("class_id", best.id);
            det.put("label", best.label);
            det.put("confidence", (double) best.score);
            det.put("model", best.model);
            det.put("plant_ratio", (double) plant);
            det.put("bbox", boxAll());
            det.put("mask_polygon", new JSArray());
            JSArray others = new JSArray();
            for (int i = 1; i < results.size(); i++) {
              Scored s = results.get(i);
              JSObject o = new JSObject();
              o.put("class_id", s.id);
              o.put("label", s.label);
              o.put("confidence", (double) s.score);
              o.put("model", s.model);
              others.put(o);
            }
            det.put("alternatives", others);
            JSObject out = new JSObject();
            out.put("detection", det);
            call.resolve(out);
          } catch (Throwable e) {
            Log.e(TAG, "vision failed", e);
            call.reject("vision_failed: " + describe(e), "vision_failed");
          }
        });
  }

  @PluginMethod
  public void generate(PluginCall call) {
    final JSArray messages = call.getArray("messages");
    final int maxTokens = clamp(call.getInt("maxTokens", 256), 16, 1024);
    if (messages == null || messages.length() == 0) {
      call.reject("rejected");
      return;
    }
    llmWork.execute(
        () -> {
          try {
            File model = modelFile(LLM_FILE);
            File tokenizer = modelFile(TOKENIZER_FILE);
            if (model == null || tokenizer == null) {
              Log.e(TAG, "llm files missing: model=" + (model != null) + " tokenizer=" + (tokenizer != null));
              call.reject(
                  "llm_missing: model "
                      + (model != null ? "found" : "not found")
                      + ", tokenizer "
                      + (tokenizer != null ? "found" : "not found"),
                  "llm_missing");
              return;
            }
            String prompt = llamaPrompt(messages);
            final StringBuilder text = new StringBuilder();
            synchronized (llmLock) {
              if (llm == null) {
                LlmModule created =
                    new LlmModule(model.getAbsolutePath(), tokenizer.getAbsolutePath(), TEMPERATURE);
                int loaded = created.load();
                if (loaded != 0) {
                  created.resetNative();
                  Log.e(TAG, "llm load returned " + loaded);
                  call.reject(
                      "llm_load_failed: runtime returned code "
                          + loaded
                          + " for "
                          + model.length() / (1024 * 1024)
                          + " MB model",
                      "llm_load_failed");
                  return;
                }
                llm = created;
              }
              llm.resetContext();
              int seqLen = Math.min(MAX_SEQ_LEN, estimateTokens(prompt) + maxTokens);
              int status =
                  llm.generate(
                      prompt,
                      seqLen,
                      new LlmCallback() {
                        @Override
                        public void onResult(String piece) {
                          text.append(piece);
                        }
                      },
                      false);
              if (status != 0 && text.length() == 0) {
                Log.e(TAG, "llm generate returned " + status);
                call.reject("llm_failed: generate returned code " + status, "llm_failed");
                return;
              }
            }
            String cleaned = text.toString().replaceAll("<\\|[^|]*\\|>", "").trim();
            if (cleaned.isEmpty()) {
              Log.e(TAG, "llm produced no text, raw length " + text.length());
              call.reject(
                  "llm_failed: model returned no text, raw "
                      + text.length()
                      + " chars, prompt about "
                      + estimateTokens(prompt)
                      + " tokens",
                  "llm_failed");
              return;
            }
            JSObject out = new JSObject();
            out.put("text", cleaned);
            call.resolve(out);
          } catch (Throwable e) {
            Log.e(TAG, "llm failed", e);
            call.reject("llm_failed: " + describe(e), "llm_failed");
          }
        });
  }

  @PluginMethod
  public void speak(PluginCall call) {
    final String text = call.getString("text");
    final String lang = call.getString("lang", "en");
    if (text == null || text.isEmpty()) {
      call.reject("rejected");
      return;
    }
    if (tts == null || !ttsReady) {
      call.reject("tts_unavailable");
      return;
    }
    Locale locale = Locale.forLanguageTag(localeTag(lang));
    int available = tts.isLanguageAvailable(locale);
    if (available == TextToSpeech.LANG_MISSING_DATA
        || available == TextToSpeech.LANG_NOT_SUPPORTED) {
      call.reject("voice_not_installed");
      return;
    }
    tts.setLanguage(locale);
    int status = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "agriedge");
    if (status == TextToSpeech.SUCCESS) call.resolve();
    else call.reject("tts_failed");
  }

  @PluginMethod
  public void readAsset(PluginCall call) {
    final String name = call.getString("name");
    if (name == null || !name.matches("[A-Za-z0-9_./-]{1,120}") || name.contains("..")) {
      call.reject("rejected");
      return;
    }
    try (InputStream in = getContext().getAssets().open(name)) {
      JSObject out = new JSObject();
      out.put("base64", Base64.encodeToString(readAll(in), Base64.NO_WRAP));
      call.resolve(out);
    } catch (IOException e) {
      JSObject out = new JSObject();
      out.put("base64", JSONObject.NULL);
      call.resolve(out);
    }
  }

  @PluginMethod
  public void health(PluginCall call) {
    JSObject out = new JSObject();
    out.put("platform", "android");
    out.put("vision_adapter", "onnxruntime-android");
    boolean llmReady = hasModel(LLM_FILE) && hasModel(TOKENIZER_FILE);
    out.put("llm_adapter", llmReady ? "executorch" : "missing");
    out.put("audio_adapter", "android-tts");
    out.put("vision_model", visionNames());
    out.put("llm_model", hasModel(LLM_FILE) ? LLM_FILE : "missing");
    long rss = peakRssKb();
    if (rss >= 0) out.put("peak_rss_kb", rss);
    else out.put("peak_rss_kb", JSONObject.NULL);
    double temp = batteryTemp();
    if (!Double.isNaN(temp)) out.put("temp_c", temp);
    else out.put("temp_c", JSONObject.NULL);
    call.resolve(out);
  }

  private static final class Scored {
    final int id;
    final String label;
    final float score;
    final String model;

    Scored(int id, String label, float score, String model) {
      this.id = id;
      this.label = label;
      this.score = score;
      this.model = model;
    }
  }

  private Scored classify(Vision v, Bitmap source) throws Exception {
    Bitmap scaled = Bitmap.createScaledBitmap(source, v.side, v.side, true);
    int plane = v.side * v.side;
    int[] pixels = new int[plane];
    scaled.getPixels(pixels, 0, v.side, 0, 0, v.side, v.side);
    if (scaled != source) scaled.recycle();
    float[] data = new float[plane * 3];
    for (int i = 0; i < plane; i++) {
      int p = pixels[i];
      data[i] = ((p >> 16) & 0xFF) / 255f;
      data[plane + i] = ((p >> 8) & 0xFF) / 255f;
      data[2 * plane + i] = (p & 0xFF) / 255f;
    }
    float[] scores;
    try (OnnxTensor tensor =
            OnnxTensor.createTensor(
                env, FloatBuffer.wrap(data), new long[] {1, 3, v.side, v.side});
        OrtSession.Result result =
            v.session.run(Collections.singletonMap(v.inputName, tensor))) {
      Object value = result.get(0).getValue();
      if (!(value instanceof float[][])) throw new IllegalStateException("output shape");
      scores = ((float[][]) value)[0];
    }
    if (scores.length != v.labels.length) throw new IllegalStateException("label count");
    scores = normalise(scores);
    int best = 0;
    for (int i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    return new Scored(best, v.labels[best], scores[best], v.name + "/vision.onnx");
  }

  private static float[] normalise(float[] scores) {
    float min = Float.MAX_VALUE;
    float sum = 0f;
    for (float s : scores) {
      if (s < min) min = s;
      sum += s;
    }
    if (min >= 0f && Math.abs(sum - 1f) <= 1e-2f) return scores;
    float max = -Float.MAX_VALUE;
    for (float s : scores) if (s > max) max = s;
    float[] e = new float[scores.length];
    float total = 0f;
    for (int i = 0; i < scores.length; i++) {
      e[i] = (float) Math.exp(scores[i] - max);
      total += e[i];
    }
    for (int i = 0; i < e.length; i++) e[i] = e[i] / total;
    return e;
  }

  private List<Vision> visionModels() throws Exception {
    synchronized (visionLock) {
      if (visions != null) return visions;
      env = OrtEnvironment.getEnvironment();
      List<Vision> found = new ArrayList<>();
      for (String name : visionFolders()) {
        File dir = new File(modelsDir(), name);
        File onnx = new File(dir, "vision.onnx");
        File labels = new File(dir, "labels.json");
        if (!onnx.isFile() || !labels.isFile()) continue;
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setIntraOpNumThreads(2);
        OrtSession session = env.createSession(onnx.getAbsolutePath(), options);
        String input = session.getInputNames().iterator().next();
        TensorInfo info = (TensorInfo) session.getInputInfo().get(input).getInfo();
        long[] shape = info.getShape();
        int side = shape.length >= 3 && shape[2] > 0 ? (int) shape[2] : 224;
        found.add(new Vision(name, session, input, readLabels(labels), side));
      }
      visions = found;
      return visions;
    }
  }

  private List<String> visionFolders() throws IOException {
    List<String> names = new ArrayList<>();
    String[] bundled = getContext().getAssets().list(MODELS);
    if (bundled != null) {
      for (String name : bundled) {
        if (!name.matches("[A-Za-z0-9_-]{1,40}") || ROUTER.equals(name)) continue;
        copyBundled(name);
        names.add(name);
      }
    }
    File external = externalModels();
    File[] extra = external == null ? null : external.listFiles();
    if (extra != null) {
      for (File dir : extra) {
        String name = dir.getName();
        if (!dir.isDirectory() || !name.matches("[A-Za-z0-9_-]{1,40}")) continue;
        if (ROUTER.equals(name) || names.contains(name)) continue;
        File onnx = new File(dir, "vision.onnx");
        File labels = new File(dir, "labels.json");
        if (!onnx.isFile() || !labels.isFile()) continue;
        File target = new File(modelsDir(), name);
        if (!target.isDirectory() && !target.mkdirs()) continue;
        copyFile(onnx, new File(target, "vision.onnx"));
        copyFile(labels, new File(target, "labels.json"));
        names.add(name);
      }
    }
    Collections.sort(names);
    return names;
  }

  private void copyBundled(String name) throws IOException {
    File dir = new File(modelsDir(), name);
    if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("models folder");
    long installed = installTime();
    for (String file : new String[] {"vision.onnx", "labels.json"}) {
      File target = new File(dir, file);
      if (target.isFile() && target.lastModified() >= installed) continue;
      try (InputStream in = getContext().getAssets().open(MODELS + "/" + name + "/" + file);
          OutputStream out = new FileOutputStream(target)) {
        pump(in, out);
      }
    }
  }

  private long installTime() {
    try {
      Context c = getContext();
      PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
      return info.lastUpdateTime;
    } catch (Exception e) {
      return Long.MAX_VALUE;
    }
  }

  private File modelsDir() {
    File dir = new File(getContext().getFilesDir(), MODELS);
    if (!dir.isDirectory()) dir.mkdirs();
    return dir;
  }

  private File externalModels() {
    File base = getContext().getExternalFilesDir(null);
    return base == null ? null : new File(base, MODELS);
  }

  private File modelFile(String name) {
    File found = existingModel(name);
    return found != null ? found : copyFromAssets(name);
  }

  private File existingModel(String name) {
    File internal = new File(modelsDir(), name);
    if (internal.isFile() && internal.canRead() && internal.lastModified() >= installTime())
      return internal;
    File external = externalModels();
    if (external != null) {
      File candidate = new File(external, name);
      if (candidate.isFile() && candidate.canRead()) return candidate;
    }
    File root = getContext().getExternalFilesDir(null);
    if (root != null) {
      File candidate = new File(root, name);
      if (candidate.isFile() && candidate.canRead()) return candidate;
    }
    return null;
  }

  private boolean hasModel(String name) {
    if (existingModel(name) != null) return true;
    try {
      String[] bundled = getContext().getAssets().list(MODELS);
      if (bundled == null) return false;
      for (String entry : bundled) if (entry.equals(name)) return true;
    } catch (IOException e) {
      return false;
    }
    return false;
  }

  private File copyFromAssets(String name) {
    if (!hasModel(name)) return null;
    File target = new File(modelsDir(), name);
    File partial = new File(modelsDir(), name + ".part");
    try (InputStream in = getContext().getAssets().open(MODELS + "/" + name);
        OutputStream out = new FileOutputStream(partial)) {
      pump(in, out);
    } catch (IOException e) {
      partial.delete();
      return null;
    }
    target.delete();
    return partial.renameTo(target) ? target : null;
  }

  private String visionNames() {
    synchronized (visionLock) {
      if (visions == null || visions.isEmpty()) return "not loaded";
      StringBuilder sb = new StringBuilder();
      for (Vision v : visions) {
        if (sb.length() > 0) sb.append(", ");
        sb.append(v.name);
      }
      return sb.toString();
    }
  }

  private static String[] readLabels(File file) throws IOException, JSONException {
    StringBuilder sb = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
      String line;
      while ((line = reader.readLine()) != null) sb.append(line);
    }
    JSONArray array = new JSONArray(sb.toString());
    String[] labels = new String[array.length()];
    for (int i = 0; i < labels.length; i++) labels[i] = array.getString(i);
    return labels;
  }

  private static String llamaPrompt(JSArray messages) throws JSONException {
    StringBuilder sb = new StringBuilder();
    if (EXPLICIT_BOS) sb.append("<|begin_of_text|>");
    for (int i = 0; i < messages.length(); i++) {
      JSONObject m = messages.getJSONObject(i);
      String role = m.getString("role");
      if (!"system".equals(role) && !"user".equals(role) && !"assistant".equals(role)) continue;
      String content = m.getString("content").replace("<|", "(").replace("|>", ")");
      sb.append("<|start_header_id|>")
          .append(role)
          .append("<|end_header_id|>\n\n")
          .append(content.trim())
          .append("<|eot_id|>");
    }
    sb.append("<|start_header_id|>assistant<|end_header_id|>\n\n");
    return sb.toString();
  }

  private static String describe(Throwable e) {
    String message = e.getMessage();
    String text = e.getClass().getSimpleName() + (message == null ? "" : ": " + message);
    return text.length() > 150 ? text.substring(0, 150) : text;
  }

  private static float plantRatio(Bitmap source) {
    final int side = 64;
    Bitmap small = Bitmap.createScaledBitmap(source, side, side, true);
    int[] pixels = new int[side * side];
    small.getPixels(pixels, 0, side, 0, 0, side, side);
    if (small != source) small.recycle();
    float[] hsv = new float[3];
    int hits = 0;
    for (int p : pixels) {
      Color.colorToHSV(p, hsv);
      if (hsv[0] >= 40f && hsv[0] <= 170f && hsv[1] >= 0.15f && hsv[2] >= 0.15f) hits++;
    }
    return hits / (float) pixels.length;
  }

  private static int estimateTokens(String prompt) {
    int ascii = 0;
    int other = 0;
    for (int i = 0; i < prompt.length(); i++) {
      if (prompt.charAt(i) < 128) ascii++;
      else other++;
    }
    return ascii / 3 + other + 16;
  }

  private static String localeTag(String lang) {
    switch (lang) {
      case "hi":
        return "hi-IN";
      case "mr":
        return "mr-IN";
      case "te":
        return "te-IN";
      default:
        return "en-IN";
    }
  }

  private static JSArray boxAll() {
    JSArray box = new JSArray();
    box.put(0);
    box.put(0);
    box.put(1);
    box.put(1);
    return box;
  }

  private static int clamp(int value, int low, int high) {
    return Math.max(low, Math.min(high, value));
  }

  private static byte[] readAll(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    pump(in, out);
    return out.toByteArray();
  }

  private static void pump(InputStream in, OutputStream out) throws IOException {
    byte[] buffer = new byte[64 * 1024];
    int n;
    while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
  }

  private static void copyFile(File from, File to) throws IOException {
    if (to.isFile() && to.length() == from.length() && to.lastModified() >= from.lastModified())
      return;
    try (InputStream in = new FileInputStream(from);
        OutputStream out = new FileOutputStream(to)) {
      pump(in, out);
    }
  }

  private static long peakRssKb() {
    try (BufferedReader reader = new BufferedReader(new FileReader("/proc/self/status"))) {
      String line;
      while ((line = reader.readLine()) != null) {
        if (line.startsWith("VmHWM:")) {
          String digits = line.replaceAll("[^0-9]", "");
          return digits.isEmpty() ? -1 : Long.parseLong(digits);
        }
      }
    } catch (IOException | NumberFormatException e) {
      return -1;
    }
    return -1;
  }

  private double batteryTemp() {
    Intent status =
        getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    if (status == null) return Double.NaN;
    int tenths = status.getIntExtra("temperature", Integer.MIN_VALUE);
    return tenths == Integer.MIN_VALUE ? Double.NaN : tenths / 10.0;
  }
}
