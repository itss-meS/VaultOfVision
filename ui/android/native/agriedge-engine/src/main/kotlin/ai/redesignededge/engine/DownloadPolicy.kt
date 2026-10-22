package ai.redesignededge.engine

import java.net.InetAddress
import java.net.MalformedURLException
import java.net.URL
import java.net.UnknownHostException

class DownloadPolicy(
    val hosts: Set<String>,
    val requireHttps: Boolean,
    val blockPrivateAddresses: Boolean,
    val maxRedirects: Int,
) {
    fun parse(raw: String): URL {
        if (raw.isEmpty() || raw.length > MAX_URL_CHARS) throw denied()
        for (ch in raw) {
            if (ch.code <= 0x20 || ch.code >= 0x7F) throw denied()
        }
        val url = try {
            URL(raw)
        } catch (e: MalformedURLException) {
            throw denied()
        }
        check(url)
        return url
    }

    fun resolve(base: URL, location: String): URL {
        if (location.isEmpty() || location.length > MAX_URL_CHARS) throw denied()
        for (ch in location) {
            if (ch.code <= 0x20 || ch.code >= 0x7F) throw denied()
        }
        val url = try {
            URL(base, location)
        } catch (e: MalformedURLException) {
            throw denied()
        }
        check(url)
        return url
    }

    fun check(url: URL) {
        val protocol = url.protocol.lowercase()
        if (requireHttps) {
            if (protocol != "https") throw denied()
            if (url.port != -1 && url.port != 443) throw denied()
        } else if (protocol != "https" && protocol != "http") {
            throw denied()
        }
        if (url.userInfo != null) throw denied()
        val host = url.host.lowercase()
        if (host.isEmpty() || host !in hosts) throw denied()
        if (blockPrivateAddresses) {
            val addresses = try {
                InetAddress.getAllByName(host)
            } catch (e: UnknownHostException) {
                throw EngineFault("download_failed", "download host not reachable")
            }
            for (a in addresses) {
                if (isBlockedAddress(a)) throw denied()
            }
        }
    }

    private fun denied(): EngineFault = EngineFault("rejected", "download address not allowed")

    companion object {
        const val MAX_URL_CHARS = 2048

        val PRODUCTION = DownloadPolicy(
            hosts = setOf(
                "github.com",
                "objects.githubusercontent.com",
                "release-assets.githubusercontent.com",
            ),
            requireHttps = true,
            blockPrivateAddresses = true,
            maxRedirects = 3,
        )

        fun isBlockedAddress(a: InetAddress): Boolean {
            if (a.isAnyLocalAddress || a.isLoopbackAddress || a.isLinkLocalAddress) return true
            if (a.isSiteLocalAddress || a.isMulticastAddress) return true
            val b = a.address
            if (b.size == 4) {
                val b0 = b[0].toInt() and 0xFF
                val b1 = b[1].toInt() and 0xFF
                if (b0 == 0) return true
                if (b0 == 100 && b1 in 64..127) return true
                if (b0 >= 240) return true
            } else if (b.size == 16) {
                if ((b[0].toInt() and 0xFE) == 0xFC) return true
            }
            return false
        }
    }
}
