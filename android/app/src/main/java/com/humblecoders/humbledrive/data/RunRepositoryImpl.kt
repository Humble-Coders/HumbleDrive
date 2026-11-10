package com.humblecoders.humbledrive.data

import com.humblecoders.humbledrive.domain.BreakStop
import com.humblecoders.humbledrive.domain.Consignment
import com.humblecoders.humbledrive.domain.Place
import com.humblecoders.humbledrive.domain.Run
import com.humblecoders.humbledrive.domain.RunError
import com.humblecoders.humbledrive.domain.RunException
import com.humblecoders.humbledrive.domain.RunRepository
import com.humblecoders.humbledrive.domain.StopType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * The only class that talks to the network or to storage.
 *
 * Two things worth knowing:
 *
 *   The session token goes in X-Driver-Token, NOT Authorization. Supabase's
 *   gateway verifies Authorization as a Supabase JWT before our function is
 *   reached, so an opaque token there is rejected upstream and our own checks
 *   never run. Authorization carries the publishable key for the gateway.
 *
 *   Every successful fetch writes the run to the encrypted store. A driver may
 *   verify at a depot on wifi and set off straight into a dead zone, so the
 *   overview has to render from cache with no network at all.
 */
class RunRepositoryImpl(
    private val baseUrl: String,
    private val publishableKey: String,
    private val store: TokenStore,
    private val client: OkHttpClient = OkHttpClient(),
) : RunRepository {

    private val json = Json {
        ignoreUnknownKeys = true
        // Without this, kotlinx omits any property still holding its default —
        // which silently dropped `action` from every request and made the
        // server answer "unknown action". Defaults in a wire DTO are only safe
        // when they are actually encoded.
        encodeDefaults = true
    }
    private val jsonType = "application/json".toMediaType()

    private companion object {
        const val TAG = "HumbleDrive"
    }

    override suspend fun verify(code: String): Run = withContext(Dispatchers.IO) {
        val body = json.encodeToString(
            VerifyRequest.serializer(),
            // Uppercased here as well as server-side: what the driver sees in
            // the field should match what is in their email.
            VerifyRequest(code = code.trim().uppercase(), deviceLabel = android.os.Build.MODEL),
        )
        val response = post(body, withSession = false)
        val parsed = json.decodeFromString(VerifyResponse.serializer(), response)

        store.token = parsed.token
        store.cachedRunJson = json.encodeToString(RunDto.serializer(), parsed.run)
        parsed.run.toDomain()
    }

    override suspend fun cachedRun(): Run? = withContext(Dispatchers.IO) {
        val raw = store.cachedRunJson ?: return@withContext null
        runCatching { json.decodeFromString(RunDto.serializer(), raw).toDomain() }.getOrNull()
    }

    override suspend fun refresh(): Run = withContext(Dispatchers.IO) {
        val body = json.encodeToString(RunRequest.serializer(), RunRequest())
        val response = post(body, withSession = true)
        val parsed = json.decodeFromString(RunResponse.serializer(), response)

        store.cachedRunJson = json.encodeToString(RunDto.serializer(), parsed.run)
        parsed.run.toDomain()
    }

    override suspend fun hasSession(): Boolean = store.token != null

    override suspend fun endSession() {
        store.clear()
    }

    private fun post(body: String, withSession: Boolean): String {
        val builder = Request.Builder()
            .url("$baseUrl/functions/v1/driver")
            .addHeader("apikey", publishableKey)
            .addHeader("Authorization", "Bearer $publishableKey")
            .addHeader("Content-Type", "application/json")
            .post(body.toRequestBody(jsonType))

        if (withSession) {
            val token = store.token ?: throw RunException(RunError.SESSION_EXPIRED)
            builder.addHeader("X-Driver-Token", token)
        }

        val response = try {
            client.newCall(builder.build()).execute()
        } catch (_: IOException) {
            // Genuinely no connection, as distinct from a rejection.
            throw RunException(RunError.OFFLINE)
        }

        response.use {
            val text = it.body?.string().orEmpty()
            if (it.isSuccessful) return text

            val code = runCatching {
                json.decodeFromString(ErrorResponse.serializer(), text).error
            }.getOrNull()

            throw RunException(
                when (code) {
                    "invalid_code" -> RunError.INVALID_CODE
                    "code_already_used" -> RunError.CODE_ALREADY_USED
                    "trip_cancelled" -> RunError.TRIP_CANCELLED
                    "trip_completed" -> RunError.TRIP_COMPLETED
                    "session_expired", "unauthorized" -> RunError.SESSION_EXPIRED
                    // Ours, not the driver's: the app sent something the server
                    // could not read. Logged loudly so it is never a mystery.
                    "bad_request" -> {
                        android.util.Log.e(TAG, "Server rejected the request as bad_request: $text")
                        RunError.UNKNOWN
                    }
                    else -> {
                        android.util.Log.e(TAG, "Unmapped error from server: $text")
                        RunError.UNKNOWN
                    }
                },
            )
        }
    }
}

private fun RunDto.toDomain(): Run = Run(
    tripId = tripId,
    status = status,
    driverName = driverName,
    origin = Place(route.originName, route.originLat, route.originLng),
    destination = Place(route.destName, route.destLat, route.destLng),
    encodedPolyline = route.encodedPolyline,
    distanceMetres = route.distanceM,
    driveSeconds = route.driveDurationS,
    stops = stops.sortedBy { it.seq }.map {
        BreakStop(
            id = it.id,
            seq = it.seq,
            name = it.name,
            lat = it.lat,
            lng = it.lng,
            type = when (it.stopType) {
                "food" -> StopType.FOOD
                "fuel" -> StopType.FUEL
                "break" -> StopType.BREAK
                else -> StopType.OTHER
            },
            plannedMinutes = it.plannedMinutes,
        )
    },
    consignment = Consignment(
        reference = consignment.ref,
        description = consignment.description,
        weightKg = consignment.weightKg,
        receiverName = consignment.receiverName,
        receiverPhone = consignment.receiverPhone,
    ),
)
