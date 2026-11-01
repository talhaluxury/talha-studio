package com.talhastudio.admin

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Remembers the admin's email + password so only the phone fingerprint is needed to sign in.
 * The login is encrypted with an Android Keystore key that can only be used right after a successful
 * fingerprint check; nothing readable is ever stored, and the key is dropped if the phone's fingerprints change.
 * Exposed to the bundled admin page as window.TalhaNative (see admin/js/native.js).
 */
class BiometricVault(private val activity: FragmentActivity, private val web: WebView) {
    private val prefs = activity.getSharedPreferences("ts_vault", Context.MODE_PRIVATE)
    private val alias = "ts_admin_login_key"
    private val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG

    @JavascriptInterface
    fun available(): Boolean =
        BiometricManager.from(activity).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS

    @JavascriptInterface
    fun hasSaved(): Boolean = prefs.contains("blob") && prefs.contains("iv")

    @JavascriptInterface
    fun clear() {
        prefs.edit().clear().apply()
        runCatching { keyStore().deleteEntry(alias) }
    }

    /** Encrypts {email,password} after a fingerprint check. Result comes back through window.__nativeDone. */
    @JavascriptInterface
    fun save(id: Int, json: String) {
        try {
            runCatching { keyStore().deleteEntry(alias) }   // fresh key every time a new login is saved
            val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, newKey()) }
            prompt(cipher, "Fingerprint login save karein", onFail = { reply(id, false, it) }) { c ->
                try {
                    val enc = c.doFinal(json.toByteArray(Charsets.UTF_8))
                    prefs.edit()
                        .putString("iv", Base64.encodeToString(c.iv, Base64.NO_WRAP))
                        .putString("blob", Base64.encodeToString(enc, Base64.NO_WRAP))
                        .apply()
                    reply(id, true, "ok")
                } catch (e: Exception) { reply(id, false, "error") }
            }
        } catch (e: Exception) { reply(id, false, "error") }
    }

    /** Decrypts the saved login after a fingerprint check. */
    @JavascriptInterface
    fun load(id: Int) {
        try {
            val iv = Base64.decode(prefs.getString("iv", null) ?: return reply(id, false, "none"), Base64.NO_WRAP)
            val blob = Base64.decode(prefs.getString("blob", null) ?: return reply(id, false, "none"), Base64.NO_WRAP)
            val key = keyStore().getKey(alias, null) as? SecretKey ?: run { clear(); return reply(id, false, "invalidated") }
            val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv)) }
            prompt(cipher, "Talha Studio Admin", onFail = { reply(id, false, it) }) { c ->
                try { reply(id, true, String(c.doFinal(blob), Charsets.UTF_8)) }
                catch (e: Exception) { reply(id, false, "error") }
            }
        } catch (e: KeyPermanentlyInvalidatedException) {
            clear(); reply(id, false, "invalidated")   // fingerprints were changed on the phone
        } catch (e: Exception) { reply(id, false, "error") }
    }

    private fun prompt(cipher: Cipher, title: String, onFail: (String) -> Unit, onOk: (Cipher) -> Unit) {
        activity.runOnUiThread {
            val bp = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val c = result.cryptoObject?.cipher
                    if (c != null) onOk(c) else onFail("error")
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { onFail("cancelled") }
            })
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle("Apni fingerprint lagayein")
                .setNegativeButtonText("Password se login")
                .setAllowedAuthenticators(authenticators)
                .build()
            bp.authenticate(info, BiometricPrompt.CryptoObject(cipher))
        }
    }

    private fun reply(id: Int, ok: Boolean, data: String) {
        val js = "window.__nativeDone($id,$ok,${JSONObject.quote(data)})"
        activity.runOnUiThread { web.evaluateJavascript(js, null) }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun newKey(): SecretKey {
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(spec) }.generateKey()
    }

    private companion object { const val TRANSFORM = "AES/GCM/NoPadding" }
}
