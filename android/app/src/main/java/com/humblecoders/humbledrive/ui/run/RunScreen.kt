package com.humblecoders.humbledrive.ui.run

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.PolyUtil
import com.google.maps.android.compose.*
import com.humblecoders.humbledrive.R
import com.humblecoders.humbledrive.domain.BreakStop
import com.humblecoders.humbledrive.domain.Run
import com.humblecoders.humbledrive.domain.StopType
import com.humblecoders.humbledrive.ui.code.messageRes
import com.humblecoders.humbledrive.ui.formatDistance
import com.humblecoders.humbledrive.ui.formatDuration
import com.humblecoders.humbledrive.ui.theme.*

/**
 * The run the driver is about to make.
 *
 * Renders entirely from the cached payload, so it works with no signal — which
 * is the situation this app exists for. Everything the map shows is also
 * present as text: the map is an aid, never the only way to understand the run.
 */
@Composable
fun RunScreen(
    state: RunUiState,
    onRefresh: () -> Unit,
    onExit: () -> Unit,
) {
    val run = state.run

    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding(),
    ) {
        if (run == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                when {
                    state.loading -> CircularProgressIndicator()
                    state.error != null -> Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(24.dp),
                    ) {
                        Text(stringResource(state.error.messageRes()), color = Gold)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = onRefresh) { Text(stringResource(R.string.run_refresh)) }
                    }
                }
            }
            return@Column
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState()),
        ) {
            RouteMap(run, Modifier.fillMaxWidth().height(240.dp))

            Column(Modifier.padding(16.dp)) {
                // Offline is a normal state here, said quietly rather than as
                // an error — the screen is still completely usable.
                if (state.offline) {
                    Surface(color = Secondary, shape = MaterialTheme.shapes.medium) {
                        Text(
                            stringResource(R.string.run_cached),
                            color = TextMuted,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                }

                Text(
                    "${stringResource(R.string.run_from)} ${run.origin.name}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    run.destination.name,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                Spacer(Modifier.height(16.dp))
                TimingRow(run)

                Spacer(Modifier.height(16.dp))
                SectionCard(stringResource(R.string.run_stops)) {
                    if (run.stops.isEmpty()) {
                        Text(
                            stringResource(R.string.run_no_stops),
                            color = TextMuted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else {
                        run.stops.forEach { StopRow(it) }
                    }
                }

                Spacer(Modifier.height(12.dp))
                SectionCard(stringResource(R.string.run_consignment)) {
                    run.consignment.reference?.let { Detail("Ref", it) }
                    run.consignment.description?.let { Detail("Details", it) }
                    run.consignment.weightKg?.let { Detail("Weight", "$it kg") }
                    run.consignment.receiverName?.let { Detail(stringResource(R.string.run_receiver), it) }
                    run.consignment.receiverPhone?.let { phone ->
                        val context = LocalContext.current
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Detail("Phone", phone, Modifier.weight(1f))
                            // Tappable to dial: a driver needing the receiver
                            // should not be copying digits by hand.
                            TextButton(onClick = {
                                context.startActivity(
                                    Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")),
                                )
                            }) { Text(stringResource(R.string.run_call)) }
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))
                OutlinedButton(
                    onClick = onExit,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.run_sign_out)) }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun RouteMap(run: Run, modifier: Modifier = Modifier) {
    val points = remember(run.encodedPolyline) {
        runCatching { PolyUtil.decode(run.encodedPolyline) }.getOrDefault(emptyList())
    }
    val origin = LatLng(run.origin.lat, run.origin.lng)
    val destination = LatLng(run.destination.lat, run.destination.lng)

    val cameraState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(origin, 7f)
    }

    // Frame the whole route once the map is laid out, so the driver sees the
    // shape of the journey rather than a random corner of it.
    LaunchedEffect(points) {
        if (points.isNotEmpty()) {
            val bounds = LatLngBounds.builder().apply {
                points.forEach { include(it) }
            }.build()
            runCatching {
                cameraState.move(
                    com.google.android.gms.maps.CameraUpdateFactory.newLatLngBounds(bounds, 80),
                )
            }
        }
    }

    GoogleMap(
        modifier = modifier,
        cameraPositionState = cameraState,
        properties = MapProperties(
            // Dark, so the map does not glare in a cab at night.
            mapStyleOptions = MapStyleOptions(DARK_MAP_STYLE),
        ),
        uiSettings = MapUiSettings(zoomControlsEnabled = false, mapToolbarEnabled = false),
    ) {
        if (points.isNotEmpty()) {
            Polyline(points = points, color = Brand2, width = 12f)
        }
        Marker(state = MarkerState(origin), title = run.origin.name)
        Marker(state = MarkerState(destination), title = run.destination.name)
        run.stops.forEach { stop ->
            Marker(
                state = MarkerState(LatLng(stop.lat, stop.lng)),
                title = "${stop.seq}. ${stop.name}",
            )
        }
    }
}

@Composable
private fun TimingRow(run: Run) {
    // Drive, break and total all shown. A six-hour drive with 45 minutes of
    // breaks is a longer day than the drive time alone suggests, and the driver
    // should see that before setting off.
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(stringResource(R.string.run_drive_time), formatDuration(run.driveSeconds), Modifier.weight(1f))
            Stat(stringResource(R.string.run_break_time), formatDuration(run.breakSeconds), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(
                stringResource(R.string.run_total_time),
                formatDuration(run.totalSeconds),
                Modifier.weight(1f),
                valueColor = Gold,
            )
            Stat(stringResource(R.string.run_distance), formatDistance(run.distanceMetres), Modifier.weight(1f))
        }
    }
}

@Composable
private fun Stat(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: androidx.compose.ui.graphics.Color = TextPrimary,
) {
    Surface(color = Card, shape = MaterialTheme.shapes.medium, modifier = modifier) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = TextMuted)
            Spacer(Modifier.height(2.dp))
            Text(
                value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = valueColor,
            )
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(color = Card, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun StopRow(stop: BreakStop) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The sequence number carries the order, so the eye can follow the
        // journey down the list without reading every name.
        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(Secondary),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                stop.seq.toString(),
                style = MaterialTheme.typography.labelMedium,
                color = TextMuted,
            )
        }

        Spacer(Modifier.width(12.dp))

        Column(Modifier.weight(1f)) {
            Text(
                stop.name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                stringResource(stop.type.labelRes()),
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )
        }

        // Planned duration as a chip: it is the number the driver is looking
        // for, and a chip separates it from the name at a glance.
        Surface(color = Secondary, shape = MaterialTheme.shapes.small) {
            Text(
                "${stop.plannedMinutes} min",
                style = MaterialTheme.typography.labelMedium,
                color = TextPrimary,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            )
        }
    }
}

private fun StopType.labelRes(): Int = when (this) {
    StopType.BREAK -> R.string.stop_break
    StopType.FOOD -> R.string.stop_food
    StopType.FUEL -> R.string.stop_fuel
    StopType.OTHER -> R.string.stop_other
}

@Composable
private fun Detail(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = TextMuted)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

/** Matches the web app's map styling, so the two products look like one. */
private const val DARK_MAP_STYLE = """
[
  {"elementType":"geometry","stylers":[{"color":"#0f131c"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#07090f"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#94a0b8"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#1a2030"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#07090f"}]},
  {"featureType":"poi","stylers":[{"visibility":"off"}]}
]
"""
