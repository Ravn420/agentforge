import React, { useState, useRef, useEffect } from "react";
import api from "./api";

export interface AndroidReforgeViewProps {
  initialApkName?: string;
  selectedModel: string;
  onBack: () => void;
  notify: (msg: string) => void;
}

export type WorkbenchTab =
  | "dashboard"
  | "pipeline"
  | "toolchain"
  | "frameworks"
  | "artifacts"
  | "devices"
  | "runtime"
  | "apk_explorer"
  | "manifest"
  | "resources"
  | "smali"
  | "source"
  | "security"
  | "native"
  | "bytecode_viewer"
  | "frida"
  | "adb"
  | "objection"
  | "network"
  | "build_sign"
  | "agent_tasks"
  | "report";

type ConnectedAdbDevice = { serial: string; raw: string };

/** Device rows from `adb devices -l`. The header and daemon status lines are not devices. */
function parseAdbDevicesStdout(stdout: string): ConnectedAdbDevice[] {
  const devices: ConnectedAdbDevice[] = [];
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    if (/^list of devices attached$/i.test(raw)) continue;
    if (raw.startsWith("*")) continue;
    const parts = raw.split(/\s+/);
    const serial = parts[0];
    const state = parts[1];
    if (!serial || state !== "device") continue;
    devices.push({ serial, raw });
  }
  return devices;
}

