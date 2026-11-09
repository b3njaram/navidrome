# All bridge messages use AndroidX WebMessageListener; do not expose Java methods to arbitrary frames.
-keep class androidx.media3.** { *; }
