package com.jobbisoft.music.nativeplayer

/** A playback is counted after half its duration (up to 4 min). Seeking does
 * not count: callers must pass observed milliseconds of actual audible play.
 * Unknown duration uses 30 seconds as a conservative threshold.
 */
internal fun qualifiedListenThresholdMs(durationMs:Long):Long =
    if(durationMs>0) minOf(240_000L,maxOf(5_000L,durationMs/2L)) else 30_000L

internal fun isQualifiedListen(durationMs:Long,listenedMs:Long):Boolean =
    listenedMs>=qualifiedListenThresholdMs(durationMs)
