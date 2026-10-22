package ai.redesignededge.engine

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import java.io.FileNotFoundException
import java.nio.FloatBuffer

fun interface AssetReader {
    fun read(path: String): ByteArray?
}

class Detection(
    val classId: Int,
    val label: String,
    val confidence: Float,
    val model: String,
    val kind: VisionKind,
)

class Detector(
    private val assets: AssetReader,
    private val decoder: PhotoDecoder = PhotoDecoder(),
) {
    private class Loaded(
        val spec: VisionModelSpec,
        val session: OrtSession,
        val labels: List<String>,
        val inputName: String,
        val side: Int,
    )

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private var loaded: Loaded? = null

    @Synchronized
    fun loadedModel(): String = loaded?.spec?.id ?: "none"

    @Synchronized
    fun detect(photo: ByteArray, requested: VisionModelSpec?): Detection? {
        ImageGuard.checkBytes(photo)
        if (requested != null) return run(photo, requested)
        val route = run(photo, VisionModels.router)
        if (route.confidence < ROUTER_MIN) return null
        val target = VisionModels.classifier(route.label) ?: return null
        return run(photo, target)
    }

    @Synchronized
    fun close() {
        loaded?.session?.close()
        loaded = null
    }

    private fun run(photo: ByteArray, spec: VisionModelSpec): Detection {
        val model = load(spec)
        val tensorData = Preprocess.toTensor(decoder.decode(photo, model.side), model.side)
        val shape = longArrayOf(1L, 3L, model.side.toLong(), model.side.toLong())
        val raw: FloatArray = OnnxTensor.createTensor(env, FloatBuffer.wrap(tensorData), shape).use { input ->
            model.session.run(mapOf(model.inputName to input)).use { result ->
                val first = result.get(0)
                if (first !is OnnxTensor) throw EngineFault("model_mismatch", "model output is not a tensor")
                val buffer = first.floatBuffer
                val out = FloatArray(buffer.remaining())
                buffer.get(out)
                out
            }
        }
        if (raw.size != model.labels.size) throw EngineFault("model_mismatch", "model output does not match its labels")
        val scores = Scores.normalize(raw)
        val best = Scores.argMax(scores)
        return Detection(best, model.labels[best], scores[best], spec.id, spec.kind)
    }

    private fun load(spec: VisionModelSpec): Loaded {
        val current = loaded
        if (current != null && current.spec.id == spec.id) return current
        current?.session?.close()
        loaded = null
        val dir = "models/${spec.id}"
        val labelBytes = read("$dir/labels.json")
        val modelBytes = read("$dir/vision.onnx")
        val labels = LabelsParser.parse(String(labelBytes, Charsets.UTF_8))
        val options = OrtSession.SessionOptions()
        val session: OrtSession
        try {
            options.setIntraOpNumThreads(threads())
            session = env.createSession(modelBytes, options)
        } finally {
            options.close()
        }
        try {
            val name = session.inputNames.firstOrNull() ?: throw EngineFault("model_mismatch", "model has no input")
            val info = session.inputInfo[name]?.info as? TensorInfo
                ?: throw EngineFault("model_mismatch", "model input is not a tensor")
            val dims = info.shape
            if (dims.size != 4 || dims[1] != 3L) throw EngineFault("model_mismatch", "model input shape is not supported")
            val side = if (dims[2] > 0L && dims[2] == dims[3]) dims[2].toInt() else DEFAULT_SIDE
            if (side < 32 || side > 1024) throw EngineFault("model_mismatch", "model input size is not supported")
            val fresh = Loaded(spec, session, labels, name, side)
            loaded = fresh
            return fresh
        } catch (e: EngineFault) {
            session.close()
            throw e
        }
    }

    private fun read(path: String): ByteArray {
        try {
            return assets.read(path) ?: throw EngineFault("model_missing", "vision model is not installed")
        } catch (e: FileNotFoundException) {
            throw EngineFault("model_missing", "vision model is not installed")
        }
    }

    private fun threads(): Int = Runtime.getRuntime().availableProcessors().coerceIn(1, 4)

    companion object {
        const val ROUTER_MIN = 0.6f
        private const val DEFAULT_SIDE = 224
    }
}
