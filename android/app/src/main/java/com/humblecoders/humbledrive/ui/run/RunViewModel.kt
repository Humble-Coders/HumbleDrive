package com.humblecoders.humbledrive.ui.run

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.humblecoders.humbledrive.domain.Run
import com.humblecoders.humbledrive.domain.RunError
import com.humblecoders.humbledrive.domain.RunException
import com.humblecoders.humbledrive.domain.RunRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The run overview.
 *
 * Cache first, network second. The screen renders from the encrypted store
 * immediately and refreshes only if the network happens to be there — a driver
 * may verify on depot wifi and set off straight into a dead zone, so needing a
 * request to draw the screen would fail at the first moment that matters.
 *
 * Being offline is therefore a normal state, not an error.
 */
data class RunUiState(
    val loading: Boolean = true,
    val run: Run? = null,
    val error: RunError? = null,
    val offline: Boolean = false,
    val ended: Boolean = false,
)

class RunViewModel(private val repository: RunRepository) : ViewModel() {

    private val _state = MutableStateFlow(RunUiState())
    val state: StateFlow<RunUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            val cached = repository.cachedRun()
            if (cached != null) {
                _state.update { it.copy(loading = false, run = cached) }
            }
            refresh(silent = cached != null)
        }
    }

    fun refresh(silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) _state.update { it.copy(loading = true, error = null) }
            try {
                val fresh = repository.refresh()
                _state.update {
                    it.copy(loading = false, run = fresh, error = null, offline = false)
                }
            } catch (e: RunException) {
                when (e.error) {
                    // Offline with a cached run is not a failure — say so quietly
                    // and keep showing what we have.
                    RunError.OFFLINE -> _state.update {
                        it.copy(loading = false, offline = true, error = if (it.run == null) e.error else null)
                    }
                    // The run is over or gone: the session is dead, so clear it
                    // rather than leaving the driver on a screen that lies.
                    RunError.SESSION_EXPIRED, RunError.TRIP_CANCELLED, RunError.TRIP_COMPLETED -> {
                        repository.endSession()
                        _state.update { it.copy(loading = false, error = e.error, ended = true) }
                    }
                    else -> _state.update { it.copy(loading = false, error = e.error) }
                }
            } catch (e: Exception) {
                android.util.Log.e("HumbleDrive", "Unexpected failure during run", e)
                _state.update { it.copy(loading = false, error = RunError.UNKNOWN) }
            }
        }
    }

    fun exitRun() {
        viewModelScope.launch {
            repository.endSession()
            _state.update { RunUiState(loading = false, ended = true) }
        }
    }

    class Factory(private val repository: RunRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            RunViewModel(repository) as T
    }
}
