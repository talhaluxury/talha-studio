-keep class com.talhastudio.app.data.** { *; }

# Encrypted login storage (androidx.security / Tink)
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn com.google.api.client.**
-dontwarn org.joda.time.**
-dontwarn com.google.crypto.tink.util.KeysDownloader
