package ai.redesignededge.engine

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class DownloadTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: HttpServer
    private val body = ByteArray(300_000) { (it * 31 + 7).toByte() }
    private val goodSha = MessageDigest.getInstance("SHA-256").digest(body).joinToString("") { "%02x".format(it) }
    private val hits = AtomicInteger(0)
    private val ranges = ArrayList<String?>()
    private var base = ""

    private val relaxed get() = DownloadPolicy(setOf("127.0.0.1"), false, false, 3)

    private fun serve(ex: HttpExchange, data: ByteArray) {
        val range = ex.requestHeaders.getFirst("Range")
        synchronized(ranges) { ranges.add(range) }
        if (range != null && range.startsWith("bytes=")) {
            val start = range.removePrefix("bytes=").removeSuffix("-").toInt()
            if (start >= data.size) {
                ex.sendResponseHeaders(416, -1)
            } else {
                ex.responseHeaders.add("Content-Range", "bytes $start-${data.size - 1}/${data.size}")
                ex.sendResponseHeaders(206, (data.size - start).toLong())
                ex.responseBody.use { it.write(data, start, data.size - start) }
            }
        } else {
            ex.sendResponseHeaders(200, data.size.toLong())
            ex.responseBody.use { it.write(data) }
        }
    }

    @Before
    fun start() {
        server = HttpServer.create(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0)
        server.createContext("/ok") { ex -> hits.incrementAndGet(); serve(ex, body) }
        server.createContext("/bad") { ex -> serve(ex, ByteArray(body.size) { 1 }) }
        server.createContext("/short") { ex -> serve(ex, body.copyOf(1000)) }
        server.createContext("/big") { ex -> serve(ex, body + ByteArray(10)) }
        server.createContext("/r1") { ex -> ex.responseHeaders.add("Location", "/r2"); ex.sendResponseHeaders(302, -1) }
        server.createContext("/r2") { ex -> ex.responseHeaders.add("Location", "/r3"); ex.sendResponseHeaders(302, -1) }
        server.createContext("/r3") { ex -> ex.responseHeaders.add("Location", "/ok"); ex.sendResponseHeaders(302, -1) }
        server.createContext("/r4") { ex -> ex.responseHeaders.add("Location", "/r1"); ex.sendResponseHeaders(302, -1) }
        server.createContext("/evil") { ex -> ex.responseHeaders.add("Location", "http://10.0.0.1/x"); ex.sendResponseHeaders(302, -1) }
        server.createContext("/missing") { ex -> ex.sendResponseHeaders(404, -1) }
        server.start()
        base = "http://127.0.0.1:${server.address.port}"
    }

    @After
    fun stop() {
        server.stop(0)
    }

    private fun downloader(store: ModelStore, allowed: Boolean = true) = ModelDownloader(store, relaxed, { allowed })

    private fun req(path: String, sha: String = goodSha, size: Long = body.size.toLong(), name: String = ModelNames.TOKENIZER) =
        DownloadRequest(name, base + path, sha, size)

    private fun fails(code: String, block: () -> Unit) {
        try {
            block()
            fail("expected $code")
        } catch (e: EngineFault) {
            assertEquals(code, e.code)
        }
    }

    private fun run(d: ModelDownloader, vararg r: DownloadRequest, cancel: () -> Boolean = { false }) =
        d.download(r.toList(), { _, _, _ -> }, cancel)

    @Test
    fun goodFileIsStoredVerifiedAndReused() {
        val store = ModelStore(File(tmp.root, "m"))
        val d = downloader(store)
        run(d, req("/ok"))
        val s = store.status(ModelNames.TOKENIZER, true)
        assertTrue(s.present && s.verified)
        assertEquals(goodSha, s.sha256)
        assertFalse(store.partFile(ModelNames.TOKENIZER).exists())
        val before = hits.get()
        run(d, req("/ok"))
        assertEquals(before, hits.get())
        assertTrue(ModelStore(File(tmp.root, "m")).status(ModelNames.TOKENIZER, false).verified)
    }

    @Test
    fun wrongHashIsRejectedAndDeleted() {
        val store = ModelStore(File(tmp.root, "m"))
        fails("hash_mismatch") { run(downloader(store), req("/bad")) }
        assertFalse(store.file(ModelNames.TOKENIZER).exists())
        assertFalse(store.partFile(ModelNames.TOKENIZER).exists())
        assertFalse(store.status(ModelNames.TOKENIZER, false).present)
    }

    @Test
    fun wrongSizeIsRejected() {
        val store = ModelStore(File(tmp.root, "m"))
        fails("download_failed") { run(downloader(store), req("/short")) }
        fails("download_failed") { run(downloader(store), req("/big")) }
        assertFalse(store.file(ModelNames.TOKENIZER).exists())
    }

    @Test
    fun partialFileResumesWithRange() {
        val store = ModelStore(File(tmp.root, "m"))
        store.dir.mkdirs()
        store.partFile(ModelNames.TOKENIZER).writeBytes(body.copyOf(100_000))
        run(downloader(store), req("/ok"))
        assertTrue(store.status(ModelNames.TOKENIZER, true).verified)
        assertTrue(synchronized(ranges) { ranges.contains("bytes=100000-") })
    }

    @Test
    fun corruptPartialIsDiscardedByHashCheck() {
        val store = ModelStore(File(tmp.root, "m"))
        store.dir.mkdirs()
        store.partFile(ModelNames.TOKENIZER).writeBytes(ByteArray(100_000) { 9 })
        fails("hash_mismatch") { run(downloader(store), req("/ok")) }
        assertFalse(store.partFile(ModelNames.TOKENIZER).exists())
        run(downloader(store), req("/ok"))
        assertTrue(store.status(ModelNames.TOKENIZER, true).verified)
    }

    @Test
    fun redirectsAreFollowedUpToThreeHops() {
        val store = ModelStore(File(tmp.root, "m"))
        run(downloader(store), req("/r1"))
        assertTrue(store.status(ModelNames.TOKENIZER, true).verified)
        val other = ModelStore(File(tmp.root, "n"))
        fails("download_failed") { run(downloader(other), req("/r4")) }
    }

    @Test
    fun redirectToDisallowedHostIsRefused() {
        val store = ModelStore(File(tmp.root, "m"))
        fails("rejected") { run(downloader(store), req("/evil")) }
        assertFalse(store.file(ModelNames.TOKENIZER).exists())
    }

    @Test
    fun errorsAndMeteredNetworks() {
        val store = ModelStore(File(tmp.root, "m"))
        fails("download_failed") { run(downloader(store), req("/missing")) }
        fails("network") { run(downloader(store, allowed = false), req("/ok")) }
        assertEquals(0, hits.get())
    }

    @Test
    fun cancelKeepsPartialForResume() {
        val store = ModelStore(File(tmp.root, "m"))
        fails("cancelled") { run(downloader(store), req("/ok"), cancel = { true }) }
        assertFalse(store.file(ModelNames.TOKENIZER).exists())
    }

    @Test
    fun badRequestsAreRejectedBeforeAnyNetworkUse() {
        val store = ModelStore(File(tmp.root, "m"))
        val d = downloader(store)
        fails("rejected") { run(d, req("/ok", name = "evil.bin")) }
        fails("rejected") { run(d, req("/ok", sha = "ZZ")) }
        fails("rejected") { run(d, req("/ok", sha = goodSha.uppercase().take(10))) }
        fails("rejected") { run(d, req("/ok", size = 0)) }
        fails("rejected") { run(d, req("/ok", size = ModelDownloader.MAX_FILE_BYTES + 1)) }
        fails("rejected") { run(d, req("/ok"), req("/ok")) }
        fails("rejected") { d.download(emptyList(), { _, _, _ -> }, { false }) }
        fails("rejected") { run(d, DownloadRequest(ModelNames.TOKENIZER, "http://example.com/x", goodSha, 5)) }
        assertEquals(0, hits.get())
    }

    @Test
    fun productionPolicyAllowsOnlyListedHttpsHosts() {
        val p = DownloadPolicy.PRODUCTION.let { DownloadPolicy(it.hosts, it.requireHttps, false, it.maxRedirects) }
        p.parse("https://github.com/o/r/releases/download/v1/tokenizer.model")
        p.parse("https://release-assets.githubusercontent.com/a/b")
        p.parse("https://objects.githubusercontent.com/a/b")
        val bad = listOf(
            "http://github.com/x", "https://github.com:8443/x", "https://evil.com/x", "https://github.com.evil.com/x",
            "https://evilgithub.com/x", "https://user@github.com/x", "https://evil.com\\@github.com/x", "https://127.0.0.1/x",
            "https://[::1]/x", "ftp://github.com/x", "file:///etc/passwd", "https://github.com/x y", "https://github.com/x\r\nHost: a",
            "https://github.com./x", "", "https://github.com/\u00e9", "https://sub.github.com/x", "javascript:alert(1)",
        )
        for (u in bad) {
            try {
                p.parse(u)
                fail("expected rejection of $u")
            } catch (e: EngineFault) {
                assertEquals(u, "rejected", e.code)
            }
        }
        try {
            p.parse("https://github.com/" + "a".repeat(DownloadPolicy.MAX_URL_CHARS))
            fail("expected rejection")
        } catch (e: EngineFault) {
            assertEquals("rejected", e.code)
        }
        assertEquals(URL("https://github.com/a/b").host, p.resolve(URL("https://github.com/a"), "/a/b").host)
        try {
            p.resolve(URL("https://github.com/a"), "https://evil.com/")
            fail("expected rejection")
        } catch (e: EngineFault) {
            assertEquals("rejected", e.code)
        }
    }

    @Test
    fun privateAddressesAreBlocked() {
        fun a(vararg v: Int) = InetAddress.getByAddress(ByteArray(v.size) { v[it].toByte() })
        val blocked = listOf(
            a(127, 0, 0, 1), a(10, 1, 2, 3), a(172, 16, 0, 1), a(192, 168, 1, 1), a(169, 254, 169, 254), a(0, 0, 0, 0),
            a(100, 64, 0, 1), a(100, 127, 255, 255), a(224, 0, 0, 1), a(255, 255, 255, 255), a(240, 0, 0, 1),
            a(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1), a(0xFC, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1),
            a(0xFD, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1), a(0xFE, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1),
        )
        for (x in blocked) assertTrue(x.toString(), DownloadPolicy.isBlockedAddress(x))
        val open = listOf(a(140, 82, 112, 3), a(185, 199, 108, 133), a(100, 63, 0, 1), a(100, 128, 0, 1), a(8, 8, 8, 8))
        for (x in open) assertFalse(x.toString(), DownloadPolicy.isBlockedAddress(x))
    }

    @Test
    fun networkSecurityConfigMatchesPolicyHosts() {
        val f = File("src/main/res/xml/network_security_config.xml")
        if (!f.isFile) return
        val hosts = Regex("<domain[^>]*>([^<]+)</domain>").findAll(f.readText()).map { it.groupValues[1].trim() }.toSet()
        assertEquals(DownloadPolicy.PRODUCTION.hosts, hosts)
        assertTrue(f.readText().contains("cleartextTrafficPermitted=\"false\""))
        assertFalse(f.readText().contains("cleartextTrafficPermitted=\"true\""))
    }
}
