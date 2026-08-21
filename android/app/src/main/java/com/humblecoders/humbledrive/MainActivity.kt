package com.humblecoders.humbledrive

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.humblecoders.humbledrive.domain.RunRepository
import com.humblecoders.humbledrive.ui.code.CodeScreen
import com.humblecoders.humbledrive.ui.code.CodeViewModel
import com.humblecoders.humbledrive.ui.run.RunScreen
import com.humblecoders.humbledrive.ui.run.RunViewModel
import com.humblecoders.humbledrive.ui.theme.HumbleDriveTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Must be called before super.onCreate. The system splash then covers
        // the gap between tapping the icon and Compose drawing its first frame,
        // which is where the app previously showed a blank screen while it read
        // the encrypted session store.
        val splash = installSplashScreen()

        // Edge to edge: the background draws under the system bars, and
        // safeDrawingPadding keeps content and controls clear of them.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val repository = (application as HumbleDriveApp).container.runRepository

        // Hold the splash until we know which screen to show, so the driver
        // never sees code entry flash up before their cached run appears.
        var sessionResolved = false
        splash.setKeepOnScreenCondition { !sessionResolved }

        setContent {
            HumbleDriveTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppRoot(repository, onResolved = { sessionResolved = true })
                }
            }
        }
    }
}

/**
 * Two screens, and the only thing that decides between them is whether this
 * device holds a session. A driver who has already verified should never see
 * the code screen again for that run.
 */
@Composable
private fun AppRoot(repository: RunRepository, onResolved: () -> Unit) {
    var hasSession by remember { mutableStateOf<Boolean?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        hasSession = repository.hasSession()
        onResolved()
    }

    when (hasSession) {
        // The system splash is still covering this, held by
        // setKeepOnScreenCondition until the store has been read.
        null -> Unit

        false -> {
            val vm: CodeViewModel = viewModel(factory = CodeViewModel.Factory(repository))
            val state by vm.state.collectAsState()

            LaunchedEffect(state.verified) {
                if (state.verified) hasSession = true
            }

            CodeScreen(
                state = state,
                onCodeChange = vm::onCodeChange,
                onSubmit = vm::submit,
            )
        }

        true -> {
            val vm: RunViewModel = viewModel(factory = RunViewModel.Factory(repository))
            val state by vm.state.collectAsState()

            // The run ended or the session died: back to code entry rather than
            // leaving the driver on a screen that no longer tells the truth.
            LaunchedEffect(state.ended) {
                if (state.ended) {
                    scope.launch { hasSession = repository.hasSession() }
                }
            }

            RunScreen(
                state = state,
                onRefresh = { vm.refresh() },
                onExit = vm::exitRun,
            )
        }
    }
}
