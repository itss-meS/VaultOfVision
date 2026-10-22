package ai.redesignededge.engine

object AssetNames {
    val readable: Set<String> = setOf(
        "knowledge/release_ed25519.pub",
        "knowledge/banned_pesticides.json",
        "knowledge/banned_pesticides.json.sig",
        "knowledge/dosage_table.json",
        "knowledge/dosage_table.json.sig",
        "knowledge/chunks.jsonl",
        "knowledge/model_manifest.json",
        "knowledge/model_manifest.json.sig",
    )

    fun isReadable(name: String): Boolean = name in readable
}

object KvKeys {
    const val MAX_VALUE_CHARS = 262_144
    private val ID = Regex("[A-Za-z0-9_-]{1,64}")

    fun isValidKey(key: String): Boolean {
        if (key == "profiles") return true
        val colon = key.indexOf(':')
        if (colon < 0) return false
        val prefix = key.substring(0, colon)
        if (prefix != "profile" && prefix != "cases") return false
        return ID.matches(key.substring(colon + 1))
    }

    fun isValidValue(value: String): Boolean = value.length <= MAX_VALUE_CHARS
}

enum class VisionKind(val wire: String) {
    DISEASE("disease"),
    PEST("pest"),
    ROUTER("router"),
}

class VisionModelSpec(val id: String, val kind: VisionKind)

object VisionModels {
    private val specs: Map<String, VisionModelSpec> = listOf(
        VisionModelSpec("plantvillage-all", VisionKind.DISEASE),
        VisionModelSpec("cassava", VisionKind.DISEASE),
        VisionModelSpec("ip102", VisionKind.PEST),
        VisionModelSpec("router", VisionKind.ROUTER),
    ).associateBy { it.id }

    private val aliases: Map<String, String> = mapOf("plantvillage" to "plantvillage-all")

    fun resolve(raw: String): VisionModelSpec? = specs[aliases[raw] ?: raw]

    fun classifier(routerLabel: String): VisionModelSpec? {
        val spec = specs[routerLabel] ?: return null
        return if (spec.kind == VisionKind.ROUTER) null else spec
    }

    val router: VisionModelSpec = specs.getValue("router")
}

object ModelNames {
    const val LLM = "llama32_1b_int4.pte"
    const val TOKENIZER = "tokenizer.model"
    val allowed: Set<String> = setOf(LLM, TOKENIZER)

    fun isAllowed(name: String): Boolean = name in allowed
}
