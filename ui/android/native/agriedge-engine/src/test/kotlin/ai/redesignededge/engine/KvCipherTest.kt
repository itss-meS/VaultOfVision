package ai.redesignededge.engine

import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class KvCipherTest {
    private fun key(): SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    private fun corrupt(block: () -> Unit) {
        try {
            block()
            fail("expected failure")
        } catch (e: EngineFault) {
            assertEquals("kv_corrupt", e.code)
        }
    }

    @Test
    fun roundTrip() {
        val k = key()
        val c = KvCipher { k }
        val sealed = c.seal("profiles", "[\"farmer1\"]")
        assertFalse(String(sealed, Charsets.ISO_8859_1).contains("farmer1"))
        assertEquals("[\"farmer1\"]", c.open("profiles", sealed))
    }

    @Test
    fun eachSealUsesFreshIv() {
        val k = key()
        val c = KvCipher { k }
        val a = c.seal("profiles", "same")
        val b = c.seal("profiles", "same")
        assertFalse(a.contentEquals(b))
    }

    @Test
    fun valueCannotMoveToAnotherKey() {
        val k = key()
        val c = KvCipher { k }
        val sealed = c.seal("profile:a", "secret")
        corrupt { c.open("profile:b", sealed) }
    }

    @Test
    fun tamperingAndWrongKeyAreDetected() {
        val k = key()
        val c = KvCipher { k }
        val sealed = c.seal("profiles", "value")
        val flipped = sealed.copyOf()
        flipped[flipped.size - 1] = (flipped[flipped.size - 1].toInt() xor 1).toByte()
        corrupt { c.open("profiles", flipped) }
        val other = key()
        corrupt { KvCipher { other }.open("profiles", sealed) }
        corrupt { c.open("profiles", ByteArray(0)) }
        corrupt { c.open("profiles", byteArrayOf(0, 1, 2, 3)) }
        corrupt { c.open("profiles", byteArrayOf(12, 1, 2, 3)) }
        assertTrue(sealed.size > 12)
    }
}
