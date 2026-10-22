package ai.redesignededge.engine

object HealthParse {
    private val HWM = Regex("^VmHWM:\\s+(\\d+)\\s+kB\\s*$", RegexOption.MULTILINE)

    fun vmHwmKb(status: String): Long? = HWM.find(status)?.groupValues?.get(1)?.toLongOrNull()
}
