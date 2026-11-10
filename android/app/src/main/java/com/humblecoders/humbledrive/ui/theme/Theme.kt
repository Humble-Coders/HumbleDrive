package com.humblecoders.humbledrive.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The Humble Coders palette, mirrored from the web app.
 *
 * Dark only (PRD D-21) — humblecoders.in has no light palette to inherit, so
 * supporting light would mean inventing and maintaining one. Every colour is a
 * token here, so adding light later stays a config change rather than a hunt.
 */
val Bg = Color(0xFF07090F)
val Card = Color(0xFF0F131C)
val Secondary = Color(0xFF161B27)
val Muted = Color(0xFF1A2030)
val TextPrimary = Color(0xFFF4F6FB)
val TextMuted = Color(0xFF94A0B8)
val Brand = Color(0xFF4263A6)
val Brand2 = Color(0xFF5B7CC4)
val Gold = Color(0xFFF5C451)

private val Scheme = darkColorScheme(
    primary = Brand2,
    onPrimary = TextPrimary,
    secondary = Brand,
    background = Bg,
    onBackground = TextPrimary,
    surface = Card,
    onSurface = TextPrimary,
    surfaceVariant = Secondary,
    onSurfaceVariant = TextMuted,
    error = Gold,
    onError = Bg,
    outline = Muted,
)

@Composable
fun HumbleDriveTheme(
    // Accepted and ignored on purpose: the app is dark in both system modes,
    // so a light system theme must not lighten it.
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(colorScheme = Scheme, content = content)
}
