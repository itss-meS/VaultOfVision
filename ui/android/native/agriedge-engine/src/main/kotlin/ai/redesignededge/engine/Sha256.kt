package ai.redesignededge.engine

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

object Sha256 {
    private val HEX = Regex("[0-9a-f]{64}")

    fun isValidHex(value: String): Boolean = HEX.matches(value)

    fun ofFile(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buf = ByteArray(65_536)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return hex(md.digest())
    }

    fun hex(bytes: ByteArray): String {
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            sb.append("0123456789abcdef"[v shr 4])
            sb.append("0123456789abcdef"[v and 0x0F])
        }
        return sb.toString()
    }
}
