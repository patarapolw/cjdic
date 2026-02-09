# Tauri + Vue + TypeScript

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Development

### Desktop (Windows, macOS, Linux)

Run the development server:
```bash
pnpm dev:desktop
```

Build for production:
```bash
pnpm build:desktop
```

### Android Setup

#### Prerequisites

1. **Java Development Kit (JDK 17 or later)** - Download from [oracle.com](https://www.oracle.com/java/technologies/downloads/) or use a package manager
2. **Android SDK** - Install via Android Studio or command line tools
3. **NDK (Native Development Kit)** - Required for Rust compilation
4. **Rust** - Install from [rustup.rs](https://rustup.rs/) with Android targets:
   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
   ```
5. **Rust Analyzer** for IDE support (optional but recommended)

#### Environment Variables

Set these environment variables:
```bash
# Windows (PowerShell)
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17" # Adjust path as needed
$env:ANDROID_HOME = "$env:USERPROFILE\AppData\Local\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\25.2.9519653" # Adjust NDK version as needed

# macOS/Linux
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=$HOME/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/25.2.9519653
```

#### Initial Setup

Initialize the Android project:
```bash
pnpm init:android
```

#### Development & Testing

Start development server for Android:
```bash
pnpm dev:android
```

Build debug APK:
```bash
pnpm build:android
```

Install APK on connected device:
```bash
pnpm install:android
```

Ensure you have a device connected via USB with USB debugging enabled, or an Android emulator running.

## Type Support For `.vue` Imports in TS

Since TypeScript cannot handle type information for `.vue` imports, they are shimmed to be a generic Vue component type by default. In most cases this is fine if you don't really care about component prop types outside of templates. However, if you wish to get actual prop types in `.vue` imports (for example to get props validation when using manual `h(...)` calls), you can enable Volar's Take Over mode by following these steps:

1. Run `Extensions: Show Built-in Extensions` from VS Code's command palette, look for `TypeScript and JavaScript Language Features`, then right click and select `Disable (Workspace)`. By default, Take Over mode will enable itself if the default TypeScript extension is disabled.
2. Reload the VS Code window by running `Developer: Reload Window` from the command palette.

You can learn more about Take Over mode [here](https://github.com/johnsoncodehk/volar/discussions/471).
