package com.humblecoders.humbledrive.ui.code

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.humblecoders.humbledrive.domain.RunError
import com.humblecoders.humbledrive.domain.RunException
import com.humblecoders.humbledrive.domain.RunRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Code entry.
 *
 * One StateFlow<UiState> with loading, error and success modelled explicitly
 * rather than a scatter of booleans (PRD D-23). No Context, no Compose types —
 * which is what makes this testable on the JVM.
 */
data class CodeUiState(
    val code: String = "",
    val submitting: Boolean = false,
    val error: RunError? = null,
    val verified: Boolean = false,
) {
    val canSubmit: Boolean get() = code.trim().length == CODE_LENGTH && !submitting

    companion object {
        const val CODE_LENGTH = 6
    }
}

class CodeViewModel(private val repository: RunRepository) : ViewModel() {

    private val _state = MutableStateFlow(CodeUiState())
    val state: StateFlow<CodeUiState> = _state.asStateFlow()

    fun onCodeChange(raw: String) {
        // Uppercased as they type, so what they see matches the email. The
        // alphabet excludes O and I, so anything outside A-Z2-9 is a typo.
        val cleaned = raw.uppercase().filter { it.isLetterOrDigit() }.take(CodeUiState.CODE_LENGTH)
        _state.update { it.copy(code = cleaned, error = null) }
    }

    fun submit() {
        val code = _state.value.code.trim()
        if (code.length != CodeUiState.CODE_LENGTH || _state.value.submitting) return

        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                repository.verify(code)
                _state.update { it.copy(submitting = false, verified = true) }
            } catch (e: RunException) {
                // The typed code is deliberately kept: a driver who mistyped one
                // character should not have to enter all six again.
                _state.update { it.copy(submitting = false, error = e.error) }
            } catch (e: Exception) {
                android.util.Log.e("HumbleDrive", "Unexpected failure during verify", e)
                _state.update { it.copy(submitting = false, error = RunError.UNKNOWN) }
            }
        }
    }

    /** Explicit factory — no hiltViewModel(), no no-arg constructor reaching
     *  for a global (PRD D-24). */
    class Factory(private val repository: RunRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            CodeViewModel(repository) as T
    }
}
