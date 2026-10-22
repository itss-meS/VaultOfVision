package ai.redesignededge.engine

import kotlin.math.abs
import kotlin.math.exp

object Scores {
    fun isProbabilities(x: FloatArray): Boolean {
        var min = Float.POSITIVE_INFINITY
        var sum = 0.0
        for (v in x) {
            if (v < min) min = v
            sum += v
        }
        return min >= 0f && abs(sum - 1.0) <= 1e-2
    }

    fun softmax(x: FloatArray): FloatArray {
        var max = Float.NEGATIVE_INFINITY
        for (v in x) if (v > max) max = v
        val e = DoubleArray(x.size) { exp((x[it] - max).toDouble()) }
        var sum = 0.0
        for (v in e) sum += v
        return FloatArray(x.size) { (e[it] / sum).toFloat() }
    }

    fun normalize(raw: FloatArray): FloatArray {
        if (raw.isEmpty()) throw EngineFault("model_mismatch", "model returned no scores")
        for (v in raw) {
            if (v.isNaN() || v.isInfinite()) throw EngineFault("model_mismatch", "model returned invalid scores")
        }
        return if (isProbabilities(raw)) raw else softmax(raw)
    }

    fun argMax(x: FloatArray): Int {
        var best = 0
        for (i in 1 until x.size) if (x[i] > x[best]) best = i
        return best
    }
}
