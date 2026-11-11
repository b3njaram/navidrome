package com.jobbisoft.music.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64
import javax.crypto.KeyGenerator

class SecureLoginCodecTest {
    private fun key() = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private val account = RememberedLogin(
        "https://music.jobbisoft.com.mx", "music-listener", "test-password-please-never-log"
    )

    @Test fun roundTripsAccountWithoutStoringPlaintext() {
        val encrypted = SecureLoginCodec.encrypt(account,key())
        assertFalse(encrypted.contains(account.password))
        assertFalse(encrypted.contains(account.username))
        // Verify actual content with the same key, not just the ciphertext shape.
        val deviceKey = key()
        val saved = SecureLoginCodec.encrypt(account,deviceKey)
        assertEquals(account,SecureLoginCodec.decrypt(saved,deviceKey))
    }

    @Test fun ciphertextUsesRandomIvEachTime() {
        val deviceKey = key()
        val first = SecureLoginCodec.encrypt(account,deviceKey)
        val second = SecureLoginCodec.encrypt(account,deviceKey)
        assertNotEquals(first,second)
        assertEquals(account,SecureLoginCodec.decrypt(second,deviceKey))
    }

    @Test fun alteredCiphertextOrWrongKeyCannotRestoreCredentials() {
        val deviceKey = key()
        val stored = SecureLoginCodec.encrypt(account,deviceKey)
        assertTrue(runCatching { SecureLoginCodec.decrypt(stored,key()) }.isFailure)
        val tampered = Base64.getDecoder().decode(stored)
        tampered[tampered.lastIndex] = (tampered.last().toInt() xor 0x01).toByte()
        assertTrue(runCatching {
            SecureLoginCodec.decrypt(Base64.getEncoder().encodeToString(tampered),deviceKey)
        }.isFailure)
    }

    @Test fun emptyOrInvalidAccountsCannotBeSaved() {
        assertTrue(runCatching {
            SecureLoginCodec.encrypt(account.copy(server="http://unsafe.example"),key())
        }.isFailure)
        assertTrue(runCatching {
            SecureLoginCodec.encrypt(account.copy(password=""),key())
        }.isFailure)
        assertTrue(runCatching { SecureLoginCodec.decrypt("bad",key()) }.isFailure)
    }
}
