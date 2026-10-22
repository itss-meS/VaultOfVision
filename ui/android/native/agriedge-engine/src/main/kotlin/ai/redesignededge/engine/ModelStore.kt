package ai.redesignededge.engine

import java.io.File

class FileStatus(
    val name: String,
    val present: Boolean,
    val size: Long,
    val sha256: String?,
    val verified: Boolean,
)

class ModelStore(val dir: File) {
    fun file(name: String): File {
        if (!ModelNames.isAllowed(name)) throw EngineFault("rejected", "file name not allowed")
        return File(dir, name)
    }

    fun partFile(name: String): File = File(dir, "$name.part")

    private fun metaFile(name: String): File = File(dir, "$name.meta")

    fun writeMeta(name: String, sha256: String, size: Long) {
        metaFile(name).writeText("$sha256\n$size\n")
    }

    fun deleteAll(name: String) {
        file(name).delete()
        partFile(name).delete()
        metaFile(name).delete()
    }

    private fun readMeta(name: String): Pair<String, Long>? {
        val f = metaFile(name)
        if (!f.isFile) return null
        val lines = try {
            f.readText().split('\n')
        } catch (e: java.io.IOException) {
            return null
        }
        if (lines.size < 2) return null
        val sha = lines[0].trim()
        val size = lines[1].trim().toLongOrNull() ?: return null
        if (!Sha256.isValidHex(sha)) return null
        return Pair(sha, size)
    }

    fun status(name: String, recheck: Boolean): FileStatus {
        val f = file(name)
        if (!f.isFile) return FileStatus(name, false, 0L, null, false)
        val meta = readMeta(name)
        val length = f.length()
        var verified = meta != null && meta.second == length
        if (verified && recheck) verified = Sha256.ofFile(f) == meta!!.first
        return FileStatus(name, true, length, meta?.first, verified)
    }

    fun isCurrent(name: String, sha256: String, size: Long): Boolean {
        val f = file(name)
        val meta = readMeta(name) ?: return false
        return f.isFile && meta.first == sha256 && meta.second == size && f.length() == size
    }

    fun allStatuses(recheck: Boolean): List<FileStatus> = ModelNames.allowed.sorted().map { status(it, recheck) }
}
