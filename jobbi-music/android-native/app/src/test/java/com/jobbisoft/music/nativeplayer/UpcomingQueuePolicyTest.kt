package com.jobbisoft.music.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpcomingQueuePolicyTest {
    @Test fun playNextIsAlwaysAfterCurrentEvenWithDuplicates(){
        assertEquals(1,UpcomingQueuePolicy.nextInsertIndex(0,4))
        assertEquals(4,UpcomingQueuePolicy.nextInsertIndex(3,4))
        assertEquals(0,UpcomingQueuePolicy.nextInsertIndex(-1,0))
    }
    @Test fun canOnlyReorderUpcomingTracks(){
        assertTrue(UpcomingQueuePolicy.canMove(0,5,4,1))
        assertTrue(UpcomingQueuePolicy.canMove(0,5,1,4))
        assertFalse(UpcomingQueuePolicy.canMove(1,5,1,3))
        assertFalse(UpcomingQueuePolicy.canMove(1,5,3,1))
        assertFalse(UpcomingQueuePolicy.canMove(2,5,3,5))
        assertFalse(UpcomingQueuePolicy.canMove(2,5,3,3))
    }
    @Test fun currentAndPlayedTracksCannotBeRemovedByQueueControls(){
        assertTrue(UpcomingQueuePolicy.canRemove(0,3,1))
        assertFalse(UpcomingQueuePolicy.canRemove(0,3,0))
        assertFalse(UpcomingQueuePolicy.canRemove(1,3,0))
        assertFalse(UpcomingQueuePolicy.canRemove(1,3,3))
        assertEquals(2,UpcomingQueuePolicy.pendingCount(1,4))
        assertEquals(0,UpcomingQueuePolicy.pendingCount(3,4))
    }
}
