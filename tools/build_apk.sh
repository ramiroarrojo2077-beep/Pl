#!/usr/bin/env bash
#
# Construye el APK de Murallas de Rocanegra sin el SDK de Google.
#
# Usa las herramientas empaquetadas en Debian/Ubuntu (aapt, zipalign, apksigner
# y android.jar de android-sdk-platform-23) más el dexer dx republicado en Maven
# Central. El juego entero (HTML, CSS, JS, modelos) viaja dentro de assets/www,
# así que la aplicación funciona sin red y no pide permisos.
#
#   sudo apt-get install aapt apksigner zipalign android-sdk-platform-23 default-jdk
#   bash tools/build_apk.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/apk"
DIST="$ROOT/dist"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
DX_JAR="$ROOT/tools/lib/dalvik-dx.jar"
DX_URL="https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/14.0.0_r21/dalvik-dx-14.0.0_r21.jar"
KEYSTORE="$ROOT/android/debug.keystore"
APK="$DIST/rocanegra.apk"

say() { printf '\033[36m▸\033[0m %s\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

for tool in aapt zipalign apksigner javac keytool java; do
  command -v "$tool" >/dev/null 2>&1 || die "falta la herramienta '$tool'"
done
[ -f "$ANDROID_JAR" ] || die "no encuentro android.jar en $ANDROID_JAR"

if [ ! -f "$DX_JAR" ]; then
  say "Descargando el dexer (dx)…"
  mkdir -p "$(dirname "$DX_JAR")"
  curl -fsSL "$DX_URL" -o "$DX_JAR" || die "no se pudo descargar dx"
fi

say "Limpiando build anterior"
rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/obj" "$BUILD/assets/www" "$DIST"

say "Copiando el juego a assets/www"
cp "$ROOT/index.html" "$BUILD/assets/www/"
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/vendor" "$BUILD/assets/www/"
# El APK va sin red: fuera la tipografía remota (queda la familia de respaldo).
sed -i '/fonts\.googleapis\.com/d; /fonts\.gstatic\.com/d' "$BUILD/assets/www/index.html"

say "Generando R.java"
aapt package -f -m \
  -J "$BUILD/gen" \
  -M "$ROOT/android/AndroidManifest.xml" \
  -S "$ROOT/android/res" \
  -I "$ANDROID_JAR"

say "Compilando el código Java"
find "$ROOT/android/src" "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
javac -nowarn -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD/obj" \
  @"$BUILD/sources.txt" 2>&1 | grep -v 'bootstrap class path\|source value 8\|target value 8\|^Picked up' || true

say "Convirtiendo a bytecode Dalvik"
java -cp "$DX_JAR" com.android.dx.command.Main \
  --dex --min-sdk-version=23 --output="$BUILD/classes.dex" "$BUILD/obj"

say "Empaquetando recursos y assets"
aapt package -f \
  -M "$ROOT/android/AndroidManifest.xml" \
  -S "$ROOT/android/res" \
  -A "$BUILD/assets" \
  -I "$ANDROID_JAR" \
  -F "$BUILD/app.unsigned.apk"

( cd "$BUILD" && aapt add -f app.unsigned.apk classes.dex >/dev/null )

say "Alineando"
zipalign -f 4 "$BUILD/app.unsigned.apk" "$BUILD/app.aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  say "Creando almacén de claves de depuración"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" -storepass android -keypass android \
    -alias rocanegra -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Murallas de Rocanegra, OU=Juego, O=Rocanegra, C=ES" >/dev/null 2>&1
fi

say "Firmando"
apksigner sign \
  --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias rocanegra \
  --out "$APK" "$BUILD/app.aligned.apk"

apksigner verify "$APK" >/dev/null && say "Firma verificada"

size=$(du -h "$APK" | cut -f1)
say "Listo: $APK ($size)"
aapt dump badging "$APK" | head -4
