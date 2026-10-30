import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Release signing is read from keystore.properties (local) or env vars (CI). Never committed.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(key: String, env: String) = keystoreProps.getProperty(key) ?: System.getenv(env)

// API address: CI/CLI can override with env API_BASE_URL or -PapiBaseUrl (must end with /v1/ and be HTTPS for release).
val apiOverride: String? = System.getenv("API_BASE_URL")?.takeIf { it.isNotBlank() } ?: providers.gradleProperty("apiBaseUrl").orNull
// Google Sign-In "Web client ID" from Google Cloud (OAuth). When blank, the Google button is hidden.
val googleClientId: String = System.getenv("GOOGLE_WEB_CLIENT_ID")?.takeIf { it.isNotBlank() } ?: providers.gradleProperty("googleWebClientId").orNull ?: ""
fun apiUrl(default: String) = "\"" + (apiOverride ?: default).let { if (it.endsWith("/")) it else "$it/" } + "\""

// Push needs app/google-services.json from your Firebase project (kept out of git; CI decodes it from a secret).
// Without the file the app still builds and runs; push is simply unavailable and the in-app inbox keeps working.
if (file("google-services.json").exists()) pluginManager.apply("com.google.gms.google-services")

android {
    namespace = "com.talhastudio.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.talhastudio.app"
        minSdk = 24
        targetSdk = 35
        // CI passes -PversionCode=<run number>; every Play upload needs a higher code than the last.
        versionCode = (providers.gradleProperty("versionCode").orNull ?: "1").toInt()
        versionName = providers.gradleProperty("versionName").orNull ?: "1.0.0"
        // Backend base URL. Override per build type; must be HTTPS in production.
        buildConfigField("String", "API_BASE_URL", apiUrl("https://api.example.com/v1/"))
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleClientId\"")
    }

    signingConfigs {
        val storePath = secret("storeFile", "TS_KEYSTORE_PATH")
        if (storePath != null) {
            create("release") {
                storeFile = file(storePath)
                storePassword = secret("storePassword", "TS_KEYSTORE_PASSWORD")
                keyAlias = secret("keyAlias", "TS_KEY_ALIAS")
                keyPassword = secret("keyPassword", "TS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            buildConfigField("String", "API_BASE_URL", apiUrl("http://10.0.2.2:4000/v1/"))
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true   // java.time on Android 7 (minSdk 24)
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.coil.compose)
    implementation(libs.androidx.work)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    implementation(libs.googleid)
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.2")
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
