import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

/**
 * Config comes from local.properties, which is gitignored.
 *
 * Nothing here is a secret in the dangerous sense — the Supabase publishable
 * key can read nothing while RLS has zero policies, and the maps key is
 * render-only. But they are still not committed, and a missing value fails the
 * build loudly rather than shipping an app that mysteriously does nothing.
 */
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun requireProp(name: String): String =
    localProps.getProperty(name)
        ?: System.getenv(name)
        ?: error("Missing $name. Add it to android/local.properties — see the README.")

android {
    namespace = "com.humblecoders.humbledrive"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.humblecoders.humbledrive"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"

        buildConfigField("String", "SUPABASE_URL", "\"${requireProp("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"${requireProp("SUPABASE_PUBLISHABLE_KEY")}\"")
        manifestPlaceholders["mapsApiKey"] = requireProp("MAPS_API_KEY_ANDROID")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.core.splashscreen)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.maps.compose)
    implementation(libs.maps.compose.utils)
    implementation(libs.play.services.maps)
}
