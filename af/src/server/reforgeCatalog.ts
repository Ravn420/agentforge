import { execFile } from "child_process";
import fs from "fs";
import path from "path";

export type ReforgeTool = {
  id: string;
  name: string;
  group: string;
  purpose: string;
  bins?: string[];
  /** run = workspace service, adapter = needs a local binary, blocked = not executed */
  policy: "run" | "adapter" | "blocked";
};

export const REFORGE_CATALOG: ReforgeTool[] = [
  { id: "jadx", name: "JADX", group: "Decompile", purpose: "Java and Kotlin decompilation, strings, endpoints", policy: "run", bins: ["jadx"] },
  { id: "apktool", name: "APKTool", group: "Disassemble", purpose: "Decode resources and smali, then rebuild", policy: "run" },
  { id: "smali-editor", name: "Smali editor", group: "Disassemble", purpose: "Edit decoded smali inside the workspace", policy: "run" },
  { id: "apklab", name: "APKLab", group: "Disassemble", purpose: "APKTool project layout for the decoded tree", policy: "run" },
  { id: "bytecode-viewer", name: "Bytecode Viewer", group: "Decompile", purpose: "Compare CFR, Fernflower, Procyon, and Krakatau", policy: "run" },
  { id: "jd-gui", name: "JD-GUI", group: "Decompile", purpose: "Headless JD-CLI decompiler", policy: "run", bins: ["jd-cli"] },
  { id: "cfr", name: "CFR", group: "Decompile", purpose: "CFR 0.152 Java decompiler", policy: "run", bins: ["cfr"] },
  { id: "fernflower", name: "Fernflower", group: "Decompile", purpose: "Vineflower 1.12, the maintained Fernflower", policy: "run", bins: ["fernflower"] },
  { id: "procyon", name: "Procyon", group: "Decompile", purpose: "Procyon 0.6 Java decompiler", policy: "run", bins: ["procyon"] },
  { id: "krakatau", name: "Krakatau", group: "Decompile", purpose: "Krakatau bytecode disassembly", policy: "run", bins: ["krak2"] },
  { id: "jeb", name: "JEB", group: "Decompile", purpose: "Commercial decompiler. Not installed. No license key on this host.", policy: "adapter", bins: ["jeb"] },
  { id: "dex2jar", name: "dex2jar", group: "Disassemble", purpose: "DEX to JAR export", policy: "run", bins: ["d2j-dex2jar"] },
  { id: "baksmali", name: "Baksmali", group: "Disassemble", purpose: "DEX to smali", policy: "run", bins: ["baksmali"] },
  { id: "smali", name: "Smali", group: "Disassemble", purpose: "Assemble smali back to DEX", policy: "run", bins: ["smali"] },
  { id: "oat2dex", name: "Oat2Dex", group: "Disassemble", purpose: "Carve DEX files out of OAT, ODEX, and VDEX", policy: "run", bins: ["oat2dex"] },
  { id: "androguard", name: "Androguard", group: "Analysis", purpose: "Python APK, DEX, and manifest parsing", policy: "run", bins: ["androguard"] },
  { id: "apk-explorer", name: "APK Explorer", group: "Analysis", purpose: "Zip listing of the imported package", policy: "run" },
  { id: "classyshark", name: "ClassyShark", group: "Analysis", purpose: "Package browser. The desktop window is not opened headless.", policy: "run", bins: ["classyshark"] },
  { id: "quark", name: "Quark Engine", group: "Security", purpose: "Behavior description scoring", policy: "run", bins: ["quark"] },
  { id: "mobsf", name: "MobSF", group: "Security", purpose: "Static security scan through the local MobSF service", policy: "run", bins: ["mobsf"] },
  { id: "secret-scanner", name: "Secret scanner", group: "Security", purpose: "High-entropy strings in the decoded tree", policy: "run" },
  { id: "permission-analyzer", name: "Permission analyzer", group: "Security", purpose: "Manifest permission inventory", policy: "run" },
  { id: "manifest-viewer", name: "Manifest viewer", group: "Security", purpose: "Decoded AndroidManifest.xml", policy: "run" },
  { id: "certificate-analyzer", name: "Certificate analyzer", group: "Sign", purpose: "Read signer certificates with keytool", policy: "run", bins: ["keytool"] },
  { id: "rootbeer", name: "RootBeer analysis", group: "Security", purpose: "Find root-detection call sites. Does not disable them.", policy: "run" },
  { id: "libchecker", name: "LibChecker", group: "Native", purpose: "List native libraries and ABIs in the APK", policy: "run" },
  { id: "ghidra", name: "Ghidra", group: "Native", purpose: "Headless ARM and JNI analysis", policy: "run", bins: ["analyzeHeadless"] },
  { id: "ida", name: "IDA Free", group: "Native", purpose: "Native cross-references", policy: "adapter", bins: ["ida", "ida64"] },
  { id: "jni-analyzer", name: "JNI analyzer", group: "Native", purpose: "Java_* exports in .so files", policy: "run" },
  { id: "arm64-disassembler", name: "ARM64 disassembler", group: "Native", purpose: "Disassemble arm64 ELF when llvm-objdump is present", policy: "run", bins: ["llvm-objdump", "objdump"] },
  { id: "elf-analyzer", name: "ELF analyzer", group: "Native", purpose: "ELF headers and needed libraries", policy: "run", bins: ["readelf"] },
  { id: "openjdk", name: "OpenJDK", group: "Build", purpose: "Java runtime used by APKTool and keytool", policy: "run", bins: ["java"] },
  { id: "android-studio", name: "Android Studio", group: "Build", purpose: "Android Studio 2026.2.2 is installed. The GUI is not opened on this host.", policy: "run", bins: ["studio"] },
  { id: "android-sdk", name: "Android SDK", group: "Build", purpose: "sdkmanager, build-tools, and platforms", policy: "run", bins: ["sdkmanager"] },
  { id: "aapt2", name: "AAPT2", group: "Build", purpose: "Compile and link Android resources", policy: "run", bins: ["aapt2"] },
  { id: "d8", name: "D8", group: "Build", purpose: "DEX compiler from build-tools", policy: "run", bins: ["d8"] },
  { id: "r8", name: "R8", group: "Build", purpose: "Shrink and obfuscate DEX", policy: "run", bins: ["r8"] },
  { id: "gradle", name: "Gradle", group: "Build", purpose: "Project builds", policy: "run", bins: ["gradle"] },
  { id: "kotlin", name: "Kotlin compiler", group: "Build", purpose: "kotlinc", policy: "run", bins: ["kotlinc"] },
  { id: "compose", name: "Jetpack Compose tooling", group: "Build", purpose: "Compose compiler plugin jar", policy: "run", bins: ["compose"] },
  { id: "bundletool", name: "Bundletool", group: "Build", purpose: "AAB to APK splits", policy: "run", bins: ["bundletool"] },
  { id: "apksigner", name: "apksigner", group: "Sign", purpose: "APK Signature Scheme v1/v2/v3", policy: "run", bins: ["apksigner"] },
  { id: "zipalign", name: "zipalign", group: "Sign", purpose: "Align the rebuilt package to 4 bytes", policy: "run", bins: ["zipalign"] },
  { id: "uber-signer", name: "Uber APK Signer", group: "Sign", purpose: "zipalign plus apksigner wrapper", policy: "run", bins: ["uber-apk-signer"] },
  { id: "keytool", name: "keytool", group: "Sign", purpose: "Debug keystore and certificate fingerprints", policy: "run", bins: ["keytool"] },
  { id: "jarsigner", name: "jarsigner", group: "Sign", purpose: "JAR signature (v1)", policy: "run", bins: ["jarsigner"] },
  { id: "adb", name: "ADB", group: "Device", purpose: "Install, pull, shell", policy: "run", bins: ["adb"] },
  { id: "fastboot", name: "Fastboot", group: "Device", purpose: "Bootloader device listing", policy: "run", bins: ["fastboot"] },
  { id: "logcat", name: "Logcat", group: "Device", purpose: "Device logs through ADB", policy: "run", bins: ["adb"] },
  { id: "emulator", name: "Android Emulator", group: "Device", purpose: "SDK emulator binary. No system image is booted from here.", policy: "run", bins: ["emulator"] },
  { id: "genymotion", name: "Genymotion", group: "Device", purpose: "Commercial emulator. Not installed.", policy: "adapter", bins: ["genymotion", "gmtool"] },
  { id: "scrcpy", name: "scrcpy", group: "Device", purpose: "Mirror a device screen", policy: "run", bins: ["scrcpy"] },
  { id: "frida", name: "Frida", group: "Runtime", purpose: "Trace-only scripts. Original return values stay intact.", policy: "run", bins: ["frida"] },
  { id: "frida-server", name: "Frida server", group: "Runtime", purpose: "Matching device binaries. Not started on this host.", policy: "run", bins: ["frida-server"] },
  { id: "objection", name: "Objection", group: "Runtime", purpose: "Runtime exploration. Does not disable protections.", policy: "run", bins: ["objection"] },
  { id: "sqlite-browser", name: "SQLite browser", group: "Runtime", purpose: "sqlite3 CLI for pulled databases. The desktop GUI is not installed.", policy: "run", bins: ["sqlite3"] },
  { id: "room-inspector", name: "Room inspector", group: "Runtime", purpose: "Room schema from the decoded tree", policy: "run" },
  { id: "burp", name: "Burp Suite", group: "Network", purpose: "Official PortSwigger 2026.10.1. No Professional key is loaded. The proxy is not started.", policy: "run", bins: ["burp"] },
  { id: "mitmproxy", name: "mitmproxy", group: "Network", purpose: "HTTP proxy. Not left running.", policy: "run", bins: ["mitmproxy"] },
  { id: "charles", name: "Charles Proxy", group: "Network", purpose: "Commercial proxy. Not installed.", policy: "adapter", bins: ["charles"] },
  { id: "wireshark", name: "Wireshark", group: "Network", purpose: "tshark packet capture. The desktop GUI is not opened.", policy: "run", bins: ["tshark", "wireshark"] },
  { id: "network-inspector", name: "Network inspector", group: "Network", purpose: "Endpoint list from captured or static URLs", policy: "run" },
  { id: "memory-profiler", name: "Memory profiler", group: "Profile", purpose: "Ships inside Android Studio. No separate headless profiler is installed.", policy: "adapter" },
  { id: "cpu-profiler", name: "CPU profiler", group: "Profile", purpose: "Ships inside Android Studio. No separate headless profiler is installed.", policy: "adapter" },
  { id: "layout-inspector", name: "Layout inspector", group: "Profile", purpose: "Ships inside Android Studio. No separate headless inspector is installed.", policy: "adapter" },
  { id: "python", name: "Python", group: "Host", purpose: "Host runtime for Androguard and Frida", policy: "run", bins: ["python3"] },
  { id: "node", name: "Node.js", group: "Host", purpose: "AgentForge server runtime", policy: "run", bins: ["node"] },
  { id: "git", name: "Git", group: "Host", purpose: "Workspace history", policy: "run", bins: ["git"] },
  { id: "gh", name: "GitHub CLI", group: "Host", purpose: "GitHub from this workspace", policy: "run", bins: ["gh"] },
  { id: "docker", name: "Docker", group: "Host", purpose: "Docker client. The daemon is not started on this host.", policy: "run", bins: ["docker"] },
  { id: "magisk", name: "Magisk", group: "Frameworks", purpose: "Device bridge: Magisk app, version, and module list.", policy: "run" },
  { id: "lsposed", name: "LSPosed", group: "Frameworks", purpose: "Device bridge: LSPosed manager and Zygisk module.", policy: "run" },
  { id: "xposed", name: "Xposed", group: "Frameworks", purpose: "Device bridge: legacy Xposed manager package.", policy: "run" },
  { id: "rootavd", name: "RootAVD", group: "Device", purpose: "Script is installed. It is not run against an emulator from here.", policy: "run", bins: ["rootavd"] },
  { id: "payload-dumper", name: "Payload dumper", group: "Disassemble", purpose: "Read an OTA payload.bin header and list image metadata you supply.", policy: "run" },
  { id: "drozer", name: "Drozer", group: "Security", purpose: "Android component assessment console.", policy: "run", bins: ["drozer"] },
  { id: "medusa", name: "Medusa", group: "Runtime", purpose: "Frida session manager. Attack scripts are not launched.", policy: "run", bins: ["medusa"] },
  { id: "reflutter", name: "ReFlutter", group: "Decompile", purpose: "Locate a Flutter engine. Does not patch the engine.", policy: "run", bins: ["reflutter"] },
];

