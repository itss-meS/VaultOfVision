package ai.redesignededge.engine

import java.io.File
import java.security.MessageDigest
import javax.imageio.ImageIO
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PreprocessTest {
    private fun load(name: String): Pixels {
        val stream = javaClass.getResourceAsStream("/pil/$name.png")
        assertNotNull(name, stream)
        val img = stream!!.use { ImageIO.read(it) }
        val w = img.width
        val h = img.height
        val argb = IntArray(w * h)
        img.getRGB(0, 0, w, h, argb, 0, w)
        return Pixels(argb, w, h)
    }

    private fun hex(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    @Test
    fun matchesPillowBilinearExactly() {
        val lines = javaClass.getResourceAsStream("/pil/expected.txt")!!.bufferedReader().readLines().filter { it.isNotBlank() }
        assertTrue(lines.size >= 6)
        for (line in lines) {
            val (name, sha) = line.split(" ")
            val out = Preprocess.resizeRgb(load(name), 224, 224)
            assertEquals(name, sha, hex(out))
        }
    }

    @Test
    fun tensorIsChannelFirstScaledToUnit() {
        val px = Pixels(IntArray(4) { 0xFF000000.toInt() or (255 shl 16) or (128 shl 8) or 0 }, 2, 2)
        val t = Preprocess.toTensor(px, 2)
        assertEquals(12, t.size)
        for (i in 0 until 4) {
            assertEquals(1f, t[i], 0f)
            assertEquals(128f / 255f, t[4 + i], 0f)
            assertEquals(0f, t[8 + i], 0f)
        }
    }

    @Test
    fun alphaIsIgnored() {
        val a = Pixels(IntArray(4) { 0x00102030 }, 2, 2)
        val b = Pixels(IntArray(4) { 0xFF102030.toInt() }, 2, 2)
        assertTrue(Preprocess.toTensor(a, 2).contentEquals(Preprocess.toTensor(b, 2)))
    }

    @Test
    fun invalidSizesAreRejected() {
        try {
            Preprocess.resizeRgb(Pixels(IntArray(1), 2, 2), 4, 4)
            org.junit.Assert.fail("expected rejection")
        } catch (e: EngineFault) {
            assertEquals("rejected", e.code)
        }
        assertTrue(File(".").exists())
    }
}
