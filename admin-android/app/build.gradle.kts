import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(key: String, env: String) = keystoreProps.getProperty(key) ?: System.getenv(env)

// API address baked into the app's copy of admin/js/config.js. Set GitHub variable ADMIN_API_BASE (HTTPS, ends with /v1).
val adminApiBase: String = (System.getenv("ADMIN_API_BASE")?.takeIf { it.isNotBlank() }
    ?: providers.gradleProperty("adminApiBase").orNull
    ?: "https://api.example.com/v1")

// The admin web app lives in ../admin (single source of truth). It is copied into the APK's assets at build time.
val syncAdminWeb = tasks.register<Copy>("syncAdminWeb") {
    from(rootProject.file("../admin")) {
        exclude("_headers", "README.md", "sw.js", "manifest.webmanifest", "**/.DS_Store")
        filesMatching("js/config.js") {
            filter { line -> if (line.trimStart().startsWith("export const API_BASE")) "export const API_BASE = \"$adminApiBase\";" else line }
        }
    }
    into(layout.buildDirectory.dir("generated/adminAssets/assets"))
}

android {
    namespace = "com.talhastudio.admin"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.talhastudio.admin"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    signingConfigs {
        val storePath = secret("storeFile", "TS_KEYSTORE_PATH")
        if (storePath != null) create("release") {
            storeFile = file(storePath)
            storePassword = secret("storePassword", "TS_KEYSTORE_PASSWORD")
            keyAlias = secret("keyAlias", "TS_ADMIN_KEY_ALIAS")
            keyPassword = secret("keyPassword", "TS_KEY_PASSWORD")
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug" }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/adminAssets"))
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(syncAdminWeb) }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.webkit)
}
