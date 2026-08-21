package com.humblecoders.humbledrive.ui.code

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.humblecoders.humbledrive.R
import com.humblecoders.humbledrive.domain.RunError
import com.humblecoders.humbledrive.ui.theme.Gold
import com.humblecoders.humbledrive.ui.theme.TextMuted

/**
 * Code entry.
 *
 * One field. The driver is reading six characters off an email, often in poor
 * light, so the field is large, spaced, and uppercase — what they see should
 * match what they were sent. Autocorrect is off: a six-character code must
 * never be "corrected".
 */
@Composable
fun CodeScreen(
    state: CodeUiState,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val keyboard = LocalSoftwareKeyboardController.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .padding(24.dp)
            // Scrolls so the field stays visible above the keyboard on a small
            // phone; adjustResize in the manifest does the rest.
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.tagline),
            style = MaterialTheme.typography.bodyMedium,
            color = TextMuted,
        )

        Spacer(Modifier.height(40.dp))

        Text(
            text = stringResource(R.string.code_title),
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.code_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = TextMuted,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = state.code,
            onValueChange = onCodeChange,
            label = { Text(stringResource(R.string.code_label)) },
            singleLine = true,
            enabled = !state.submitting,
            isError = state.error != null,
            textStyle = TextStyle(
                fontSize = 28.sp,
                letterSpacing = 8.sp,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.SemiBold,
            ),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                autoCorrectEnabled = false,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = {
                keyboard?.hide()
                onSubmit()
            }),
            modifier = Modifier.fillMaxWidth(),
        )

        if (state.error != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(state.error.messageRes()),
                color = Gold,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                keyboard?.hide()
                onSubmit()
            },
            enabled = state.canSubmit,
            modifier = Modifier
                .fillMaxWidth()
                // Comfortably above the 48dp floor: pressed one-handed, often
                // in a vehicle.
                .heightIn(min = 56.dp),
        ) {
            if (state.submitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.code_checking))
            } else {
                Text(stringResource(R.string.code_submit))
            }
        }
    }
}

/** Each failure gets its own message. "That code isn't right" and "that code
 *  was already used" are different problems with different next steps. */
fun RunError.messageRes(): Int = when (this) {
    RunError.INVALID_CODE -> R.string.error_invalid_code
    RunError.CODE_ALREADY_USED -> R.string.error_code_already_used
    RunError.TRIP_CANCELLED -> R.string.error_trip_cancelled
    RunError.TRIP_COMPLETED -> R.string.error_trip_completed
    RunError.SESSION_EXPIRED -> R.string.error_session_expired
    RunError.OFFLINE -> R.string.error_offline
    RunError.UNKNOWN -> R.string.error_generic
}
