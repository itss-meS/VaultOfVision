plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

val compileSdkVer: Int = (rootProject.extra.properties["compileSdkVersion"] as? Int) ?: 35
val minSdkVer: Int = (rootProject.extra.properties["minSdkVersion"] as? Int) ?: 23

android {
    namespace = "ai.redesignededge.engine"
    compileSdk = compileSdkVer

    defaultConfig {
        minSdk = minSdkVer
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = "21"
    }
}

dependencies {
    implementation(project(":capacitor-android"))
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.22.0")
    testImplementation("junit:junit:4.13.2")
}
