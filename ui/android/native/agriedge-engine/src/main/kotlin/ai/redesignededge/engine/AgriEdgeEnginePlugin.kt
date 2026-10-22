package ai.redesignededge.engine

import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileNotFoundException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

@CapacitorPlugin(name = "AgriEdgeEngine")
class AgriEdgeEnginePlugin : Plugin() {
    private lateinit var kv: SecureKv
    private lateinit var detector: Detector
    private lateinit var speaker: Speaker
    private lateinit var probe: DeviceProbe
    private lateinit var store: ModelStore
    private lateinit var downloader: ModelDownloader
    private lateinit var llama: LlamaRunner

    private val inference: ExecutorService = Executors.newSingleThreadExecutor()
    private val transfers: ExecutorService = Executors.newSingleThreadExecutor()
    private val speech: ExecutorService = Executors.newSingleThreadExecutor()
    private val detectFlight = SingleFlight()
    private val generateFlight = SingleFlight()
    private val downloading = AtomicBoolean(false)
    private val downloadCancelled = AtomicBoolean(false)

    override fun load() {
        val ctx = context.applicationContext
        kv = SecureKv(ctx)
        probe = DeviceProbe(ctx)
        speaker = Speaker(ctx)
        detector = Detector(
            AssetReader { path ->
                try {
                    ctx.assets.open(path).use { it.readBytes() }
                } catch (e: FileNotFoundException) {
                    null
                }
            },
        )
        store = ModelStore(File(ctx.filesDir, "models"))
        downloader = ModelDownloader(store, DownloadPolicy.PRODUCTION, networkAllowed = { probe.onUnmeteredWifi() })
        llama = LlamaRunner(store)
    }

    override fun handleOnDestroy() {
        inference.shutdownNow()
        transfers.shutdownNow()
        speech.shutdownNow()
        detector.close()
        speaker.shutdown()
        llama.close()
    }

