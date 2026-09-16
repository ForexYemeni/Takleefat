#!/bin/bash
# الجولة 54 — تحميل أدوات بناء أندرويد لبيئة sandbox
set -x
TOOLS=/home/z/my-project/scripts/android-build
mkdir -p "$TOOLS/downloads"
cd "$TOOLS/downloads"

# 1) Android cmdline-tools (الأحدث المستقر)
curl -fL --retry 3 -o cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
  && echo "CMDLINE_TOOLS_OK" || echo "CMDLINE_TOOLS_FAIL"

# 2) Gradle 8.9
curl -fL --retry 3 -o gradle-8.9-bin.zip \
  https://services.gradle.org/distributions/gradle-8.9-bin.zip \
  && echo "GRADLE_OK" || echo "GRADLE_FAIL"

ls -la
echo "ALL_DOWNLOADS_DONE"