export const AndroidReforgeView: React.FC<AndroidReforgeViewProps> = ({
  initialApkName = "",
  selectedModel,
  onBack,
  notify,
}) => {
  const [apkName, setApkName] = useState(initialApkName);
  const [appMode, setAppMode] = useState<"setup" | "workbench">("workbench");
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("dashboard");
  const [selectedReforgeModel, setSelectedReforgeModel] = useState<string>(selectedModel || "gemini-2.5-flash");

  // Progress Bar States for Upload & Local Workspace File Selection
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>("Ready to upload");
  const [uploadBytesText, setUploadBytesText] = useState<string>("0.00 MB / 0.00 MB");
  const [uploadSpeedText, setUploadSpeedText] = useState<string>("0.0 MB/s");
  const [uploadEtaText, setUploadEtaText] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [selectedFileSize, setSelectedFileSize] = useState<string>("");
  const [isLocalPickerOpen, setIsLocalPickerOpen] = useState(false);
  const [localApksList, setLocalApksList] = useState<Array<{ filename: string; formattedSize: string; modifiedAt: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Core Application Metadata & Disassembled Resources
  const [analysisResult, setAnalysisResult] = useState({
    appName: "No APK loaded",
    packageName: "",
    version: "",
    minSdkVersion: null as number | null,
    targetSdkVersion: null as number | null,
    permissions: [] as string[],
    entries: [] as string[],
    featuresNotes: [] as Array<{ title: string; location: string; description: string }>,
    manifestXml: "",
    jadxCode: "",
    apktoolSmali: "",
    ghidraNative: "",
    fridaScript: "",
    burpTraffic: "",
    stringsXml: "",
    colorsXml: "",
    layoutXml: "",
  });

  // Original baseline code for diff tracking
  const [originalJadxCode, setOriginalJadxCode] = useState(analysisResult.jadxCode);

  // Signing Configuration
  const [keystoreType, setKeystoreType] = useState<"debug" | "release">("debug");
  const [keyAlias, setKeyAlias] = useState<string>("androiddebugkey");
  const [keyPassword, setKeyPassword] = useState<string>("android");
  const [v1Signing, setV1Signing] = useState<boolean>(true);
  const [v2Signing, setV2Signing] = useState<boolean>(true);
  const [v3Signing, setV3Signing] = useState<boolean>(true);
  const [isSigning, setIsSigning] = useState(false);
  const [apksignerLogs, setApksignerLogs] = useState<string[]>([]);
  const [rebuiltApkUrl, setRebuiltApkUrl] = useState<string | null>(null);
  const [rebuiltApkSize, setRebuiltApkSize] = useState<string | null>(null);
  const [decompilers, setDecompilers] = useState<Record<string, string>>({});
  const [decompiling, setDecompiling] = useState(false);

  // Pipeline Stages (14-Stage Visual Workflow)
  const [pipelineStages, setPipelineStages] = useState([
    { id: "import", name: "1. APK/AAB Import", tool: "Uploader", status: "pending", result: "Not run" },
    { id: "static_analysis", name: "2. Static Analysis", tool: "JADX", status: "pending", result: "Not run" },
    { id: "manifest_analysis", name: "3. Manifest Analysis", tool: "apktool", status: "pending", result: "Not run" },
    { id: "resource_extraction", name: "4. Resource Extraction", tool: "apktool", status: "pending", result: "Not run" },
    { id: "source_decompilation", name: "5. Source Decompilation", tool: "JADX", status: "pending", result: "Not run" },
    { id: "smali_generation", name: "6. Smali Generation", tool: "baksmali", status: "pending", result: "Not run" },
    { id: "security_analysis", name: "7. Security Analysis", tool: "MobSF", status: "pending", result: "Not run" },
    { id: "native_analysis", name: "8. Native Library Analysis", tool: "Ghidra", status: "pending", result: "Not run" },
    { id: "modification_stage", name: "9. Modification Stage", tool: "Editor", status: "pending", result: "Not run" },
    { id: "build_stage", name: "10. Build Stage", tool: "apktool", status: "pending", result: "Not run" },
    { id: "signing_stage", name: "11. Signing Stage", tool: "apksigner", status: "pending", result: "Not run" },
    { id: "deployment_stage", name: "12. Deployment Stage", tool: "ADB", status: "pending", result: "Not run" },
    { id: "runtime_testing", name: "13. Runtime Testing", tool: "Frida", status: "pending", result: "Not run" },
    { id: "report_generation", name: "14. Report Generation", tool: "Report", status: "pending", result: "Not run" },
  ]);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [toolOutput, setToolOutput] = useState<string>("");
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const [labTools, setLabTools] = useState<Array<{ id: string; name: string; group: string; purpose: string; status: string }>>([]);
  const [frameworks, setFrameworks] = useState<any>(null);

  // Agent Task Runner States
  const [agentInstruction, setAgentInstruction] = useState("Add dark mode support and write a security report");
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentPlan, setAgentPlan] = useState<Array<{ agent: string; action: string; status: string; role?: string; tool?: string }>>([]);
  const [agentCrew, setAgentCrew] = useState<Array<{ id: string; name: string; emoji: string; role: string }>>([
    { id: "atlas", name: "Atlas", emoji: "🧭", role: "Planner" },
    { id: "dexscout", name: "DexScout", emoji: "🔍", role: "Disassembler" },
    { id: "flowseeker", name: "FlowSeeker", emoji: "🌊", role: "Analyst" },
    { id: "phantom", name: "Phantom", emoji: "🕵️", role: "Surface Mapper" },
    { id: "cipher", name: "Cipher", emoji: "🛡️", role: "Binary Auditor" },
    { id: "spectre", name: "Spectre", emoji: "🔬", role: "Traffic Reviewer" },
    { id: "vector", name: "Vector", emoji: "🤖", role: "Device Lab" },
    { id: "apkforge", name: "ApkForge", emoji: "📦", role: "Reassembler" },
    { id: "warden", name: "Warden", emoji: "🛡️", role: "Reviewer" },
    { id: "scribe", name: "Scribe", emoji: "📜", role: "Writer" },
  ]);
  const [agentExplanation, setAgentExplanation] = useState<string | null>(null);

  // ADB Console Terminal States
  const [adbCommand, setAdbCommand] = useState("devices -l");
  const [adbLogs, setAdbLogs] = useState<string[]>(["Native ADB bridge idle. Run a command."]);
  const [adbDevices, setAdbDevices] = useState<ConnectedAdbDevice[]>([]);

  // Frida Console States
  const [fridaConsoleLogs, setFridaConsoleLogs] = useState<string[]>(["Frida is idle. No process is attached."]);
  const [securityScore, setSecurityScore] = useState<number | null>(null);
  const [securityFindings, setSecurityFindings] = useState<Array<{ id: string; title: string; severity: string; cvss?: number; cwe?: string; file: string; description: string; recommendation: string }>>([]);

  // Audit Report State
  const [reportMarkdown, setReportMarkdown] = useState<string>("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Handle Keystore Switch
  const handleSelectKeystore = (type: "debug" | "release") => {
    setKeystoreType(type);
    if (type === "debug") {
      setKeyAlias("androiddebugkey");
      setKeyPassword("android");
    } else {
      setKeyAlias("release_key");
      setKeyPassword("");
    }
  };

  // Upload Handling with Direct Binary Stream & Real-Time Speed/ETA Calculation
  const triggerUploadAndDisassemble = async (fileName: string, fileSizeStr: string, rawFile?: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setSelectedFileSize(fileSizeStr);
    setUploadStatusText("Initiating high-speed stream upload...");
    setUploadBytesText(`0.00 MB / ${fileSizeStr}`);
    setUploadSpeedText("0.0 MB/s");
    setUploadEtaText("Estimating...");

    let uploaded = false;
    try {
      if (rawFile) {
        const uploadRes = await api.uploadApkStream(rawFile, (percent, loaded, total, speedMb, etaSec) => {
          setUploadProgress(percent >= 100 ? 99 : percent);
          const loadedMb = (loaded / (1024 * 1024)).toFixed(2);
          const totalMb = (total / (1024 * 1024)).toFixed(2);
          setUploadBytesText(`${loadedMb} MB / ${totalMb} MB`);
          setUploadSpeedText(`${speedMb} MB/s`);
          setUploadEtaText(etaSec > 0 ? `${etaSec}s left` : "Finalizing...");
          setUploadStatusText(
            percent < 100
              ? `Streaming payload (${percent}% · ${speedMb} MB/s)...`
              : "Finalizing upload..."
          );
        });
        uploaded = uploadRes?.success === true;
        if (!uploaded) {
          setUploadStatusText(uploadRes?.error || "Upload did not succeed. Nothing was written.");
        }
      } else {
        setUploadProgress(50);
        setUploadBytesText(`${fileSizeStr} / ${fileSizeStr}`);
        setUploadStatusText("Loading sample APK...");
        const uploadRes = await api.uploadApkSample(fileName);
        uploaded = uploadRes?.success === true;
        if (uploaded) {
          setUploadProgress(100);
        } else {
          setUploadStatusText(uploadRes?.error || "Upload did not succeed. Nothing was written.");
        }
      }

      if (uploaded) {
        setApkName(fileName);
        setUploadStatusText("Upload complete. Reading the package...");
      }

      const data = await api.disassembleApk(fileName, selectedReforgeModel);
      const disassembled = !!(data && data.success && data.result);
      if (disassembled) {
        setAnalysisResult((prev) => ({
          ...prev,
          appName: data.result.appName || fileName,
          packageName: data.result.packageName || "",
          version: data.result.version || "",
          minSdkVersion: data.result.minSdkVersion ?? null,
          targetSdkVersion: data.result.targetSdkVersion ?? null,
          permissions: data.result.permissions || [],
          entries: data.result.entries || [],
          featuresNotes: data.result.featuresNotes || [],
          manifestXml: data.result.manifestXml || "",
          stringsXml: data.result.stringsXml || "",
          colorsXml: data.result.colorsXml || "",
          layoutXml: data.result.layoutXml || "",
          jadxCode: data.result.jadxCode || "",
          apktoolSmali: data.result.apktoolSmali || "",
          ghidraNative: data.result.ghidraNative || "",
          fridaScript: data.result.fridaScript || "",
          burpTraffic: data.result.burpTraffic || "",
        }));
        setOriginalJadxCode(data.result.jadxCode || "");
      }
      if (uploaded) setAppMode("workbench");
      if (uploaded && disassembled) {
        notify(`APK "${fileName}" uploaded and disassembled.`);
      } else if (uploaded) {
        notify(`APK "${fileName}" uploaded. Disassembly did not return a result.`);
      } else {
        notify("Upload did not succeed. Nothing was written.");
      }
    } catch (err: any) {
      const failureText = err?.message || "Upload or disassembly failed.";
      setUploadStatusText(failureText);
      notify(failureText);
    } finally {
      setIsUploading(false);
      if (uploaded) setUploadProgress(100);
      else setUploadProgress(0);
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    await triggerUploadAndDisassemble(file.name, sizeStr, file);
  };

  // Open Local Server Workspace Picker (Attach to existing local disk files with 0 upload time)
  const handleOpenLocalPicker = async () => {
    try {
      const res = await api.listLocalWorkspaceApks();
      if (res && res.files) {
        setLocalApksList(res.files);
      }
    } catch {}
    setIsLocalPickerOpen(true);
  };

  const handleSelectLocalApk = async (filename: string, sizeStr: string) => {
    setIsLocalPickerOpen(false);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatusText(`Attaching to local server workspace file '${filename}'...`);

    try {
      const loaded = await api.loadLocalWorkspaceApk(filename);
      if (!loaded || loaded.success !== true) {
        setUploadProgress(0);
        setUploadStatusText(loaded?.error || "Local file was not attached. Nothing was written.");
        notify(loaded?.error || "Local file was not attached. Nothing was written.");
        return;
      }
      setUploadProgress(100);
      setUploadBytesText(`${sizeStr} / ${sizeStr}`);
      const data = await api.disassembleApk(filename, selectedReforgeModel);
      const disassembled = !!(data && data.success && data.result);
      if (disassembled) {
        setAnalysisResult((prev) => ({
          ...prev,
          appName: data.result.appName || filename,
          packageName: data.result.packageName || "",
          version: data.result.version || "",
          minSdkVersion: data.result.minSdkVersion ?? null,
          targetSdkVersion: data.result.targetSdkVersion ?? null,
          permissions: data.result.permissions || [],
          entries: data.result.entries || [],
          featuresNotes: data.result.featuresNotes || [],
          manifestXml: data.result.manifestXml || "",
          stringsXml: data.result.stringsXml || "",
          colorsXml: data.result.colorsXml || "",
          layoutXml: data.result.layoutXml || "",
          jadxCode: data.result.jadxCode || "",
          apktoolSmali: data.result.apktoolSmali || "",
          ghidraNative: data.result.ghidraNative || "",
          fridaScript: data.result.fridaScript || "",
          burpTraffic: data.result.burpTraffic || "",
        }));
        setOriginalJadxCode(data.result.jadxCode || "");
      }
      setApkName(filename);
      setSelectedFileSize(sizeStr);
      setAppMode("workbench");
      notify(
        disassembled
          ? `Attached to local file "${filename}".`
          : `Attached to "${filename}". Disassembly did not return a result.`
      );
    } catch (err: any) {
      notify(err?.message || "Local file was not attached.");
    } finally {
      setIsUploading(false);
    }
  };

  // Run All Pipeline Stages Sequentially
  const handleRunFullPipeline = async () => {
    setIsPipelineRunning(true);
    notify("🚀 Executing 14-stage Android Reforge Pipeline...");

    let failed = 0;
    for (let i = 0; i < pipelineStages.length; i++) {
      const stage = pipelineStages[i];
      setPipelineStages((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "running", result: "Processing..." } : s))
      );
      try {
        const result = await api.runPipelineStage(stage.id, apkName);
        if (!result?.success) throw new Error(result?.error || result?.message || "Stage failed");
        setPipelineStages((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "completed", result: result.message || "Stage finished" } : s))
        );
      } catch (err: any) {
        failed += 1;
        setPipelineStages((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "failed", result: err?.message || "Stage failed" } : s))
        );
      }
    }
    setIsPipelineRunning(false);
    notify(failed ? `Pipeline finished with ${failed} failed stage${failed === 1 ? "" : "s"}.` : "All 14 pipeline stages finished.");
  };

  useEffect(() => {
    if (activeTab === "toolchain") {
      fetch("/api/android-reforge/toolchain")
        .then((r) => r.json())
        .then((data) => setLabTools(data.tools || []))
        .catch(() => {});
    }
    if (activeTab === "frameworks") {
      fetch("/api/android-reforge/frameworks")
        .then((r) => {
          if (!r.ok) throw new Error("Framework query failed");
          return r.json();
        })
        .then((data) => {
          if (data?.success === false) throw new Error(data.error || "Framework query failed");
          setFrameworks(data);
        })
        .catch(() => setFrameworks(null));
    }
    if (activeTab === "adb" || activeTab === "devices") {
      if (typeof api.executeToolchain === "function") {
        api.executeToolchain("adb", apkName, { command: "devices -l" })
          .then((res) => {
            if (res?.success !== true) {
              setAdbDevices([]);
              return;
            }
            const stdout = String(res?.stdout ?? "");
            setAdbDevices(parseAdbDevicesStdout(stdout));
            if (stdout) setAdbLogs((prev) => [`$ adb devices -l`, ...stdout.split("\n"), ...prev].slice(0, 80));
          })
          .catch(() => setAdbDevices([]));
      }
    }
  }, [activeTab, apkName]);

  useEffect(() => {
    let cancelled = false;
    if (typeof api.executeToolchain !== "function") return;
    api.executeToolchain("adb", apkName, { command: "devices -l" })
      .then((res) => {
        if (cancelled) return;
        if (res?.success !== true) {
          setAdbDevices([]);
          return;
        }
        setAdbDevices(parseAdbDevicesStdout(String(res?.stdout ?? "")));
      })
      .catch(() => {
        if (!cancelled) setAdbDevices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apkName]);

  const handleRunTool = async (tool: string) => {
    setToolBusy(tool);
    try {
      const res = await api.executeToolchain(tool, apkName, tool === "apktool" ? { mode: "decode" } : {});
      setToolOutput(JSON.stringify(res.output || res, null, 2));
      if (tool === "frida") {
        if (res.output?.generatedScript) {
          setAnalysisResult((prev) => ({ ...prev, fridaScript: res.output.generatedScript }));
        }
        setFridaConsoleLogs((prev) => [
          res.output?.note || "Frida returned no attachment note.",
          res.output?.devices || "",
          ...prev,
        ]);
        notify(res.output?.note || "Frida attachment check returned no note.");
        return;
      }
      if (tool === "apktool" && res?.success === true && res.output?.manifest) {
        setAnalysisResult((prev) => ({ ...prev, manifestXml: res.output.manifest }));
      }
      const status = res?.status;
      const note = String(res?.output?.note || "");
      if (status === "ready" || status === "not-run") {
        notify(`${tool} is installed. The action was not run.`);
      } else if (status === "failed" || res?.success === false) {
        notify(res?.error || note || `${tool} did not succeed. Nothing was written.`);
      } else if (res?.success === true && status === "completed") {
        notify(`${tool} finished.`);
      } else if (note) {
        notify(note);
      } else {
        notify(res?.error || `${tool} did not finish.`);
      }
    } catch (err: any) {
      setToolOutput(err?.message || "Tool failed");
      notify(err?.message || "Tool failed");
    } finally {
      setToolBusy(null);
    }
  };

  // Run Single Stage
  const handleRunSingleStage = async (stageId: string) => {
    setPipelineStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, status: "running" } : s))
    );
    try {
      const result = await api.runPipelineStage(stageId, apkName);
      if (result?.status === "ready" || result?.status === "not-run") {
        setPipelineStages((prev) =>
          prev.map((s) => (s.id === stageId ? { ...s, status: result.status, result: result.message || result.error || result.status } : s))
        );
        return;
      }
      if (result?.status === "failed" || result?.success !== true) {
        throw new Error(result?.error || result?.message || "Stage failed");
      }
      if (result.status !== "completed") {
        setPipelineStages((prev) =>
          prev.map((s) => (s.id === stageId ? { ...s, status: result.status || "pending", result: result.message || "Stage did not complete." } : s))
        );
        return;
      }
      setPipelineStages((prev) =>
        prev.map((s) => (s.id === stageId ? { ...s, status: "completed", result: result.message || "Stage finished" } : s))
      );
      notify(`Pipeline stage '${stageId}' finished.`);
    } catch (err: any) {
      setPipelineStages((prev) =>
        prev.map((s) => (s.id === stageId ? { ...s, status: "failed", result: err?.message || "Stage failed" } : s))
      );
      notify(err?.message || `Pipeline stage '${stageId}' failed.`);
    }
  };

  // Agent Autonomous Modification Task
  const handleRunAgentTask = async () => {
    if (!agentInstruction.trim()) return;
    setIsAgentRunning(true);
    notify(`Crew started: "${agentInstruction.slice(0, 50)}..."`);

    try {
      const res = await api.runAgentTask(agentInstruction, apkName, selectedReforgeModel);
      if (res && res.success) {
        setAgentPlan(res.plan || []);
        if (Array.isArray(res.crew) && res.crew.length) setAgentCrew(res.crew);
        setAgentExplanation(res.explanation || null);
        notify("Crew finished.");
      } else {
        notify(res?.error || "Agent task did not run.");
      }
    } catch (err: any) {
      notify(err?.message || "Agent task did not run.");
    } finally {
      setIsAgentRunning(false);
    }
  };

  // Run ADB Command
  const handleRunAdb = async (customCmd?: string) => {
    const cmdToRun = customCmd || adbCommand;
    try {
      const res = await api.executeToolchain("adb", apkName, { command: cmdToRun });
      const stdout = res?.stdout != null ? String(res.stdout) : "";
      const lines = stdout ? stdout.split("\n") : [];
      setAdbLogs((prev) => [`$ adb ${cmdToRun}`, ...(lines.length ? lines : [res?.error || "No output."]), ...prev]);
      if (/^devices(\s|$)/.test(cmdToRun.trim())) {
        setAdbDevices(res?.success === true ? parseAdbDevicesStdout(stdout) : []);
      }
      if (res?.success === true) {
        notify(`adb ${cmdToRun} finished.`);
      } else {
        notify(res?.error || stdout || `adb ${cmdToRun} did not succeed.`);
      }
    } catch (err: any) {
      setAdbLogs((prev) => [`$ adb ${cmdToRun}`, err?.message || "Error executing ADB command", ...prev]);
      notify(err?.message || "ADB command failed.");
    }
  };

  // Build & Sign APK
  const handleBuildAndSign = async () => {
    setIsSigning(true);
    notify("🔨 Rebuilding package with APKTool and signing with apksigner...");

    try {
      const res = await api.rebuildApk({
        apkName,
        jadxCode: analysisResult.jadxCode,
        smaliCode: analysisResult.apktoolSmali,
        fridaScript: analysisResult.fridaScript,
        keystoreType,
        keyAlias,
        keyPassword,
        v1Signing,
        v2Signing,
        v3Signing,
      });

      if (res && res.success) {
        setApksignerLogs(res.apksignerLogs || []);
        setRebuiltApkUrl(res.apkUrl || null);
        setRebuiltApkSize(res.formattedSize || (res.sizeBytes != null ? `${res.sizeBytes} bytes` : null));
        notify("Rebuilt and signed APK is ready.");
      } else {
        notify(res?.error || "Rebuild did not succeed. Nothing was written.");
      }
    } catch (err: any) {
      notify(err?.message || "Signing failed.");
    } finally {
      setIsSigning(false);
    }
  };

  // Generate Report
  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const res = await api.generateAuditReport(apkName, "markdown", {
        packageName: analysisResult.packageName,
        version: analysisResult.version,
      });
      if (res && res.success && res.markdown) {
        setReportMarkdown(res.markdown);
        setActiveTab("report");
        notify("Audit report generated.");
      } else {
        notify(res?.error || "Report was not generated.");
      }
    } catch (err: any) {
      notify(err?.message || "Report was not generated.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Copy or Download Report
  const handleDownloadReport = () => {
    if (!reportMarkdown.trim()) {
      notify("Nothing loaded yet. No report was written.");
      return;
    }
    const blob = new Blob([reportMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${apkName.replace(/\.apk$/i, "") || "reforge"}_Audit_Report.md`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Downloaded audit report (.md).");
  };

  return (
    <div className="absolute inset-0 z-20 bg-gray-50 text-gray-900 flex flex-col font-sans overflow-hidden">
      {/* Hidden File Picker Input */}
      <input ref={fileInputRef} type="file" accept=".apk,.aab,.zip,.dex" className="hidden" onChange={handleFilePicked} />

      {/* TOP HEADER (Zone 1: Brand/Breadcrumb, Zone 2: App Metadata, Zone 3: Primary Actions) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-gray-200 shrink-0 z-10 shadow-xs">
        {/* Zone 1: Breadcrumb Navigation & Brand Wordmark */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer border border-gray-200"
            aria-label="Back to main workspace"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>AgentForge</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-gray-900">Android Reforge</span>
              <span aria-hidden="true">/</span>
              <span className="font-mono text-blue-600">{apkName}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {analysisResult.packageName || analysisResult.version || analysisResult.targetSdkVersion != null ? (
                <>
                  <span>{analysisResult.packageName || "Nothing loaded yet"}</span>
                  <span aria-hidden="true" className="mx-1.5">·</span>
                  <span>{analysisResult.version ? `v${analysisResult.version}` : "Nothing loaded yet"}</span>
                  <span aria-hidden="true" className="mx-1.5">·</span>
                  <span>{analysisResult.targetSdkVersion != null ? `Target SDK ${analysisResult.targetSdkVersion}` : "Nothing loaded yet"}</span>
                </>
              ) : (
                <span>Nothing loaded yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Zone 2: Model Selector */}
        <div className="hidden md:flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-xl border border-gray-200">
          <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">AI Engine:</span>
          <select
            value={selectedReforgeModel}
            onChange={(e) => setSelectedReforgeModel(e.target.value)}
            className="bg-transparent text-xs font-semibold text-blue-700 outline-none cursor-pointer"
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
          </select>
        </div>

        {/* Zone 3: Primary Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="px-3.5 py-2 text-xs font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors border border-gray-200 cursor-pointer flex items-center gap-1.5"
          >
            <span>📄</span>
            <span>{isGeneratingReport ? "Compiling..." : "Audit Report"}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <span>📦</span>
            <span>Import APK</span>
          </button>
        </div>
      </header>

      {/* WORKBENCH MODULE SELECTOR TABS (17 Dedicated Functional Views) */}
      <nav className="flex items-center gap-1 px-4 py-2 bg-gray-100/90 border-b border-gray-200 overflow-x-auto text-xs font-medium shrink-0">
        {[
          { id: "dashboard", label: "Dashboard", icon: "📊" },
          { id: "pipeline", label: "Workflow", icon: "🔄" },
          { id: "toolchain", label: "Toolchain", icon: "🧰" },
          { id: "frameworks", label: "Frameworks", icon: "🧩" },
          { id: "agent_tasks", label: "Agent Tasks", icon: "🤖" },
          { id: "apk_explorer", label: "APK Explorer", icon: "📁" },
          { id: "manifest", label: "Manifest", icon: "📜" },
          { id: "resources", label: "Resources", icon: "🎨" },
          { id: "smali", label: "Smali", icon: "⚙️" },
          { id: "source", label: "Source", icon: "☕" },
          { id: "security", label: "Security", icon: "🛡️" },
          { id: "native", label: "Native", icon: "🔬" },
          { id: "bytecode_viewer", label: "Bytecode", icon: "🔍" },
          { id: "frida", label: "Frida", icon: "📡" },
          { id: "runtime", label: "Runtime", icon: "🧪" },
          { id: "adb", label: "ADB", icon: "📱" },
          { id: "devices", label: "Devices", icon: "📲" },
          { id: "objection", label: "Objection", icon: "🗄️" },
          { id: "network", label: "Network", icon: "🌐" },
          { id: "build_sign", label: "Build & Sign", icon: "🔨" },
          { id: "artifacts", label: "Artifacts", icon: "📦" },
          { id: "report", label: "Report", icon: "📋" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as WorkbenchTab)}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? "bg-white text-blue-700 font-bold shadow-xs border border-gray-200"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* STREAM UPLOAD PROGRESS BAR (When Ingesting Large Files) */}
      {isUploading && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="animate-spin text-blue-600">⚙️</span>
            <span className="font-semibold text-blue-900">{uploadStatusText}</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-blue-700">
            {uploadSpeedText !== "0.0 MB/s" && (
              <span className="text-emerald-600 font-bold">⚡ {uploadSpeedText}</span>
            )}
            {uploadEtaText && <span className="text-gray-500">{uploadEtaText}</span>}
            <span>{uploadBytesText}</span>
            <span className="font-bold">{uploadProgress}%</span>
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT CANVAS */}
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD                                          */}
        {/* ========================================================= */}
        {activeTab === "dashboard" && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* APK INGESTION & HIGH-SPEED UPLOAD HUB */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
                  await triggerUploadAndDisassemble(file.name, sizeStr, file);
                }
              }}
              className={`p-5 rounded-2xl border transition-all duration-200 shadow-xs ${
                isDragOver
                  ? "bg-blue-50/80 border-blue-500 scale-[1.005]"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📦</span>
                    <h2 className="text-base font-bold text-gray-900">
                      Upload APK / AAB Package
                    </h2>
                    <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      4MB Stream Ingestion
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Upload your Android APK or AAB file. Direct binary stream piping with 4MB buffering provides maximum upload speeds and byte-level progress tracking.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleOpenLocalPicker}
                    disabled={isUploading}
                    className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors cursor-pointer border border-blue-200 disabled:opacity-50 flex items-center gap-1.5"
                    title="Edit APKs already present on the local server workspace without uploading"
                  >
                    <span>📂</span>
                    <span>Select Local File (0ms)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerUploadAndDisassemble("HelloDecompile.apk", "workspace")}
                    disabled={isUploading}
                    className="px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer border border-gray-200 disabled:opacity-50"
                  >
                    <span>HelloDecompile.apk</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Upload New APK</span>
                  </button>
                </div>
              </div>

              {/* LIVE AND ACCURATE PROGRESS METER */}
              {(isUploading || uploadProgress > 0) && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="animate-spin text-blue-600">⚙️</span>
                      <span className="font-semibold text-gray-800">{uploadStatusText}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      {isUploading && uploadSpeedText !== "0.0 MB/s" && (
                        <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ⚡ {uploadSpeedText}
                        </span>
                      )}
                      {isUploading && uploadEtaText && (
                        <span className="text-gray-500">
                          {uploadEtaText}
                        </span>
                      )}
                      <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {uploadProgress}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden border border-slate-300 relative">
                    <div
                      className="h-full bg-blue-500 transition-all duration-150 relative overflow-hidden"
                      style={{ width: `${uploadProgress}%` }}
                    >
                      {isUploading && <div className="absolute inset-0 bg-white/30 animate-pulse" />}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-500">
                    <span>Active Package: <strong className="text-gray-700">{apkName}</strong></span>
                    <span className="text-blue-600 font-bold tabular-nums">{uploadBytesText}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Top Stat Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
                <div className="text-xs text-gray-500">Target Application</div>
                <div className="text-lg font-bold text-gray-900 mt-1 truncate">{analysisResult.appName}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">{analysisResult.packageName || "Nothing loaded yet"}</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
                <div className="text-xs text-gray-500">Security Score (MobSF)</div>
                <div className="text-lg font-bold text-amber-600 mt-1 tabular-nums">{securityScore == null ? "Not scanned" : `${securityScore} / 100`}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {securityScore == null && securityFindings.length === 0 ? "Nothing loaded yet" : `${securityFindings.length} findings from a scan`}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
                <div className="text-xs text-gray-500">SDK Target Range</div>
                <div className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
                  {analysisResult.minSdkVersion == null && analysisResult.targetSdkVersion == null
                    ? "Nothing loaded yet"
                    : `API ${analysisResult.minSdkVersion ?? "—"} – ${analysisResult.targetSdkVersion ?? "—"}`}
                </div>
                {(analysisResult.minSdkVersion != null || analysisResult.targetSdkVersion != null) && (
                  <div className="text-xs text-gray-500 mt-0.5">From the package manifest</div>
                )}
              </div>
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
                <div className="text-xs text-gray-500">Pipeline Health</div>
                <div className={`text-lg font-bold mt-1 ${pipelineStages.some((s) => s.status === "completed") ? "text-emerald-600" : "text-gray-900"}`}>
                  {pipelineStages.filter((s) => s.status === "completed").length}/{pipelineStages.length} finished
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {pipelineStages.every((s) => s.status === "pending")
                    ? "Nothing loaded yet"
                    : `${pipelineStages.filter((s) => s.status === "failed").length} failed`}
                </div>
              </div>
            </div>

            {/* Quick Action Matrix */}
            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Android Reforge Action Matrix</h2>
                  <p className="text-xs text-gray-500">Execute primary reverse engineering & modification modules</p>
                </div>
                <button
                  type="button"
                  onClick={handleRunFullPipeline}
                  disabled={isPipelineRunning}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>{isPipelineRunning ? "⚙️" : "🚀"}</span>
                  <span>{isPipelineRunning ? "Running 14 Stages..." : "Run Complete Pipeline"}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { title: "Source Tree", sub: "JADX Decompile", tab: "source" },
                  { title: "Smali Editor", sub: "Bytecode Patch", tab: "smali" },
                  { title: "Security Audit", sub: "MobSF Scanner", tab: "security" },
                  { title: "Native ARM64", sub: "Ghidra Decompile", tab: "native" },
                  { title: "Frida Console", sub: "Runtime Hooks", tab: "frida" },
                  { title: "Build & Sign", sub: "apksigner v3", tab: "build_sign" },
                ].map((act, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveTab(act.tab as WorkbenchTab)}
                    className="p-3.5 rounded-xl bg-gray-50 hover:bg-blue-50/50 text-left border border-gray-200 transition-colors cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-gray-900 group-hover:text-blue-600">
                      {act.title}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{act.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Architecture Overview & Entry Points */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Identified Application Entry Points</h3>
                <div className="space-y-2">
                  {analysisResult.featuresNotes.length === 0 ? (
                    <div className="text-xs text-gray-500">Nothing loaded yet</div>
                  ) : analysisResult.featuresNotes.map((note, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">{note.title}</span>
                        <span className="font-mono text-[10px] text-blue-600">{note.location}</span>
                      </div>
                      <p className="text-gray-600 text-[11px] leading-relaxed">{note.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Active Device Target (ADB)</h3>
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs space-y-2">
                  {adbDevices.length === 0 ? (
                    <div className="font-semibold text-gray-800">No device connected</div>
                  ) : (
                    adbDevices.map((device) => (
                      <div key={`${device.serial}-${device.raw}`} className="space-y-1">
                        <div className="font-bold font-mono text-gray-900">{device.serial}</div>
                        <div className="font-mono text-[11px] text-gray-600 break-all">{device.raw}</div>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveTab("adb")}
                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Open ADB Terminal Console
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: WORKFLOW PIPELINE (14 STAGES)                      */}
        {/* ========================================================= */}
        {activeTab === "pipeline" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900">Android Reforge Visual Pipeline</h2>
                <p className="text-xs text-gray-500">14-Stage End-to-End Reverse Engineering, Modification & Validation Chain</p>
              </div>
              <button
                type="button"
                onClick={handleRunFullPipeline}
                disabled={isPipelineRunning}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>{isPipelineRunning ? "⚙️" : "▶️"}</span>
                <span>{isPipelineRunning ? "Executing Pipeline..." : "Run All 14 Stages"}</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {pipelineStages.map((stage) => (
                <div
                  key={stage.id}
                  className="p-3.5 rounded-xl bg-white border border-gray-200 flex items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm">
                      {stage.status === "completed" ? "✅" : stage.status === "running" ? "⚙️" : "⏳"}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-gray-900">{stage.name}</div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">Tool: {stage.tool}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 font-mono">{stage.result}</span>
                    <button
                      type="button"
                      onClick={() => handleRunSingleStage(stage.id)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer border border-gray-200"
                    >
                      Run Stage
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: AGENT TASK PANEL (Autonomous Multi-Step Runner)    */}
        {/* ========================================================= */}
        {activeTab === "agent_tasks" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Crew AI · Android Reforge</h2>
                <p className="text-xs text-gray-500">
                  Atlas plans the task. DexScout, FlowSeeker, Phantom, Cipher, Spectre, Vector, and ApkForge run the real tools. Warden blocks license and integrity patches. Scribe writes only what the tools returned.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {agentCrew.map((member) => (
                  <div key={member.id} className="px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[11px]">
                    <span className="font-semibold text-gray-800">{member.emoji} {member.name}</span>
                    <span className="text-gray-500"> · {member.role}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Modification Goal / Natural Language Instruction</label>
                <textarea
                  value={agentInstruction}
                  onChange={(e) => setAgentInstruction(e.target.value)}
                  rows={3}
                  className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-900 outline-none focus:border-blue-500 font-sans leading-relaxed"
                  placeholder="e.g. Add dark mode, map API hosts, or write a security report"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "🎨 Add dark mode in resources",
                  "📜 Audit the manifest and permissions",
                  "🔍 Extract hardcoded strings and API hosts",
                  "🛡️ Write a MobSF-style security report",
                  "🧰 Run all tools",
                ].map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAgentInstruction(sug)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer border border-gray-200"
                  >
                    {sug}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleRunAgentTask}
                disabled={isAgentRunning || !agentInstruction.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{isAgentRunning ? "⚙️" : "🚀"}</span>
                <span>{isAgentRunning ? "Executing Crew..." : "Dispatch Crew"}</span>
              </button>
            </div>

            {/* Agent Execution Plan & Results */}
            {agentPlan.length > 0 && (
              <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Agent Execution Plan & Status</h3>
                <div className="space-y-2">
                  {agentPlan.map((step, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-bold text-blue-600 shrink-0">{step.agent}</span>
                        {step.role && <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">{step.role}</span>}
                        <span className="text-gray-800 truncate">{step.tool ? `${step.tool}: ` : ""}{step.action}</span>
                      </div>
                      <span className={`font-semibold font-mono ${/^(completed|success|ok|done|finished|passed)$/i.test(String(step.status)) ? "text-emerald-600" : "text-gray-500"}`}>
                        {/^(completed|success|ok|done|finished|passed)$/i.test(String(step.status)) ? `✓ ${step.status}` : step.status}
                      </span>
                    </div>
                  ))}
                </div>

                {agentExplanation && (
                  <div className="mt-3 p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs leading-relaxed text-gray-700 whitespace-pre-line font-sans">
                    {agentExplanation}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: APK EXPLORER (Directory Tree)                      */}
        {/* ========================================================= */}
        {activeTab === "apk_explorer" && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Package Structure</h3>
              <div className="space-y-1 font-mono text-xs text-gray-700">
                {(analysisResult.entries.length ? analysisResult.entries : ["Nothing loaded yet"]).map((item, idx) => (
                  <div key={idx} className="p-1 rounded hover:bg-gray-100">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Selected Component: AndroidManifest.xml</h3>
                <pre className="p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl overflow-x-auto leading-relaxed max-h-[500px]">
                {analysisResult.manifestXml || "Nothing loaded yet"}
              </pre>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: MANIFEST EDITOR                                    */}
        {/* ========================================================= */}
        {activeTab === "manifest" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">AndroidManifest.xml Editor & Permission Matrix</h2>
                <p className="text-xs text-gray-500">Directly inspect and patch application permissions, activities, and security flags</p>
              </div>
              <button
                type="button"
                onClick={() => notify("Manifest was not written. There is no save endpoint.")}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 border border-slate-300 rounded-xl cursor-pointer"
              >
                Save is not available
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider pt-2">Permissions ({analysisResult.permissions.length})</h3>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {analysisResult.permissions.length === 0 ? (
                    <div className="text-xs text-gray-500">Nothing loaded yet</div>
                  ) : analysisResult.permissions.map((p, idx) => (
                    <div key={idx} className="p-1.5 rounded bg-gray-50 text-gray-700 truncate">
                      {p}
                    </div>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <textarea
                  value={analysisResult.manifestXml}
                  onChange={(e) => setAnalysisResult({ ...analysisResult, manifestXml: e.target.value })}
                  rows={20}
                  className="w-full p-4 rounded-2xl bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: RESOURCE EXPLORER (strings.xml, colors, layout)    */}
        {/* ========================================================= */}
        {activeTab === "resources" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <h2 className="text-base font-bold text-gray-900">Resource Explorer (APKTool Decode)</h2>
            {!analysisResult.stringsXml && !analysisResult.colorsXml && !analysisResult.layoutXml && (
              <p className="text-xs text-gray-500">Nothing loaded yet</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">res/values/strings.xml</h3>
                <textarea
                  value={analysisResult.stringsXml}
                  onChange={(e) => setAnalysisResult({ ...analysisResult, stringsXml: e.target.value })}
                  rows={12}
                  className="w-full p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl outline-none"
                />
              </div>

              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">res/values/colors.xml</h3>
                <textarea
                  value={analysisResult.colorsXml}
                  onChange={(e) => setAnalysisResult({ ...analysisResult, colorsXml: e.target.value })}
                  rows={12}
                  className="w-full p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: SMALI EDITOR                                       */}
        {/* ========================================================= */}
        {activeTab === "smali" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Smali editor</h2>
                <p className="text-xs text-gray-500">{analysisResult.apktoolSmali ? "Smali loaded from the package." : "No smali loaded yet."}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Dalvik Opcodes</h3>
                <div className="space-y-1.5 text-[11px] font-mono text-gray-600">
                  <div className="p-1 rounded bg-gray-50">const/4 vA, #+B</div>
                  <div className="p-1 rounded bg-gray-50">return vAA</div>
                  <div className="p-1 rounded bg-gray-50">invoke-static</div>
                  <div className="p-1 rounded bg-gray-50">iget-boolean</div>
                  <div className="p-1 rounded bg-gray-50">if-nez vA, :cond_0</div>
                </div>
              </div>

              <div className="lg:col-span-3">
                <textarea
                  value={analysisResult.apktoolSmali}
                  onChange={(e) => setAnalysisResult({ ...analysisResult, apktoolSmali: e.target.value })}
                  rows={18}
                  className="w-full p-4 rounded-2xl bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 8: SOURCE EXPLORER (JADX)                             */}
        {/* ========================================================= */}
        {activeTab === "source" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">JADX Decompiled Java Source Explorer</h2>
                <p className="text-xs text-gray-500">{analysisResult.jadxCode ? "First Java file JADX wrote" : "No Java source yet"}</p>
              </div>
              <button
                type="button"
                onClick={() => notify("Java source was not written. There is no save endpoint.")}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 border border-slate-300 rounded-xl cursor-pointer"
              >
                Save is not available
              </button>
            </div>

            <textarea
              value={analysisResult.jadxCode}
              onChange={(e) => setAnalysisResult({ ...analysisResult, jadxCode: e.target.value })}
              rows={20}
              className="w-full p-4 rounded-2xl bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
            />
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 9: SECURITY ANALYSIS (MobSF)                          */}
        {/* ========================================================= */}
        {activeTab === "security" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">MobSF Automated Security & Vulnerability Assessment</h2>
                <p className="text-xs text-gray-500">Static bytecode audit, dangerous permissions, hardcoded secrets, and OWASP Mobile Top 10</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  notify("Running MobSF…");
                  try {
                    const res = await api.executeToolchain("mobsf", apkName);
                    if (res?.success !== true) {
                      setSecurityScore(null);
                      setSecurityFindings([]);
                      notify(res?.error || res?.output?.note || "MobSF did not succeed.");
                      return;
                    }
                    const score = res?.output?.securityScore;
                    setSecurityScore(typeof score === "number" ? score : null);
                    const raw = Array.isArray(res?.output?.findings) ? res.output.findings : [];
                    setSecurityFindings(raw.map((item: any, index: number) => ({
                      id: `SEC-${index + 1}`,
                      title: typeof item === "string" ? item : (item?.title || "MobSF finding"),
                      severity: item?.severity || "Info",
                      file: item?.file || apkName,
                      description: typeof item === "string" ? item : (item?.description || JSON.stringify(item).slice(0, 400)),
                      recommendation: item?.recommendation || "See the MobSF report.",
                    })));
                    notify(res?.output?.note || "MobSF scan finished.");
                  } catch (err: any) {
                    notify(err?.message || "MobSF scan failed.");
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
              >
                Re-Scan APK
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
                <div className="text-xs text-gray-500">Security Score</div>
                <div className="text-2xl font-bold text-amber-600 mt-1">{securityScore == null ? "Not scanned" : `${securityScore} / 100`}</div>
                <div className="text-xs text-gray-500 mt-0.5">Only filled after MobSF returns a score</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
                <div className="text-xs text-gray-500">Critical Issues</div>
                <div className="text-2xl font-bold text-rose-600 mt-1">{securityFindings.filter((f) => f.severity === "Critical").length}</div>
                <div className="text-xs text-gray-500 mt-0.5">Critical findings</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
                <div className="text-xs text-gray-500">High Risk Issues</div>
                <div className="text-2xl font-bold text-amber-600 mt-1">{securityFindings.filter((f) => f.severity === "High").length}</div>
                <div className="text-xs text-gray-500 mt-0.5">High findings</div>
              </div>
            </div>

            <div className="space-y-3">
              {securityFindings.length === 0 ? (
                <div className="text-xs text-gray-500">Nothing loaded yet</div>
              ) : securityFindings.map((finding) => (
                <div key={finding.id} className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-gray-500">{finding.id}</span>
                      <span className="text-xs font-bold text-gray-900">{finding.title}</span>
                    </div>
                    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                      finding.severity === "Critical" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {finding.severity}{finding.cvss != null ? ` · CVSS ${finding.cvss}` : ""}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-blue-600">{finding.file}</div>
                  <p className="text-xs text-gray-600">{finding.description}</p>
                  <div className="text-[11px] text-emerald-600 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                    <span className="font-bold">Remediation:</span> {finding.recommendation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 10: NATIVE LIBRARY (Ghidra & IDA)                     */}
        {/* ========================================================= */}
        {activeTab === "native" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <h2 className="text-base font-bold text-gray-900">Ghidra Native ARM64 Disassembly & JNI Bridges</h2>
            <p className="text-xs text-gray-500">{analysisResult.ghidraNative ? "Native libraries found in the APK" : "No native library loaded"}</p>
            <textarea
              value={analysisResult.ghidraNative}
              onChange={(e) => setAnalysisResult({ ...analysisResult, ghidraNative: e.target.value })}
              rows={18}
              className="w-full p-4 rounded-2xl bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
            />
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 11: BYTECODE VIEWER (Multi-Engine Comparison)         */}
        {/* ========================================================= */}
        {activeTab === "bytecode_viewer" && (
          <div className="max-w-6xl mx-auto space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
              <h2 className="text-base font-bold text-gray-900">Multi-Engine Bytecode Decompiler Comparison</h2>
              <p className="text-xs text-gray-500">CFR 0.152, Vineflower (Fernflower), Procyon 0.6, and Krakatau. Nothing is shown until they run.</p>
              </div>
              <button
                type="button"
                disabled={decompiling}
                onClick={async () => {
                  setDecompiling(true);
                  try {
                    const res = await api.executeToolchain("bytecode-viewer", apkName, {});
                    if (res?.success !== true) {
                      notify(res?.error || res?.output?.note || "Decompilers did not succeed.");
                      return;
                    }
                    const engines = res.output?.engines || {};
                    setDecompilers({
                      cfr: engines.cfr || res.output?.note || res.error || "No CFR output.",
                      fernflower: engines.fernflower || res.output?.note || "No Fernflower output.",
                      procyon: engines.procyon || res.output?.note || "No Procyon output.",
                      krakatau: engines.krakatau || res.output?.note || "No Krakatau output.",
                    });
                  } catch (err: any) {
                    notify(err?.message || "Decompilers failed");
                  } finally {
                    setDecompiling(false);
                  }
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white cursor-pointer disabled:opacity-50"
              >
                {decompiling ? "Decompiling..." : "Compare engines"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <div className="text-xs font-bold text-gray-900">CFR Decompiler</div>
                <pre className="p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl overflow-x-auto whitespace-pre-wrap">
{decompilers.cfr || "Import an APK, then compare the engines."}
                </pre>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <div className="text-xs font-bold text-gray-900">Fernflower Decompiler</div>
                <pre className="p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl overflow-x-auto whitespace-pre-wrap">
{decompilers.fernflower || "Vineflower output appears here."}
                </pre>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <div className="text-xs font-bold text-gray-900">Procyon Decompiler</div>
                <pre className="p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl overflow-x-auto whitespace-pre-wrap">
{decompilers.procyon || "Procyon output appears here."}
                </pre>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <div className="text-xs font-bold text-gray-900">Krakatau Bytecode Disassembler</div>
                <pre className="p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl overflow-x-auto whitespace-pre-wrap">
{decompilers.krakatau || "Krakatau disassembly appears here."}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 12: FRIDA CONSOLE                                     */}
        {/* ========================================================= */}
        {activeTab === "frida" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Frida Dynamic Instrumentation Console</h2>
                <p className="text-xs text-gray-500">Hook Dalvik/ART virtual machine methods and native JNI pointers in runtime</p>
              </div>
              <button
                type="button"
                onClick={() => handleRunTool("frida")}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
              >
                Check attachment
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">Hook Script</label>
                <textarea
                  value={analysisResult.fridaScript}
                  onChange={(e) => setAnalysisResult({ ...analysisResult, fridaScript: e.target.value })}
                  rows={16}
                  className="w-full p-3.5 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-2xl outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">Frida Terminal Logs</label>
                <div className="p-3.5 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-2xl h-[330px] overflow-y-auto space-y-1">
                  {fridaConsoleLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 13: ADB & DEVICE MANAGER                              */}
        {/* ========================================================= */}
        {activeTab === "adb" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Native ADB bridge</h2>
                <p className="text-xs text-gray-500">Platform-tools adb on this host. Devices, logcat, and package list run against a real device. Fake devices are not shown.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={adbCommand}
                onChange={(e) => setAdbCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRunAdb()}
                placeholder="Type adb command (e.g. devices, shell pm list packages, logcat -d)..."
                className="flex-1 p-2.5 rounded-xl bg-white border border-gray-200 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => handleRunAdb()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Execute
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {["devices -l", "shell pm list packages", "shell getprop ro.build.version.release", "logcat -d"].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => {
                    setAdbCommand(cmd);
                    handleRunAdb(cmd);
                  }}
                  className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg font-mono text-[11px] cursor-pointer"
                >
                  adb {cmd}
                </button>
              ))}
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs h-96 overflow-y-auto space-y-1">
              {adbLogs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 14: OBJECTION RUNTIME STORAGE EXPLORER                 */}
        {/* ========================================================= */}
        {activeTab === "objection" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <h2 className="text-base font-bold text-gray-900">Objection Mobile Runtime Exploration</h2>
            <p className="text-xs text-gray-500">Objection is installed. It is not attached to a device, so there are no preferences or databases to show.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <div className="text-xs font-bold text-gray-900">SharedPreferences</div>
                <div className="text-xs text-gray-500 font-mono">No device</div>
                <div className="p-2.5 rounded-lg bg-gray-50 text-[11px] font-mono">No shared preferences were read.</div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <div className="text-xs font-bold text-gray-900">SQLite Databases</div>
                <div className="text-xs text-gray-500 font-mono">No device</div>
                <div className="p-2.5 rounded-lg bg-gray-50 text-[11px] font-mono">No database was pulled.</div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                <div className="text-xs font-bold text-gray-900">Runtime Security Toggles</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-gray-50">
                    <span>SSL pinning</span>
                    <span className="text-gray-500 font-bold">Not modified</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-gray-50">
                    <span>Root check</span>
                    <span className="text-gray-500 font-bold">Not modified</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 15: NETWORK ANALYSIS (Burp Suite & Mitmproxy)         */}
        {/* ========================================================= */}
        {activeTab === "network" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <h2 className="text-base font-bold text-gray-900">Network traffic</h2>
            <p className="text-xs text-gray-500">
              {analysisResult.burpTraffic.trim() ? "Proxy note returned with the package." : "Nothing loaded yet"}
            </p>

            <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
              <div className="text-xs font-bold text-gray-900">
                {analysisResult.burpTraffic.trim() ? "Proxy output" : "Nothing loaded yet"}
              </div>
              <textarea
                value={analysisResult.burpTraffic}
                onChange={(e) => setAnalysisResult({ ...analysisResult, burpTraffic: e.target.value })}
                rows={8}
                className="w-full p-3 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl outline-none"
              />
              <button
                type="button"
                onClick={() => notify("Traffic was not replayed. There is no replay endpoint.")}
                className="px-3.5 py-1.5 border border-slate-300 text-gray-600 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Replay is not available
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 16: BUILD & SIGNING CENTER (APKTool & apksigner)      */}
        {/* ========================================================= */}
        {activeTab === "build_sign" && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Build Center & Cryptographic Signing (apksigner)</h2>
                <p className="text-xs text-gray-500">zipalign 4-byte alignment, then apksigner v1/v2/v3. R8 obfuscates classes.dex.</p>
              </div>
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBuildAndSign}
                disabled={isSigning}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
              >
                {isSigning ? "Working..." : "Rebuild & Sign APK"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsSigning(true);
                  try {
                    const res = await api.executeToolchain("r8", apkName, {});
                    const lines = [res.output?.version, res.output?.note, ...(res.output?.logs || [])].filter(Boolean);
                    setApksignerLogs(lines.length ? lines : [JSON.stringify(res.output || res)]);
                    notify(
                      res?.success === true && res?.status === "completed"
                        ? (res?.output?.note || "R8 obfuscation finished.")
                        : (res?.error || res?.output?.note || "R8 did not report a completed rewrite.")
                    );
                  } catch (err: any) {
                    notify(err?.message || "R8 failed");
                  } finally {
                    setIsSigning(false);
                  }
                }}
                disabled={isSigning}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Obfuscate with R8
              </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Signing Settings Card */}
              <div className="p-5 rounded-2xl bg-white border border-gray-200 space-y-4">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Keystore Configuration</h3>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectKeystore("debug")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                      keystoreType === "debug"
                        ? "bg-blue-50 text-blue-700 border-blue-300"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                    }`}
                  >
                    Android Debug Keystore
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectKeystore("release")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                      keystoreType === "release"
                        ? "bg-blue-50 text-blue-700 border-blue-300"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                    }`}
                  >
                    Release Keystore (Custom)
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-gray-600">Key Alias</label>
                    <input
                      type="text"
                      value={keyAlias}
                      onChange={(e) => setKeyAlias(e.target.value)}
                      className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 border border-gray-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-gray-600">Keystore Password</label>
                    <input
                      type="password"
                      value={keyPassword}
                      onChange={(e) => setKeyPassword(e.target.value)}
                      className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 border border-gray-200 font-mono text-xs"
                    />
                  </div>
                </div>

                <h4 className="text-xs font-bold text-gray-900 pt-2">Active Signature Schemes</h4>
                <div className="space-y-1.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={v1Signing} onChange={(e) => setV1Signing(e.target.checked)} />
                    <span>v1 Scheme (JAR Signing - Android 1.0+)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={v2Signing} onChange={(e) => setV2Signing(e.target.checked)} />
                    <span>v2 Scheme (APK Signature - Android 7.0+)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={v3Signing} onChange={(e) => setV3Signing(e.target.checked)} />
                    <span>v3 Scheme (Key Rotation - Android 9.0+)</span>
                  </label>
                </div>
              </div>

              {/* Build Output & Logs */}
              <div className="p-5 rounded-2xl bg-white border border-gray-200 space-y-4">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">apksigner Verification Log</h3>
                
                {rebuiltApkUrl && (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-emerald-800">Rebuilt APK Ready</div>
                      <div className="text-[11px] text-emerald-600 font-mono">{rebuiltApkSize}</div>
                    </div>
                    <a
                      href={rebuiltApkUrl}
                      download
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Download APK
                    </a>
                  </div>
                )}

                <div className="p-3.5 bg-gray-50 text-gray-800 border border-gray-200 font-mono text-xs rounded-xl h-60 overflow-y-auto space-y-1">
                  {apksignerLogs.length > 0 ? (
                    apksignerLogs.map((l, i) => <div key={i}>{l}</div>)
                  ) : (
                    <div className="text-gray-500">Click 'Rebuild & Sign APK' to initiate apksigner...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "frameworks" && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Magisk, LSPosed, and Xposed</h2>
                <p className="text-xs text-gray-500">Read-only device bridge. Refresh queries the manager package, Magisk version, and module list. Nothing is flashed or hooked from here.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  fetch("/api/android-reforge/frameworks")
                    .then((r) => {
                      if (!r.ok) throw new Error("Framework query failed");
                      return r.json();
                    })
                    .then((data) => {
                      if (data?.success === false) throw new Error(data.error || "Framework query failed");
                      setFrameworks(data);
                    })
                    .catch(() => setFrameworks(null));
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white cursor-pointer"
              >
                Refresh
              </button>
            </div>
            <div className="text-xs font-mono text-gray-500">
              {frameworks?.adb ? `ADB ${frameworks.adb}` : "ADB bridge missing"}
              {" · "}
              {frameworks?.device ? `device ${frameworks.device}` : "no device connected"}
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {[
                ["Magisk", frameworks?.magisk?.installed, frameworks?.magisk?.version || frameworks?.magisk?.packagePath || "Manager not visible", (frameworks?.magisk?.modules || []).join(", ") || "No modules listed"],
                ["LSPosed", frameworks?.lsposed?.installed, frameworks?.lsposed?.packagePath || "Manager not visible", frameworks?.lsposed?.module || "Zygisk module not listed"],
                ["Xposed", frameworks?.xposed?.installed, frameworks?.xposed?.packagePath || "Legacy manager not visible", "Package scan only"],
              ].map(([name, installed, primary, secondary]) => (
                <div key={String(name)} className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{name}</h3>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{installed ? "present" : "not seen"}</span>
                  </div>
                  <p className="text-xs font-mono break-all">{primary}</p>
                  <p className="text-xs text-gray-500">{secondary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "toolchain" && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div>
              <h2 className="text-base font-bold">Android laboratory toolchain</h2>
              <p className="text-xs text-gray-500">
                {labTools.length === 0
                  ? "Nothing loaded yet"
                  : `${labTools.filter((t) => t.status === "ready").length} ready on this host · ${labTools.filter((t) => t.status === "adapter" || t.status === "missing").length} waiting for a local install${labTools.filter((t) => t.status === "blocked").length > 0 ? ` · ${labTools.filter((t) => t.status === "blocked").length} not available` : ""}`}
              </p>
            </div>
            {labTools.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing loaded yet</p>
            ) : Array.from(new Set(labTools.map((t) => t.group))).map((group) => (
              <div key={group} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">{group}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {labTools.filter((t) => t.group === group).map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleRunTool(tool.id)}
                      className="text-left p-3 rounded-xl bg-white border border-gray-200 cursor-pointer hover:border-blue-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold">{tool.name}</div>
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">{tool.status}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{tool.purpose}</div>
                      <div className="text-[11px] text-blue-600 mt-2">{toolBusy === tool.id ? "Running…" : "Open service"}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {toolOutput && (
              <pre className="text-xs font-mono p-4 rounded-xl bg-gray-50 text-gray-800 border border-gray-200 overflow-auto max-h-80">{toolOutput}</pre>
            )}
          </div>
        )}

        {activeTab === "devices" && (
          <div className="max-w-3xl mx-auto space-y-3">
            <h2 className="text-base font-bold">Device manager</h2>
            <p className="text-xs text-gray-500">Discovered through the ADB service. Install and logcat stay on the ADB tab.</p>
            {adbDevices.length === 0 ? (
              <p className="text-sm text-gray-600">No device connected</p>
            ) : (
              adbDevices.map((device) => (
                <div key={`${device.serial}-${device.raw}`} className="font-mono text-xs p-2 rounded-lg bg-white border border-gray-200">
                  <div className="font-bold">{device.serial}</div>
                  <div className="break-all">{device.raw}</div>
                </div>
              ))
            )}
            <button type="button" onClick={() => handleRunAdb("devices -l")} className="px-3 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white cursor-pointer">Refresh devices</button>
          </div>
        )}

        {activeTab === "runtime" && (
          <div className="max-w-3xl mx-auto space-y-3">
            <h2 className="text-base font-bold">Runtime testing</h2>
            <p className="text-xs text-gray-500">Frida traces calls and returns the original result. Objection lists files and databases. Neither disables protections.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setActiveTab("frida"); }} className="px-3 py-2 text-xs rounded-xl border cursor-pointer">Open Frida console</button>
              <button type="button" onClick={() => { setActiveTab("objection"); }} className="px-3 py-2 text-xs rounded-xl border cursor-pointer">Open Objection</button>
              <button type="button" onClick={() => handleRunTool("frida")} className="px-3 py-2 text-xs rounded-xl bg-blue-600 text-white cursor-pointer">Generate trace script</button>
            </div>
            {toolOutput && <pre className="text-xs font-mono p-4 rounded-xl bg-gray-50 text-gray-800 border border-gray-200 overflow-auto max-h-80">{toolOutput}</pre>}
          </div>
        )}

        {activeTab === "artifacts" && (
          <div className="max-w-3xl mx-auto space-y-3">
            <h2 className="text-base font-bold">Artifact viewer</h2>
            {!apkName && !analysisResult.manifestXml && !analysisResult.stringsXml && !analysisResult.colorsXml && !analysisResult.layoutXml && !analysisResult.apktoolSmali && !rebuiltApkUrl && !reportMarkdown ? (
              <p className="text-xs text-gray-500">Nothing loaded yet</p>
            ) : (
            <ul className="text-sm space-y-2">
              {(analysisResult.packageName || analysisResult.manifestXml) ? <li className="p-3 rounded-xl bg-white border">Decoded workspace · {apkName || analysisResult.packageName}</li> : null}
              {analysisResult.manifestXml ? <li className="p-3 rounded-xl bg-white border">Manifest · AndroidManifest.xml</li> : null}
              {(analysisResult.stringsXml || analysisResult.colorsXml || analysisResult.layoutXml) ? <li className="p-3 rounded-xl bg-white border">Resources · loaded from the package</li> : null}
              {analysisResult.apktoolSmali ? <li className="p-3 rounded-xl bg-white border">Smali · loaded</li> : null}
              <li className="p-3 rounded-xl bg-white border">{rebuiltApkUrl ? `Signed build · ${rebuiltApkSize || "size not reported"}` : "Signed build · not produced yet"}</li>
              <li className="p-3 rounded-xl bg-white border">{reportMarkdown ? "Audit report · ready" : "Audit report · not generated"}</li>
            </ul>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 17: EXPORTABLE AUDIT REPORT                           */}
        {/* ========================================================= */}
        {activeTab === "report" && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900">Android Reforge Comprehensive Audit Report</h2>
                <p className="text-xs text-gray-500">Exportable technical & security assessment with architecture diagram and findings</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <span>📥</span>
                  <span>Download .md</span>
                </button>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-xs">
              <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {reportMarkdown || "Click 'Audit Report' in the top bar to generate the comprehensive markdown report."}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* LOCAL SERVER WORKSPACE APK SELECTOR MODAL (0-Upload Latency Direct File Attachment) */}
      {isLocalPickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📂</span>
                <h3 className="text-sm font-bold text-gray-900">
                  Select Local Server Workspace File
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLocalPickerOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              These APK packages are already located directly on the local server disk. Selecting any package attaches to it instantly with <strong>zero upload time or network overhead</strong>.
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {localApksList.length > 0 ? (
                localApksList.map((file, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectLocalApk(file.filename, file.formattedSize)}
                    className="p-3 rounded-xl bg-gray-50 hover:bg-blue-50 border border-gray-200 transition-colors cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">📱</span>
                      <div>
                        <div className="text-xs font-bold text-gray-900 group-hover:text-blue-600 font-mono">
                          {file.filename}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Modified: {new Date(file.modifiedAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-blue-600">
                        {file.formattedSize}
                      </span>
                      <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">
                        Attach 0ms
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-500 p-4 text-center">No local APK files found in workspace storage.</div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsLocalPickerOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AndroidReforgeView;
