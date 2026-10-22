package ai.redesignededge.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class ImageGuardTest {
    private fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    private fun rejected(block: () -> Unit) {
        try {
            block()
            fail("expected rejection")
        } catch (e: EngineFault) {
            assertEquals("rejected", e.code)
        }
    }

    @Test
    fun sniffsByContentNotName() {
        assertEquals(ImageType.JPEG, ImageGuard.sniff(bytes(0xFF, 0xD8, 0xFF, 0xE0)))
        assertEquals(ImageType.PNG, ImageGuard.sniff(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0)))
        val webp = "RIFF".toByteArray() + bytes(1, 2, 3, 4) + "WEBP".toByteArray()
        assertEquals(ImageType.WEBP, ImageGuard.sniff(webp))
        assertNull(ImageGuard.sniff("GIF89a".toByteArray()))
        assertNull(ImageGuard.sniff("<svg></svg>".toByteArray()))
        assertNull(ImageGuard.sniff(bytes(0xFF, 0xD8)))
        assertNull(ImageGuard.sniff("RIFF".toByteArray() + bytes(1, 2, 3, 4) + "WAVE".toByteArray()))
        assertNull(ImageGuard.sniff(ByteArray(0)))
    }

    @Test
    fun sizeLimits() {
        ImageGuard.checkBytes(bytes(0xFF, 0xD8, 0xFF, 0xE0))
        rejected { ImageGuard.checkBytes(ByteArray(0)) }
        rejected { ImageGuard.checkBytes(ByteArray(ImageGuard.MAX_BYTES + 1) { 0xFF.toByte() }) }
        rejected { ImageGuard.checkBytes("not an image".toByteArray()) }
        rejected { ImageGuard.checkEncodedLength(0) }
        rejected { ImageGuard.checkEncodedLength(50_000_000) }
        ImageGuard.checkEncodedLength(1_000_000)
    }

    @Test
    fun dimensionLimits() {
        ImageGuard.checkDimensions(224, 224)
        ImageGuard.checkDimensions(4000, 3000)
        rejected { ImageGuard.checkDimensions(-1, -1) }
        rejected { ImageGuard.checkDimensions(15, 500) }
        rejected { ImageGuard.checkDimensions(12_001, 100) }
        rejected { ImageGuard.checkDimensions(11_000, 11_000) }
    }

    @Test
    fun sampleSizeKeepsTwiceTheTarget() {
        assertEquals(1, ImageGuard.sampleSize(640, 480, 224))
        assertEquals(1, ImageGuard.sampleSize(800, 800, 224))
        assertEquals(2, ImageGuard.sampleSize(1000, 900, 224))
        assertEquals(4, ImageGuard.sampleSize(4000, 3000, 224))
        assertEquals(1, ImageGuard.sampleSize(100, 100, 224))
    }
}
