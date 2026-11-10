package com.humblecoders.humbledrive

import android.app.Application
import com.humblecoders.humbledrive.di.AppContainer

class HumbleDriveApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
