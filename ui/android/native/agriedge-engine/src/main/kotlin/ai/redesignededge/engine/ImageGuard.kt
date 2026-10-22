package ai.redesignededge.engine

enum class ImageType { JPEG, PNG, WEBP }

object ImageGuard {
    const val MAX_BYTES = 8_000_000
    const val MAX_SIDE = 12_000
    const val MIN_SIDE = 16
    const val MAX_PIXELS = 100_000_000L

    private val PNG_SIGNATURE = intArrayOf(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    fun sniff(b: ByteArray): ImageType? {
        if (b.size >= 3 && u(b, 0) == 0xFF && u(b, 1) == 0xD8 && u(b, 2) == 0xFF) return ImageType.JPEG
        if (b.size >= 8 && PNG_SIGNATURE.indices.all { u(b, it) == PNG_SIGNATURE[it] }) return ImageType.PNG
        if (b.size >= 12 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return ImageType.WEBP
        return null
    }

    fun checkEncodedLength(base64Length: Int) {
        if (base64Length <= 0 || base64Length > (MAX_BYTES / 3 + 1) * 4 + 8) {
            throw EngineFault("rejected", "image size not accepted")
        }
    }

    fun checkBytes(bytes: ByteArray) {
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) throw EngineFault("rejected", "image size not accepted")
        if (sniff(bytes) == null) throw EngineFault("rejected", "image type not accepted")
    }

    fun checkDimensions(width: Int, height: Int) {
        if (width < MIN_SIDE || height < MIN_SIDE) throw EngineFault("rejected", "image dimensions not accepted")
        if (width > MAX_SIDE || height > MAX_SIDE) throw EngineFault("rejected", "image dimensions not accepted")
        if (width.toLong() * height.toLong() > MAX_PIXELS) throw EngineFault("rejected", "image dimensions not accepted")
    }

    fun sampleSize(width: Int, height: Int, side: Int): Int {
        val target = side * 2
        val shortest = minOf(width, height)
        var s = 1
        while (shortest / (s * 2) >= target) s *= 2
        return s
    }

    private fun u(b: ByteArray, i: Int): Int = b[i].toInt() and 0xFF

    private fun ascii(b: ByteArray, at: Int, text: String): Boolean =
        text.indices.all { b[at + it].toInt() == text[it].code }
}
