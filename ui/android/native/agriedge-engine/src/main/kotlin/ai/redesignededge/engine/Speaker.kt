package ai.redesignededge.engine

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class Speaker(context: Context) {
    private val appContext = context.applicationContext
    private val lock = Any()
    private var tts: TextToSpeech? = null

    fun speak(text: String, lang: String): String {
        if (text.isEmpty() || text.length > MAX_CHARS) throw EngineFault("rejected", "invalid text")
        val locale = localeFor(lang) ?: throw EngineFault("rejected", "language not supported")
        val engine = engine() ?: throw EngineFault("not_ready", "speech engine unavailable")
        synchronized(lock) {
            if (engine.isLanguageAvailable(locale) < TextToSpeech.LANG_AVAILABLE) return VOICE_MISSING
            if (engine.setLanguage(locale) < TextToSpeech.LANG_AVAILABLE) return VOICE_MISSING
            if (engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "agriedge") != TextToSpeech.SUCCESS) {
                throw EngineFault("not_ready", "speech engine unavailable")
            }
            return OK
        }
    }

    fun shutdown() {
        synchronized(lock) {
            tts?.stop()
            tts?.shutdown()
            tts = null
        }
    }

    private fun engine(): TextToSpeech? {
        synchronized(lock) {
            val existing = tts
            if (existing != null) return existing
            val latch = CountDownLatch(1)
            val status = IntArray(1) { TextToSpeech.ERROR }
            val created = TextToSpeech(appContext) { s ->
                status[0] = s
                latch.countDown()
            }
            val finished = latch.await(INIT_TIMEOUT_S, TimeUnit.SECONDS)
            if (!finished || status[0] != TextToSpeech.SUCCESS) {
                created.shutdown()
                return null
            }
            tts = created
            return created
        }
    }

    private fun localeFor(lang: String): Locale? = when (lang) {
        "en", "hi", "mr" -> Locale.Builder().setLanguage(lang).setRegion("IN").build()
        else -> null
    }

    companion object {
        const val OK = "ok"
        const val VOICE_MISSING = "voice_not_installed"
        private const val MAX_CHARS = 2000
        private const val INIT_TIMEOUT_S = 5L
    }
}
