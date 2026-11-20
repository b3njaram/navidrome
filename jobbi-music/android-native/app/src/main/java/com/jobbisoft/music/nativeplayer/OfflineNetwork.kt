package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * A device with no validated internet cannot sign into the NAS, and should
 * not spend 12+ seconds attempting DNS before unlocking downloaded music.
 *
 * This check is deliberately conservative. False negatives merely open the
 * user's saved offline library; they can explicitly reconnect when online.
 * All credentials remain encrypted in Android Keystore, never in this object.
 */
internal object OfflineNetwork {
    // Test-only switch for deterministic cold-start tests. Never consulted in
    // release builds, and not user- or network-controllable.
    @Volatile internal var debugOnlineOverride:Boolean?=null

    fun isOnline(context:Context):Boolean {
        if(BuildConfig.DEBUG)debugOnlineOverride?.let{return it}
        return runCatching {
        val manager=context.getSystemService(Context.CONNECTIVITY_SERVICE)
            as? ConnectivityManager ?: return@runCatching true
        val active=manager.activeNetwork ?:return@runCatching false
        val capabilities=manager.getNetworkCapabilities(active)
            ?:return@runCatching false
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        }.getOrDefault(true)
    }
}
