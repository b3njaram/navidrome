package com.jobbisoft.music.nativeplayer

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InvidiousParserTest {
    @Test fun acceptsValidInvidiousMetadataAndPreservesNonEnglishTitles() {
        val payload=JSONObject("""{
          "results":[
            {"videoId":"AbCdEfGh123","title":"Кино — Группа крови",
             "artist":"Кино","duration":286,
             "url":"https://yt.jobbisoft.com.mx/watch?v=AbCdEfGh123"}
          ]
        }""")
        val videos=parseInvidiousVideos(payload)
        assertEquals(1,videos.size)
        assertEquals("Кино — Группа крови",videos[0].title)
        assertEquals("Кино",videos[0].artist)
        assertEquals(286L,videos[0].durationSeconds)
    }
    @Test fun rejectsUnsafeLinksAndInvalidIds() {
        val payload=JSONObject("""{"results":[
            {"videoId":"AbCdEfGh123","url":"http://yt.jobbisoft.com.mx/watch?v=AbCdEfGh123"},
            {"videoId":"AbCdEfGh123","url":"https://attacker.invalid/watch?v=wrong"},
            {"videoId":"short","url":"https://yt.jobbisoft.com.mx/watch?v=short"},
            {"videoId":"AbCdEfGh123","url":"https://yt.jobbisoft.com.mx/watch?v=AbCdEfGh123","title":"Valid"},
            {"videoId":"AbCdEfGh123","url":"https://yt.jobbisoft.com.mx/watch?v=AbCdEfGh123","title":"Duplicate"}
        ]}""")
        val videos=parseInvidiousVideos(payload)
        assertEquals(1,videos.size)
        assertEquals("Valid",videos[0].title)
    }
    @Test fun handlesHealthyEmptySearchAndBoundsVeryLongDurations() {
        assertTrue(parseInvidiousVideos(JSONObject("""{"results":[]}""")).isEmpty())
        val payload=JSONObject("""{"results":[
            {"videoId":"AbCdEfGh123","url":"https://yt.jobbisoft.com.mx/watch?v=AbCdEfGh123",
            "title":"Music","artist":"Artist","duration":999999}
        ]}""")
        assertEquals(10800L,parseInvidiousVideos(payload)[0].durationSeconds)
    }
}
