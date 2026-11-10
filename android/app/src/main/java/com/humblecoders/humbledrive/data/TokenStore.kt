package com.humblecoders.humbledrive.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Where the driver's session token lives.
 *
 * EncryptedSharedPreferences, not plain preferences: this token is the driver's
 * entire credential for the run, and a phone in a vehicle is a phone that gets
 * lost. It is never logged, anywhere, in any build type.
 *
 * The cached run is stored alongside it as JSON. That is deliberate rather than
 * lazy: the run is what makes the app work in a dead zone, and keeping it in
 * the same encrypted store means one thing to clear when the session ends.
 */
class TokenStore(context: Context) {

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "humbledrive.session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().apply {
            if (value == null) remove(KEY_TOKEN) else putString(KEY_TOKEN, value)
        }.apply()

    var cachedRunJson: String?
        get() = prefs.getString(KEY_RUN, null)
        set(value) = prefs.edit().apply {
            if (value == null) remove(KEY_RUN) else putString(KEY_RUN, value)
        }.apply()

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_TOKEN = "token"
        const val KEY_RUN = "run"
    }
}