const WORKSPACE_TOOLS = new Set([
  "smali-editor",
  "apklab",
  "apk-explorer",
  "secret-scanner",
  "permission-analyzer",
  "manifest-viewer",
  "rootbeer",
  "libchecker",
  "jni-analyzer",
  "network-inspector",
  "room-inspector",
  "magisk",
  "lsposed",
  "xposed",
  "payload-dumper",
]);

const BUNDLED: Record<string, string> = {
  jadx: "jadx/bin/jadx",
  ghidra: "ghidra/ghidra_12.2_PUBLIC/support/analyzeHeadless",
  mobsf: "mobsf/manage.py",
  apksigner: "build-tools/android-16/apksigner",
  zipalign: "build-tools/android-16/zipalign",
  d8: "build-tools/android-16/d8",
  aapt2: "build-tools/android-16/aapt2",
  r8: "sign/r8.jar",
  "uber-signer": "sign/uber-apk-signer.jar",
  adb: "platform-tools/adb",
  fastboot: "platform-tools/fastboot",
  logcat: "platform-tools/adb",
  cfr: "decompilers/cfr.jar",
  fernflower: "decompilers/vineflower.jar",
  procyon: "decompilers/procyon.jar",
  "jd-gui": "decompilers/jd-cli.jar",
  classyshark: "decompilers/ClassyShark.jar",
  dex2jar: "decompilers/dex-tools-v2.4/d2j-dex2jar.sh",
  baksmali: "decompilers/dex-tools-v2.4/d2j-baksmali.sh",
  smali: "decompilers/dex-tools-v2.4/d2j-smali.sh",
  krakatau: "decompilers/krakatau/target/release/krak2",
  oat2dex: "decompilers/oat2dex",
  "frida-server": "frida-server/frida-server-17.25.2-android-arm64",
  compose: "compose/compose-compiler.jar",
  burp: "burp/burpsuite_desktop_v2026.10.1.jar",
  bundletool: "bundletool/bundletool.jar",
};

