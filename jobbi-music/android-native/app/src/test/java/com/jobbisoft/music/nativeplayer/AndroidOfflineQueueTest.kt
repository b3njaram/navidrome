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
    @Test fun failedAndMissingCompletedFilesCanBeRetried(){
        assertTrue(shouldEnqueueDownload(DownloadManager.STATUS_FAILED,false))
        assertTrue(shouldEnqueueDownload(DownloadManager.STATUS_SUCCESSFUL,false))
        assertTrue(shouldEnqueueDownload(null,false))
        assertFalse(shouldEnqueueDownload(DownloadManager.STATUS_SUCCESSFUL,true))
    }
}
