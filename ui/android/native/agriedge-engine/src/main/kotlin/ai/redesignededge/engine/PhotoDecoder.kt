package ai.redesignededge.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory

class PhotoDecoder {
    fun decode(bytes: ByteArray, side: Int): Pixels {
        ImageGuard.checkBytes(bytes)
        val bounds = BitmapFactory.Options()
        bounds.inJustDecodeBounds = true
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        ImageGuard.checkDimensions(bounds.outWidth, bounds.outHeight)
        val opts = BitmapFactory.Options()
        opts.inSampleSize = ImageGuard.sampleSize(bounds.outWidth, bounds.outHeight, side)
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888
        val bitmap: Bitmap? = try {
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
        } catch (e: OutOfMemoryError) {
            throw EngineFault("rejected", "image too large to process")
        }
        if (bitmap == null) throw EngineFault("rejected", "image could not be decoded")
        try {
            val w = bitmap.width
            val h = bitmap.height
            val px = IntArray(w * h)
            bitmap.getPixels(px, 0, w, 0, 0, w, h)
            return Pixels(px, w, h)
        } finally {
            bitmap.recycle()
        }
    }
}
