package ai.redesignededge.engine

import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LlamaAndHealthTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val turns = listOf(ChatTurn("system", "s"), ChatTurn("user", "u"))

    private fun fails(code: String, block: () -> Unit) {
        try {
            block()
            fail("expected $code")
        } catch (e: EngineFault) {
            assertEquals(code, e.code)
        }
    }

    private fun installed(): ModelStore {
        val store = ModelStore(File(tmp.root, "m"))
        store.dir.mkdirs()
        for (n in ModelNames.allowed) {
            store.file(n).writeBytes(byteArrayOf(1, 2, 3))
            store.writeMeta(n, "a".repeat(64), 3L)
        }
        return store
    }

    @Test
    fun promptFollowsLlama3Format() {
        val p = PromptBuilder.llama3(turns, false)
        assertEquals("<|start_header_id|>system<|end_header_id|>\n\ns<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nu<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n", p)
        assertEquals(0, p.split(PromptBuilder.BOS).size - 1)
        val withBos = PromptBuilder.llama3(turns, true)
        assertEquals(1, withBos.split(PromptBuilder.BOS).size - 1)
        assertTrue(withBos.startsWith(PromptBuilder.BOS))
    }

    @Test
    fun badPromptsAreRejectedFirst() {
        val r = LlamaRunner(ModelStore(File(tmp.root, "none")))
        fails("rejected") { r.generate(emptyList(), 10) }
        fails("rejected") { r.generate(turns, 0) }
        fails("rejected") { r.generate(turns, PromptBuilder.MAX_TOKENS + 1) }
        fails("rejected") { r.generate(listOf(ChatTurn("assistant", "x")), 10) }
        fails("rejected") { r.generate(listOf(ChatTurn("user", "")), 10) }
        fails("rejected") { r.generate(listOf(ChatTurn("user", "x".repeat(PromptBuilder.MAX_CHARS + 1))), 10) }
    }

    @Test
    fun missingFilesAndUnlinkedRuntimeFailClearly() {
        fails("model_missing") { LlamaRunner(ModelStore(File(tmp.root, "none"))).generate(turns, 10) }
        fails("not_ready") { LlamaRunner(installed()).generate(turns, 10) }
    }

    @Test
    fun onlyOneGenerationAtATimeAndCancelWorks() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val stopped = AtomicReference<Boolean>()
        val engine = object : LlmEngine {
            override fun load(modelPath: String, tokenizerPath: String) {}
            override fun generate(prompt: String, maxTokens: Int, shouldStop: () -> Boolean): String {
                entered.countDown()
                release.await(5, TimeUnit.SECONDS)
                stopped.set(shouldStop())
                return "done"
            }
            override fun close() {}
        }
        val runner = LlamaRunner(installed(), engine)
        val result = AtomicReference<String>()
        val t = Thread { result.set(runner.generate(turns, 10)) }
        t.start()
        assertTrue(entered.await(5, TimeUnit.SECONDS))
        fails("busy") { runner.generate(turns, 10) }
        runner.cancel()
        release.countDown()
        t.join(5000)
        assertEquals("done", result.get())
        assertEquals(true, stopped.get())
        assertEquals("done", runner.generate(turns, 10))
    }

    @Test
    fun singleFlightReleasesAfterFailure() {
        val f = SingleFlight()
        try {
            f.run { throw IllegalStateException("x") }
        } catch (e: IllegalStateException) {
        }
        assertTrue(f.tryAcquire())
        assertFalse(f.tryAcquire())
        f.release()
        assertEquals(5, f.run { 5 })
    }

    @Test
    fun peakMemoryIsParsed() {
        assertEquals(123456L, HealthParse.vmHwmKb("Name:\tapp\nVmPeak:\t 9 kB\nVmHWM:\t  123456 kB\nVmRSS:\t 1 kB\n"))
        assertNull(HealthParse.vmHwmKb("VmRSS: 5 kB"))
        assertNull(HealthParse.vmHwmKb(""))
    }

    @Test
    fun shaHelpers() {
        assertTrue(Sha256.isValidHex("0".repeat(64)))
        for (bad in listOf("", "0".repeat(63), "0".repeat(65), "G".repeat(64), "A".repeat(64))) assertFalse(bad, Sha256.isValidHex(bad))
        assertEquals("00ff10", Sha256.hex(byteArrayOf(0, -1, 16)))
    }
}