    @PluginMethod
    fun detect(call: PluginCall) {
        val image = call.getString("imageBase64")
        if (image.isNullOrEmpty()) {
            call.reject("image is required", "rejected")
            return
        }
        val spec: VisionModelSpec?
        if (call.data.has("model") && !call.data.isNull("model")) {
            val name = call.getString("model")
            spec = if (name.isNullOrEmpty()) null else VisionModels.resolve(name)
            if (spec == null) {
                call.reject("model is not supported", "rejected")
                return
            }
        } else {
            spec = null
        }
        if (!detectFlight.tryAcquire()) {
            call.reject("engine busy", "busy")
            return
        }
        submit(inference, call, detectFlight) {
            ImageGuard.checkEncodedLength(image.length)
            val bytes = try {
                Base64.decode(image, Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                throw EngineFault("rejected", "image is not valid base64")
            }
            val result = detector.detect(bytes, spec)
            val out = JSObject()
            if (result == null) {
                out.put("detection", JSONObject.NULL)
            } else {
                val box = JSArray()
                box.put(0).put(0).put(1).put(1)
                val det = JSObject()
                det.put("class_id", result.classId)
                det.put("label", result.label)
                det.put("confidence", result.confidence.toDouble())
                det.put("bbox", box)
                det.put("mask_polygon", JSArray())
                det.put("model", result.model)
                det.put("kind", result.kind.wire)
                out.put("detection", det)
            }
            out
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val raw = call.getArray("messages")
        val maxTokens = call.getInt("maxTokens")
        if (raw == null || maxTokens == null) {
            call.reject("messages and maxTokens are required", "rejected")
            return
        }
        val turns = ArrayList<ChatTurn>()
        for (i in 0 until raw.length()) {
            val item = raw.optJSONObject(i)
            val role = item?.optString("role", "")
            val content = item?.optString("content", "")
            if (item == null || role.isNullOrEmpty() || content.isNullOrEmpty()) {
                call.reject("invalid prompt", "rejected")
                return
            }
            turns.add(ChatTurn(role, content))
        }
        if (!generateFlight.tryAcquire()) {
            call.reject("engine busy", "busy")
            return
        }
        submit(inference, call, generateFlight) {
            val text = llama.generate(turns, maxTokens)
            JSObject().put("text", text)
        }
    }

    @PluginMethod
    fun cancelGenerate(call: PluginCall) {
        llama.cancel()
        call.resolve()
    }

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text")
        val lang = call.getString("lang")
        if (text.isNullOrEmpty() || lang.isNullOrEmpty()) {
            call.reject("text and lang are required", "rejected")
            return
        }
        submit(speech, call, null) {
            JSObject().put("status", speaker.speak(text, lang))
        }
    }

    @PluginMethod
    fun readAsset(call: PluginCall) {
        val name = call.getString("name")
        if (name.isNullOrEmpty() || !AssetNames.isReadable(name)) {
            call.reject("asset not allowed", "rejected")
            return
        }
        guarded(call) {
            val bytes = try {
                context.assets.open(name).use { it.readBytes() }
            } catch (e: FileNotFoundException) {
                null
            }
            val out = JSObject()
            if (bytes == null) {
                out.put("base64", JSONObject.NULL)
            } else {
                out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
            out
        }
    }

    @PluginMethod
    fun kvGet(call: PluginCall) {
        val key = call.getString("key")
        if (key == null || !KvKeys.isValidKey(key)) {
            call.reject("storage key not allowed", "rejected")
            return
        }
        guarded(call) {
            val value = kv.get(key)
            val out = JSObject()
            if (value == null) out.put("value", JSONObject.NULL) else out.put("value", value)
            out
        }
    }

    @PluginMethod
    fun kvSet(call: PluginCall) {
        val key = call.getString("key")
        val value = call.getString("value")
        if (key == null || !KvKeys.isValidKey(key) || value == null || !KvKeys.isValidValue(value)) {
            call.reject("storage request not allowed", "rejected")
            return
        }
        guarded(call) {
            kv.set(key, value)
            null
        }
    }

    @PluginMethod
    fun health(call: PluginCall) {
        guarded(call) {
            val out = JSObject()
            out.put("platform", "android")
            out.put("vision_adapter", "onnxruntime")
            out.put("llm_adapter", "not linked")
            out.put("audio_adapter", "android-tts")
            out.put("vision_model", detector.loadedModel())
            out.put("llm_model", if (llama.modelPresent()) ModelNames.LLM else "none")
            val rss = probe.peakRssKb()
            if (rss == null) out.put("peak_rss_kb", JSONObject.NULL) else out.put("peak_rss_kb", rss)
            val temp = probe.temperatureC()
            if (temp == null) out.put("temp_c", JSONObject.NULL) else out.put("temp_c", temp)
            out
        }
    }

    @PluginMethod
    fun modelStatus(call: PluginCall) {
        val verify = call.getBoolean("verify", false) == true
        submit(transfers, call, null) { statusJson(verify) }
    }

    @PluginMethod
    fun downloadModels(call: PluginCall) {
        val raw = call.getArray("files")
        if (raw == null) {
            call.reject("files are required", "rejected")
            return
        }
        val requests = ArrayList<DownloadRequest>()
        for (i in 0 until raw.length()) {
            val item = raw.optJSONObject(i)
            val name = item?.optString("name", "")
            val url = item?.optString("url", "")
            val sha = item?.optString("sha256", "")
            val size = item?.optLong("size", -1L) ?: -1L
            if (item == null || name.isNullOrEmpty() || url.isNullOrEmpty() || sha.isNullOrEmpty()) {
                call.reject("invalid file list", "rejected")
                return
            }
            requests.add(DownloadRequest(name, url, sha, size))
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("a download is already running", "busy")
            return
        }
        downloadCancelled.set(false)
        var lastEmit = 0L
        try {
            transfers.execute {
                try {
                    guarded(call) {
                        downloader.download(
                            requests,
                            { name, received, total ->
                                val now = System.currentTimeMillis()
                                if (received >= total || now - lastEmit >= PROGRESS_INTERVAL_MS) {
                                    lastEmit = now
                                    val event = JSObject()
                                    event.put("name", name)
                                    event.put("received", received)
                                    event.put("total", total)
                                    notifyListeners("downloadProgress", event)
                                }
                            },
                            { downloadCancelled.get() },
                        )
                        statusJson(false)
                    }
                } finally {
                    downloading.set(false)
                }
            }
        } catch (e: RejectedExecutionException) {
            downloading.set(false)
            call.reject("engine is shutting down", "busy")
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        downloadCancelled.set(true)
        call.resolve()
    }

    private fun statusJson(verify: Boolean): JSObject {
        val files = JSArray()
        for (s in store.allStatuses(verify)) {
            val f = JSObject()
            f.put("name", s.name)
            f.put("present", s.present)
            f.put("size", s.size)
            if (s.sha256 == null) f.put("sha256", JSONObject.NULL) else f.put("sha256", s.sha256)
            f.put("verified", s.verified)
            files.put(f)
        }
        return JSObject().put("files", files)
    }

    private fun submit(executor: ExecutorService, call: PluginCall, flight: SingleFlight?, block: () -> JSObject?) {
        try {
            executor.execute {
                try {
                    guarded(call, block)
                } finally {
                    flight?.release()
                }
            }
        } catch (e: RejectedExecutionException) {
            flight?.release()
            call.reject("engine is shutting down", "busy")
        }
    }

    private fun guarded(call: PluginCall, block: () -> JSObject?) {
        try {
            val result = block()
            if (result == null) call.resolve() else call.resolve(result)
        } catch (f: EngineFault) {
            call.reject(f.message ?: "failed", f.code)
        } catch (e: OutOfMemoryError) {
            call.reject("not enough memory", "memory")
        } catch (e: Exception) {
            call.reject("internal error", "internal")
        }
    }

    private companion object {
        const val PROGRESS_INTERVAL_MS = 250L
    }
}
