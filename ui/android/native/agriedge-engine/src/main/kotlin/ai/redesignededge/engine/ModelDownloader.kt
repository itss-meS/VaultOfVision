package ai.redesignededge.engine

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class DownloadRequest(val name: String, val url: String, val sha256: String, val size: Long)

class ModelDownloader(
    private val store: ModelStore,
    private val policy: DownloadPolicy,
    private val networkAllowed: () -> Boolean,
    private val connect: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection },
) {
    fun validate(requests: List<DownloadRequest>): List<DownloadRequest> {
        if (requests.isEmpty() || requests.size > ModelNames.allowed.size) throw EngineFault("rejected", "invalid file list")
        val seen = HashSet<String>()
        val out = ArrayList<DownloadRequest>()
        for (r in requests) {
            if (!ModelNames.isAllowed(r.name) || !seen.add(r.name)) throw EngineFault("rejected", "invalid file list")
            val sha = r.sha256.lowercase()
            if (!Sha256.isValidHex(sha)) throw EngineFault("rejected", "invalid file list")
            if (r.size < 1L || r.size > MAX_FILE_BYTES) throw EngineFault("rejected", "invalid file list")
            policy.parse(r.url)
            out.add(DownloadRequest(r.name, r.url, sha, r.size))
        }
        return out
    }

    fun download(
        requests: List<DownloadRequest>,
        onProgress: (name: String, received: Long, total: Long) -> Unit,
        cancelled: () -> Boolean,
    ) {
        val checked = validate(requests)
        if (!networkAllowed()) throw EngineFault("network", "connect to an unmetered Wi-Fi network to download")
        if (!store.dir.isDirectory && !store.dir.mkdirs()) throw EngineFault("download_failed", "storage unavailable")
        for (r in checked) {
            if (store.isCurrent(r.name, r.sha256, r.size)) {
                onProgress(r.name, r.size, r.size)
                continue
            }
            fetch(r, onProgress, cancelled)
        }
    }

    private fun fetch(
        r: DownloadRequest,
        onProgress: (String, Long, Long) -> Unit,
        cancelled: () -> Boolean,
    ) {
        val part = store.partFile(r.name)
        var offset = if (part.isFile) part.length() else 0L
        if (offset > r.size) {
            part.delete()
            offset = 0L
        }
        if (offset < r.size) {
            transfer(r, part, offset, true, onProgress, cancelled)
        }
        val have = part.length()
        if (have < r.size) throw EngineFault("download_failed", "download interrupted")
        if (have > r.size) {
            part.delete()
            throw EngineFault("download_failed", "downloaded file has the wrong size")
        }
        val actual = Sha256.ofFile(part)
        if (actual != r.sha256) {
            part.delete()
            throw EngineFault("hash_mismatch", "downloaded file failed verification")
        }
        val dest = store.file(r.name)
        if (dest.exists() && !dest.delete()) throw EngineFault("download_failed", "storage unavailable")
        if (!part.renameTo(dest)) throw EngineFault("download_failed", "storage unavailable")
        store.writeMeta(r.name, r.sha256, r.size)
        onProgress(r.name, r.size, r.size)
    }

    private fun transfer(
        r: DownloadRequest,
        part: File,
        offset: Long,
        mayRetryFresh: Boolean,
        onProgress: (String, Long, Long) -> Unit,
        cancelled: () -> Boolean,
    ) {
        val conn = open(policy.parse(r.url), offset)
        try {
            val code = conn.responseCode
            var append = false
            var received = 0L
            if (code == 206) {
                val range = conn.getHeaderField("Content-Range") ?: ""
                val m = CONTENT_RANGE.matchEntire(range.trim()) ?: throw EngineFault("download_failed", "unexpected server response")
                val start = m.groupValues[1].toLongOrNull()
                val end = m.groupValues[2].toLongOrNull()
                val total = m.groupValues[3].toLongOrNull()
                if (start != offset || total != r.size || end != r.size - 1) {
                    throw EngineFault("download_failed", "unexpected server response")
                }
                append = true
                received = offset
            } else if (code == 200) {
                val length = conn.contentLengthLong
                if (length != -1L && length != r.size) throw EngineFault("download_failed", "unexpected file size")
            } else if (code == 416 && mayRetryFresh && offset > 0) {
                part.delete()
                conn.disconnect()
                transfer(r, part, 0L, false, onProgress, cancelled)
                return
            } else {
                throw EngineFault("download_failed", "download failed")
            }
            if (!append && part.exists() && !part.delete()) throw EngineFault("download_failed", "storage unavailable")
            conn.inputStream.use { input ->
                FileOutputStream(part, append).use { out ->
                    val buf = ByteArray(BUFFER)
                    while (true) {
                        if (cancelled()) throw EngineFault("cancelled", "download cancelled")
                        val n = input.read(buf)
                        if (n < 0) break
                        received += n
                        if (received > r.size) {
                            out.close()
                            part.delete()
                            throw EngineFault("download_failed", "downloaded file is larger than expected")
                        }
                        out.write(buf, 0, n)
                        onProgress(r.name, received, r.size)
                    }
                }
            }
        } catch (e: IOException) {
            throw EngineFault("download_failed", "download interrupted")
        } finally {
            conn.disconnect()
        }
    }

    private fun open(start: URL, offset: Long): HttpURLConnection {
        var current = start
        var hops = 0
        while (true) {
            policy.check(current)
            val conn = connect(current)
            try {
                conn.instanceFollowRedirects = false
                conn.requestMethod = "GET"
                conn.connectTimeout = CONNECT_TIMEOUT_MS
                conn.readTimeout = READ_TIMEOUT_MS
                conn.useCaches = false
                conn.setRequestProperty("Accept-Encoding", "identity")
                if (offset > 0) conn.setRequestProperty("Range", "bytes=$offset-")
                val code = conn.responseCode
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    val location = conn.getHeaderField("Location")
                    conn.disconnect()
                    if (location == null || hops >= policy.maxRedirects) throw EngineFault("download_failed", "too many redirects")
                    current = policy.resolve(current, location)
                    hops++
                    continue
                }
                return conn
            } catch (e: IOException) {
                conn.disconnect()
                throw EngineFault("download_failed", "download interrupted")
            }
        }
    }

    companion object {
        const val MAX_FILE_BYTES = 2_500_000_000L
        private const val BUFFER = 65_536
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000
        private val CONTENT_RANGE = Regex("bytes (\\d+)-(\\d+)/(\\d+)")
    }
}
