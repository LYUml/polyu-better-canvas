#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f src-tauri/icons/icon.icns ] || [ assets/app-icon.svg -nt src-tauri/icons/icon.icns ]; then
  npx --no-install tauri icon assets/app-icon.svg --output src-tauri/icons
fi
mkdir -p src-tauri/resources
bridge="src-tauri/resources/NativeBridge.app"
mkdir -p "$bridge/Contents/MacOS"
if [ ! -f "$bridge/Contents/MacOS/NativeBridge" ] || [ src-tauri/native/NativeBridge.swift -nt "$bridge/Contents/MacOS/NativeBridge" ]; then
  xcrun swiftc -O -target arm64-apple-macos13.0 src-tauri/native/NativeBridge.swift -o "$bridge/Contents/MacOS/NativeBridge"
fi
python3 - <<'PY'
import plistlib
from pathlib import Path
p=Path('src-tauri/resources/NativeBridge.app/Contents/Info.plist')
info={'CFBundleIdentifier':'local.polyu.canvas.localized.bridge','CFBundleName':'PolyU Better Canvas · Native','CFBundleDisplayName':'PolyU Better Canvas · Native','CFBundleExecutable':'NativeBridge','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.2.0','CFBundleVersion':'1','LSMinimumSystemVersion':'13.0','LSUIElement':True,'NSHighResolutionCapable':True,'NSDesktopFolderUsageDescription':'Read your selected course library folder.','NSDocumentsFolderUsageDescription':'Manage your chosen library and calendar exports.'}
p.write_bytes(plistlib.dumps(info))
PY
for attribute in com.apple.FinderInfo com.apple.ResourceFork; do
  xattr -dr "$attribute" "$bridge" 2>/dev/null || true
done
codesign --force --sign - "$bridge"
if [ ! -f src-tauri/resources/DocumentReader ] || [ src-tauri/native/DocumentReader.swift -nt src-tauri/resources/DocumentReader ]; then
  xcrun swiftc -O -target arm64-apple-macos13.0 src-tauri/native/DocumentReader.swift -o src-tauri/resources/DocumentReader
  codesign --force --sign - src-tauri/resources/DocumentReader
fi
