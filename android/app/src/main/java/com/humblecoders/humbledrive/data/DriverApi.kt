package com.humblecoders.humbledrive.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The wire shapes.
 *
 * snake_case here and camelCase in the domain (CLAUDE.md, Conventions), which
 * is why these are separate types rather than the domain model with
 * annotations — the boundary is explicit and a rename on either side cannot
 * silently break the other.
 */

@Serializable
data class VerifyRequest(
    val action: String = "verify",
    val code: String,
    @SerialName("device_label") val deviceLabel: String? = null,
)

@Serializable
data class RunRequest(val action: String = "run")

@Serializable
data class VerifyResponse(val token: String, val run: RunDto)

@Serializable
data class RunResponse(val run: RunDto)

@Serializable
data class ErrorResponse(val error: String? = null, val message: String? = null)

@Serializable
data class RunDto(
    @SerialName("trip_id") val tripId: String,
    val status: String,
    @SerialName("driver_name") val driverName: String,
    val consignment: ConsignmentDto,
    val route: RouteDto,
    val stops: List<StopDto> = emptyList(),
)

@Serializable
data class ConsignmentDto(
    val ref: String? = null,
    val description: String? = null,
    @SerialName("weight_kg") val weightKg: Double? = null,
    @SerialName("receiver_name") val receiverName: String? = null,
    @SerialName("receiver_phone") val receiverPhone: String? = null,
)

@Serializable
data class RouteDto(
    @SerialName("origin_name") val originName: String,
    @SerialName("origin_lat") val originLat: Double,
    @SerialName("origin_lng") val originLng: Double,
    @SerialName("dest_name") val destName: String,
    @SerialName("dest_lat") val destLat: Double,
    @SerialName("dest_lng") val destLng: Double,
    @SerialName("encoded_polyline") val encodedPolyline: String,
    @SerialName("distance_m") val distanceM: Int,
    @SerialName("drive_duration_s") val driveDurationS: Int,
)

@Serializable
data class StopDto(
    val id: String,
    val seq: Int,
    val name: String,
    val lat: Double,
    val lng: Double,
    @SerialName("stop_type") val stopType: String,
    @SerialName("planned_minutes") val plannedMinutes: Int,
)
