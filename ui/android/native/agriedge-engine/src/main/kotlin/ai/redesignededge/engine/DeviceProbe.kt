package ai.redesignededge.engine

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import java.io.File
import java.io.IOException

class DeviceProbe(context: Context) {
    private val appContext = context.applicationContext

    fun peakRssKb(): Long? {
        return try {
            val text = File("/proc/self/status").bufferedReader().use { it.readText() }
            HealthParse.vmHwmKb(text)
        } catch (e: IOException) {
            null
        }
    }

    fun temperatureC(): Double? {
        val intent: Intent = appContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
        val tenths = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        return if (tenths == Int.MIN_VALUE) null else tenths / 10.0
    }

    fun onUnmeteredWifi(): Boolean {
        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        val link = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        return link && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }
}
