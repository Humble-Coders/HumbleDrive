package com.humblecoders.humbledrive.domain

/**
 * The domain model.
 *
 * Plain Kotlin, no Android imports (CLAUDE.md: `domain` depends on nothing).
 * That is what lets a ViewModel be tested on the JVM with a fake repository and
 * no Android runtime at all.
 */

enum class StopType { BREAK, FOOD, FUEL, OTHER }

data class Place(
    val name: String,
    val lat: Double,
    val lng: Double,
)

data class BreakStop(
    val id: String,
    val seq: Int,
    val name: String,
    val lat: Double,
    val lng: Double,
    val type: StopType,
    val plannedMinutes: Int,
)

data class Consignment(
    val reference: String?,
    val description: String?,
    val weightKg: Double?,
    val receiverName: String?,
    val receiverPhone: String?,
)

data class Run(
    val tripId: String,
    val status: String,
    val driverName: String,
    val origin: Place,
    val destination: Place,
    val encodedPolyline: String,
    val distanceMetres: Int,
    val driveSeconds: Int,
    val stops: List<BreakStop>,
    val consignment: Consignment,
) {
    /** Breaks are advisory (PRD D-8), but the driver should still see what the
     *  day actually adds up to: drive time plus every planned break. */
    val breakSeconds: Int get() = stops.sumOf { it.plannedMinutes } * 60
    val totalSeconds: Int get() = driveSeconds + breakSeconds
}

/** Every way verification or fetching can fail, as a closed set. Mirrors the
 *  driver half of PRD §4.7 so the UI must handle each one deliberately. */
enum class RunError {
    INVALID_CODE,
    CODE_ALREADY_USED,
    TRIP_CANCELLED,
    TRIP_COMPLETED,
    SESSION_EXPIRED,
    OFFLINE,
    UNKNOWN,
}

class RunException(val error: RunError) : Exception(error.name)

interface RunRepository {
    /** Redeem a code. Case-insensitive: a driver reading an email will type
     *  lowercase, and that must work. */
    suspend fun verify(code: String): Run

    /** The cached run, if this device has a live session. Null otherwise. */
    suspend fun cachedRun(): Run?

    /** Re-fetch from the server. Throws RunException on failure. */
    suspend fun refresh(): Run

    suspend fun hasSession(): Boolean

    suspend fun endSession()
}
