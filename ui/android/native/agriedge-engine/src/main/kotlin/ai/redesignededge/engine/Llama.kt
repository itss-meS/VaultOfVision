package ai.redesignededge.engine

import java.util.concurrent.atomic.AtomicBoolean

class ChatTurn(val role: String, val content: String)

object PromptBuilder {
    const val MAX_CHARS = 12_000
    const val MAX_TOKENS = 1024
    const val BOS = "<|begin_of_text|>"

    fun validate(messages: List<ChatTurn>, maxTokens: Int) {
        if (messages.isEmpty() || messages.size > 16) throw EngineFault("rejected", "invalid prompt")
        if (maxTokens < 1 || maxTokens > MAX_TOKENS) throw EngineFault("rejected", "invalid token limit")
        var total = 0
        for (m in messages) {
            if (m.role != "system" && m.role != "user") throw EngineFault("rejected", "invalid prompt")
            if (m.content.isEmpty()) throw EngineFault("rejected", "invalid prompt")
            total += m.content.length
        }
        if (total > MAX_CHARS) throw EngineFault("rejected", "prompt too long")
    }

    fun llama3(messages: List<ChatTurn>, includeBos: Boolean): String {
        val sb = StringBuilder()
        if (includeBos) sb.append(BOS)
        for (m in messages) {
            sb.append("<|start_header_id|>").append(m.role).append("<|end_header_id|>\n\n")
            sb.append(m.content).append("<|eot_id|>")
        }
        sb.append("<|start_header_id|>assistant<|end_header_id|>\n\n")
        return sb.toString()
    }
}

interface LlmEngine : AutoCloseable {
    fun load(modelPath: String, tokenizerPath: String)

    fun generate(prompt: String, maxTokens: Int, shouldStop: () -> Boolean): String
}

class NotLinkedLlmEngine : LlmEngine {
    override fun load(modelPath: String, tokenizerPath: String) {
        throw EngineFault("not_ready", "language model runtime is not linked")
    }

    override fun generate(prompt: String, maxTokens: Int, shouldStop: () -> Boolean): String {
        throw EngineFault("not_ready", "language model runtime is not linked")
    }

    override fun close() {}
}

class LlamaRunner(
    private val store: ModelStore,
    private val engine: LlmEngine = NotLinkedLlmEngine(),
    private val includeBos: Boolean = false,
) {
    private val flight = SingleFlight()
    private val stop = AtomicBoolean(false)

    fun modelPresent(): Boolean =
        store.status(ModelNames.LLM, false).verified && store.status(ModelNames.TOKENIZER, false).verified

    fun generate(messages: List<ChatTurn>, maxTokens: Int): String {
        PromptBuilder.validate(messages, maxTokens)
        return flight.run {
            stop.set(false)
            if (!modelPresent()) throw EngineFault("model_missing", "language model files are not installed")
            val prompt = PromptBuilder.llama3(messages, includeBos)
            engine.load(store.file(ModelNames.LLM).absolutePath, store.file(ModelNames.TOKENIZER).absolutePath)
            engine.generate(prompt, maxTokens) { stop.get() }
        }
    }

    fun cancel() {
        stop.set(true)
    }

    fun close() {
        engine.close()
    }
}
