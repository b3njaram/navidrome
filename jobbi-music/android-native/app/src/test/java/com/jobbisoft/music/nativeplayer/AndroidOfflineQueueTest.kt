package com.jobbisoft.music.nativeplayer

import android.app.DownloadManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidOfflineQueueTest {
    @Test fun pendingTransfersAreNotDuplicatedBeforeFileExists(){
        assertFalse(shouldEnqueueDownload(DownloadManager.STATUS_PENDING,false))
        assertFalse(shouldEnqueueDownload(DownloadManager.STATUS_RUNNING,false))
        assertFalse(shouldEnqueueDownload(DownloadManager.STATUS_PAUSED,false))
    }
    @Test fun removingOneOfflinePlaylistPreservesSharedRecordings(){
        val first=setOf("a","b","shared")
        val second=setOf("shared","c")
        assertTrue(offlineSongsSafeToDelete(first,second)==setOf("a","b"))
        assertTrue(offlineSongsSafeToDelete(second,first)==setOf("c"))
    }
    @Test fun explicitIndividualAndFavoritesClaimsKeepSongs(){
        val playlist=setOf("single","favorite","exclusive")
        val protected=setOf("single","favorite")
        assertTrue(offlineSongsSafeToDelete(playlist,protected)==setOf("exclusive"))
        assertTrue(offlineSongsSafeToDelete(emptySet(),protected).isEmpty())
    }
    @Test fun failedAndMissingCompletedFilesCanBeRetried(){
        assertTrue(shouldEnqueueDownload(DownloadManager.STATUS_FAILED,false))
        assertTrue(shouldEnqueueDownload(DownloadManager.STATUS_SUCCESSFUL,false))
        assertTrue(shouldEnqueueDownload(null,false))
        assertFalse(shouldEnqueueDownload(DownloadManager.STATUS_SUCCESSFUL,true))
    }
    @Test fun completedOfflineFilesRemainPlayableAfterSystemDownloadHistoryIsRemoved(){
        val done=DownloadManager.STATUS_SUCCESSFUL
        val failed=DownloadManager.STATUS_FAILED
        // Android may prune its DownloadManager record while retaining the
        // perfectly valid, app-private audio file on disk.
        assertTrue(isVerifiedOfflineRecording(done,failed,8000L,8000L))
        assertTrue(isVerifiedOfflineRecording(done,null,8000L,0L))
        assertTrue(isVerifiedOfflineRecording(failed,failed,8000L,8000L))
        assertTrue(isVerifiedOfflineRecording(DownloadManager.STATUS_PENDING,
            done,8000L,0L))
    }
    @Test fun partialTransfersNeverPretendToBeCompletedOfflineMusic(){
        val pending=DownloadManager.STATUS_PENDING
        val failed=DownloadManager.STATUS_FAILED
        assertFalse(isVerifiedOfflineRecording(pending,pending,100L,8000L))
        assertFalse(isVerifiedOfflineRecording(failed,null,100L,8000L))
        assertFalse(isVerifiedOfflineRecording(pending,null,100L,0L))
        assertFalse(isVerifiedOfflineRecording(pending,null,0L,0L))
        assertFalse(isVerifiedOfflineRecording(DownloadManager.STATUS_SUCCESSFUL,
            null,0L,8000L))
    }
}
