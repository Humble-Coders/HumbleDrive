package com.humblecoders.humbledrive.ui

/** Durations and distances, phrased for a glance rather than precision. */
fun formatDuration(seconds: Int): String {
    val total = (seconds / 60).coerceAtLeast(0)
    val h = total / 60
    val m = total % 60
    return when {
        h == 0 -> "$m min"
        m == 0 -> "$h hr"
        else -> "$h hr $m min"
    }
}

fun formatDistance(metres: Int): String {
    val km = metres / 1000.0
    return if (km >= 10) "${km.toInt()} km" else String.format("%.1f km", km)
}
