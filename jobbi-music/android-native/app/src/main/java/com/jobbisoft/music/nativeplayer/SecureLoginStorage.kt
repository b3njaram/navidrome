package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import java.util.Base64

/** Only used in the login flow; never included in logs or regular preferences. */
internal data class RememberedLogin(
    val server: String, val username: String, val password: String
)

/** Plain JVM-testable AES-GCM codec. The AES key itself never leaves AndroidKeyStore. */
internal object SecureLoginCodec {
    private val context = "jobbi-native-login:v1".toByteArray(StandardCharsets.UTF_8)
    private const val IV_SIZE = 12
    private const val TAG_BITS = 128

    fun encrypt(value: RememberedLogin, key: SecretKey): String {
        require(value.server.startsWith("https://") && value.username.isNotBlank() &&
            value.password.isNotEmpty()) { "Invalid saved account" }
        val cleartext = JSONObject()
            .put("server", value.server)
            .put("username", value.username)
            .put("password", value.password)
            .toString().toByteArray(StandardCharsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.updateAAD(context)
        return Base64.getEncoder().encodeToString(cipher.iv + cipher.doFinal(cleartext))
    }

    fun decrypt(encoded: String, key: SecretKey): RememberedLogin {
        val envelope = Base64.getDecoder().decode(encoded)
        require(envelope.size > IV_SIZE + 16) { "Invalid encrypted login" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, envelope.copyOfRange(0, IV_SIZE)))
        cipher.updateAAD(context)
        val json = JSONObject(String(cipher.doFinal(envelope.copyOfRange(IV_SIZE, envelope.size)),
            StandardCharsets.UTF_8))
        val saved = RememberedLogin(json.getString("server"),json.getString("username"),
            json.getString("password"))
        require(saved.server.startsWith("https://") && saved.username.isNotBlank() &&
            saved.password.isNotEmpty()) { "Invalid saved account data" }
        return saved
    }
}

/**
 * Android Keystore holds a non-exportable per-installation AES-256 key.
 * The only on-disk data is AES-GCM ciphertext in app-private SharedPreferences.
 * AndroidManifest disables application backup to prevent restoring ciphertext
 * without its corresponding non-exportable Keystore key.
 */
internal object SecureLoginStorage {
    private const val PREFS = "jobbi-native-secure-login"
    private const val RECORD = "encrypted-account"
    private const val KEY_ALIAS = "jobbi-native-account-aes-v1"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun keystore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun key(create: Boolean): SecretKey? {
        val stored = keystore().getKey(KEY_ALIAS, null) as? SecretKey
        if (stored != null || !create) return stored
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build())
        return generator.generateKey()
    }

    fun exists(context: Context): Boolean = prefs(context).contains(RECORD)

    /** Save only *after* the music server has confirmed that login succeeded. */
    fun save(context: Context, value: RememberedLogin) {
        val encrypted = SecureLoginCodec.encrypt(value,requireNotNull(key(true)))
        check(prefs(context).edit().putString(RECORD, encrypted).commit()) {
            "Could not save encrypted sign-in"
        }
    }

    /** Invalidated keys / corrupted records fail closed and require manual login. */
    fun load(context: Context): RememberedLogin? {
        val encrypted = prefs(context).getString(RECORD,null) ?: return null
        return try {
            val storedKey = key(false) ?: error("Secure key not available")
            SecureLoginCodec.decrypt(encrypted,storedKey)
        } catch (_: Exception) {
            clear(context)
            null
        }
    }

    /** Signing out deletes both ciphertext and the installation's Keystore key. */
    fun clear(context: Context) {
        check(prefs(context).edit().remove(RECORD).commit()) {
            "Unable to remove the saved login from device storage"
        }
        keystore().deleteEntry(KEY_ALIAS)
    }
}
