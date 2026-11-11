package com.jobbisoft.music.nativeplayer

/** Only upcoming tracks may be moved or removed; a currently playing track
 * must not lose its Media3 position or be skipped accidentally.
 * Duplicate song IDs are allowed, because listeners can queue repeats.
 */
internal object UpcomingQueuePolicy {
    fun canMove(current:Int,total:Int,from:Int,to:Int):Boolean =
        current>=0 && from>current && to>current &&
            from in 0 until total && to in 0 until total && from!=to
    fun canRemove(current:Int,total:Int,at:Int):Boolean =
        current>=0 && at>current && at in 0 until total
    fun nextInsertIndex(current:Int,total:Int):Int =
        (current+1).coerceIn(0,total)
    fun pendingCount(current:Int,total:Int):Int =
        (total-current-1).coerceAtLeast(0)
}