function which(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("which", [bin], { timeout: 2500 }, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null);
    });
  });
}

export async function probeTool(tool: ReforgeTool, apktoolJar: string): Promise<{ status: string; path?: string }> {
  if (tool.policy === "blocked") return { status: "blocked" };
  const absent = tool.policy === "adapter" ? "adapter" : "missing";
  if (tool.id === "apktool") {
    return fs.existsSync(apktoolJar) ? { status: "ready", path: apktoolJar } : { status: absent };
  }
  const toolsDir = path.dirname(apktoolJar);
  if (tool.id === "bytecode-viewer") {
    const jars = ["cfr.jar", "vineflower.jar", "procyon.jar", "krakatau/target/release/krak2"]
      .map((name) => path.join(toolsDir, "decompilers", name))
      .filter((file) => fs.existsSync(file));
    return jars.length ? { status: "ready", path: jars[0] } : { status: absent };
  }
  if (WORKSPACE_TOOLS.has(tool.id)) return { status: "ready" };
  if (tool.id === "frida") {
    const bundled = "/root/.local/bin/frida";
    if (fs.existsSync(bundled)) return { status: "ready", path: bundled };
  }
  const rel = BUNDLED[tool.id];
  if (rel) {
    const bundled = path.join(toolsDir, rel);
    if (fs.existsSync(bundled)) return { status: "ready", path: bundled };
  }
  if (tool.bins?.length) {
    for (const bin of tool.bins) {
      const found = await which(bin);
      if (found && fs.existsSync(found)) return { status: "ready", path: found };
    }
  }
  return { status: absent };
}

export function findTool(id: string): ReforgeTool | undefined {
  return REFORGE_CATALOG.find((t) => t.id === id);
}

export function apktoolJarPath(): string {
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "tools", "apktool.jar");
}
