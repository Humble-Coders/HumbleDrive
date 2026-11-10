package com.humblecoders.humbledrive.di

import android.content.Context
import com.humblecoders.humbledrive.BuildConfig
import com.humblecoders.humbledrive.data.RunRepositoryImpl
import com.humblecoders.humbledrive.data.TokenStore
import com.humblecoders.humbledrive.domain.RunRepository

/**
 * Manual dependency injection (PRD D-24). No Hilt, no Koin, no annotation
 * processors.
 *
 * Constructed once in Application.onCreate() and reachable ONLY through the
 * Application instance. There is deliberately no `object AppContainer` and no
 * static accessor: a global service locator is what manual DI drifts into, and
 * it is easy to add now and impossible to remove once every screen depends on
 * it.
 *
 * Everything it exposes is an interface from `domain`, so a ViewModel can be
 * tested against a fake with no Android runtime.
 */
class AppContainer(context: Context) {

    private val tokenStore = TokenStore(context.applicationContext)

    val runRepository: RunRepository = RunRepositoryImpl(
        baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/'),
        publishableKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY,
        store = tokenStore,
    )
}
