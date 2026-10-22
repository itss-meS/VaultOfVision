package ai.redesignededge.engine

import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

fun interface KeyProvider {
    fun key(): SecretKey
}

class KvCipher(private val keys: KeyProvider) {
    fun seal(name: String, plain: String): ByteArray {
        try {
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.ENCRYPT_MODE, keys.key())
            cipher.updateAAD(aad(name))
            val iv = cipher.iv
            if (iv == null || iv.isEmpty() || iv.size > 255) throw EngineFault("kv_failed", "storage encryption failed")
            val body = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            val out = ByteArray(1 + iv.size + body.size)
            out[0] = iv.size.toByte()
            System.arraycopy(iv, 0, out, 1, iv.size)
            System.arraycopy(body, 0, out, 1 + iv.size, body.size)
            return out
        } catch (e: GeneralSecurityException) {
            throw EngineFault("kv_failed", "storage encryption failed")
        }
    }

    fun open(name: String, sealed: ByteArray): String {
        if (sealed.size < 2) throw EngineFault("kv_corrupt", "stored value is unreadable")
        val ivLen = sealed[0].toInt() and 0xFF
        if (ivLen == 0 || sealed.size < 1 + ivLen + TAG_BYTES) throw EngineFault("kv_corrupt", "stored value is unreadable")
        try {
            val iv = sealed.copyOfRange(1, 1 + ivLen)
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, keys.key(), GCMParameterSpec(TAG_BITS, iv))
            cipher.updateAAD(aad(name))
            val plain = cipher.doFinal(sealed, 1 + ivLen, sealed.size - 1 - ivLen)
            return String(plain, Charsets.UTF_8)
        } catch (e: GeneralSecurityException) {
            throw EngineFault("kv_corrupt", "stored value is unreadable")
        }
    }

    private fun aad(name: String): ByteArray = (AAD_PREFIX + name).toByteArray(Charsets.UTF_8)

    companion object {
        private const val TRANSFORM = "AES/GCM/NoPadding"
        private const val TAG_BITS = 128
        private const val TAG_BYTES = 16
        private const val AAD_PREFIX = "agriedge.kv.v1:"
    }
}
