package ai.redesignededge.engine

import kotlin.math.abs
import kotlin.math.ceil

class Pixels(val argb: IntArray, val width: Int, val height: Int)

object Preprocess {
    private const val PRECISION_BITS = 22

    fun toTensor(src: Pixels, side: Int): FloatArray {
        val rgb = resizeRgb(src, side, side)
        val plane = side * side
        val out = FloatArray(plane * 3)
        for (i in 0 until plane) {
            out[i] = (rgb[i * 3].toInt() and 0xFF) / 255f
            out[plane + i] = (rgb[i * 3 + 1].toInt() and 0xFF) / 255f
            out[2 * plane + i] = (rgb[i * 3 + 2].toInt() and 0xFF) / 255f
        }
        return out
    }

    fun resizeRgb(src: Pixels, outW: Int, outH: Int): ByteArray {
        if (src.width <= 0 || src.height <= 0 || outW <= 0 || outH <= 0) {
            throw EngineFault("rejected", "invalid image size")
        }
        if (src.argb.size < src.width * src.height) throw EngineFault("rejected", "invalid image size")
        var data = ByteArray(src.width * src.height * 3)
        for (i in 0 until src.width * src.height) {
            val p = src.argb[i]
            data[i * 3] = (p shr 16).toByte()
            data[i * 3 + 1] = (p shr 8).toByte()
            data[i * 3 + 2] = p.toByte()
        }
        var w = src.width
        var h = src.height
        if (outW != w) {
            data = horizontal(data, w, h, outW, coeffs(w, outW))
            w = outW
        }
        if (outH != h) {
            data = vertical(data, w, h, outH, coeffs(h, outH))
            h = outH
        }
        return data
    }

    private class Coeffs(val ksize: Int, val bounds: IntArray, val kk: IntArray)

    private fun bilinear(x: Double): Double {
        val a = abs(x)
        return if (a < 1.0) 1.0 - a else 0.0
    }

    private fun coeffs(inSize: Int, outSize: Int): Coeffs {
        val scale = inSize.toDouble() / outSize
        val filterScale = if (scale < 1.0) 1.0 else scale
        val support = filterScale
        val ksize = ceil(support).toInt() * 2 + 1
        val bounds = IntArray(outSize * 2)
        val kk = IntArray(outSize * ksize)
        val tmp = DoubleArray(ksize)
        val one = (1 shl PRECISION_BITS).toDouble()
        for (xx in 0 until outSize) {
            val center = (xx + 0.5) * scale
            val ss = 1.0 / filterScale
            var xmin = (center - support + 0.5).toInt()
            if (xmin < 0) xmin = 0
            var xmax = (center + support + 0.5).toInt()
            if (xmax > inSize) xmax = inSize
            xmax -= xmin
            tmp.fill(0.0)
            var ww = 0.0
            for (x in 0 until xmax) {
                val w = bilinear((x + xmin - center + 0.5) * ss)
                tmp[x] = w
                ww += w
            }
            if (ww != 0.0) {
                for (x in 0 until xmax) tmp[x] = tmp[x] / ww
            }
            for (x in 0 until ksize) {
                val v = tmp[x]
                kk[xx * ksize + x] = if (v < 0) (-0.5 + v * one).toInt() else (0.5 + v * one).toInt()
            }
            bounds[xx * 2] = xmin
            bounds[xx * 2 + 1] = xmax
        }
        return Coeffs(ksize, bounds, kk)
    }

    private fun clip8(v: Int): Byte {
        val s = v shr PRECISION_BITS
        return (if (s < 0) 0 else if (s > 255) 255 else s).toByte()
    }

    private fun horizontal(src: ByteArray, w: Int, h: Int, outW: Int, c: Coeffs): ByteArray {
        val out = ByteArray(outW * h * 3)
        for (y in 0 until h) {
            val row = y * w * 3
            for (xx in 0 until outW) {
                val xmin = c.bounds[xx * 2]
                val xmax = c.bounds[xx * 2 + 1]
                val k = xx * c.ksize
                for (ch in 0 until 3) {
                    var ss = 1 shl (PRECISION_BITS - 1)
                    for (x in 0 until xmax) {
                        ss += (src[row + (x + xmin) * 3 + ch].toInt() and 0xFF) * c.kk[k + x]
                    }
                    out[(y * outW + xx) * 3 + ch] = clip8(ss)
                }
            }
        }
        return out
    }

    private fun vertical(src: ByteArray, w: Int, h: Int, outH: Int, c: Coeffs): ByteArray {
        val out = ByteArray(w * outH * 3)
        for (yy in 0 until outH) {
            val ymin = c.bounds[yy * 2]
            val ymax = c.bounds[yy * 2 + 1]
            val k = yy * c.ksize
            for (x in 0 until w) {
                for (ch in 0 until 3) {
                    var ss = 1 shl (PRECISION_BITS - 1)
                    for (y in 0 until ymax) {
                        ss += (src[((y + ymin) * w + x) * 3 + ch].toInt() and 0xFF) * c.kk[k + y]
                    }
                    out[(yy * w + x) * 3 + ch] = clip8(ss)
                }
            }
        }
        return out
    }
}
