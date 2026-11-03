import React, { useState, useEffect, useRef } from "react";
import { ResearchSynapse } from "./ResearchSynapse";
import api from "./api";
import { FilePicker, AttachedFilePills, AttachedFile } from "./FilePicker";

export interface DeepResearchViewProps {
  initialQuery?: string;
  onBack: () => void;
  onSendToBrainstorm?: (topic: string) => void;
  onDelegateToCrew?: (goal: string) => void;
  notify?: (msg: string) => void;
}

export const DeepResearchView: React.FC<DeepResearchViewProps> = ({
  initialQuery = "",
  onBack,
  onSendToBrainstorm,
  onDelegateToCrew,
  notify = (m) => console.log(m),
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [category, setCategory] = useState<"general" | "product" | "comparison" | "howto" | "factcheck">("general");
  const [searchProvider, setSearchProvider] = useState("DuckDuckGo (Live Web)");
  const [depthRounds, setDepthRounds] = useState(3);
  const [activeTab, setActiveTab] = useState<"workspace" | "library">("workspace");

  // Plan state
  const [plan, setPlan] = useState<string[]>([]);
  const [newPlanStep, setNewPlanStep] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);

  // Active Job Execution state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [currentRound, setCurrentRound] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [stageMessage, setStageMessage] = useState("");
  const [activityLogs, setActivityLogs] = useState<Array<{ time: number; type: string; message: string }>>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [reportMarkdown, setReportMarkdown] = useState<string>("");
  const [reportStats, setReportStats] = useState<any>(null);

  // Completed Report display tab
  const [reportTab, setReportTab] = useState<"visual" | "matrix" | "sources" | "synapse" | "markdown">("visual");
  const [showFullscreenReport, setShowFullscreenReport] = useState(false);

  // Library state
  const [libraryList, setLibraryList] = useState<any[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState("recent");
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // SSE event source ref
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-fill query if provided
  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Load Library on tab switch
  useEffect(() => {
    if (activeTab === "library") {
      fetchLibrary();
    }
  }, [activeTab, librarySearch, librarySort]);

  const fetchLibrary = async () => {
    setLoadingLibrary(true);
    try {
      const q = librarySearch ? `&search=${encodeURIComponent(librarySearch)}` : "";
      const res = await fetch(`/api/research/library?sort=${librarySort}${q}`);
      if (res.ok) {
        const data = await res.json();
        setLibraryList(data.research || []);
      }
    } catch (e) {
      console.warn("Library load error:", e);
    } finally {
      setLoadingLibrary(false);
    }
  };

  const formatQueryWithFiles = (rawQuery: string, files: AttachedFile[]) => {
    if (!files || files.length === 0) return rawQuery;
    const fileCtx = files.map(f => `[Attached File: ${f.name} (${f.source || f.type})]\n\`\`\`\n${f.content || '(No text content)'}\n\`\`\``).join('\n\n');
    return rawQuery ? `${fileCtx}\n\nResearch Inquiry: ${rawQuery}` : fileCtx;
  };

  // Generate research plan
  const handleGeneratePlan = async () => {
    let q = formatQueryWithFiles(query.trim(), attachedFiles);
    if (!q) {
      notify("Please enter a research question or attach a file first.");
      return;
    }
    setAttachedFiles([]);
    setIsPlanning(true);
    try {
      const generated = await api.generateResearchPlan(q);
      setPlan(generated);
      notify("Research plan drafted! Inspect or customize the steps below.");
    } catch (e) {
      notify("Failed to generate plan. Using default structure.");
      setPlan([
        `Scope definitions and core taxonomy for: ${q}`,
        "Survey current landscape, key benchmark data, and leading approaches",
        "Compare performance, tradeoffs, failure modes, and costs",
        "Synthesize actionable insights with verified citations",
      ]);
    } finally {
      setIsPlanning(false);
    }
  };

  // Start deep research
  const handleStartResearch = async () => {
    let q = formatQueryWithFiles(query.trim(), attachedFiles);
    if (!q) {
      notify("Please enter a research topic or attach a file first.");
      return;
    }
    setAttachedFiles([]);

    if (plan.length === 0) {
      await handleGeneratePlan();
    }

    setJobStatus("running");
    setProgressPercent(5);
    setCurrentRound(1);
    setStageMessage("Initializing autonomous multi-round research loop...");
    setActivityLogs([{ time: Date.now(), type: "start", message: `Launched deep research run for "${q}"` }]);
    setSources([]);
    setFindings([]);
    setReportMarkdown("");

    try {
      const res = await fetch("/api/research/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          category,
          search_provider: searchProvider,
          max_rounds: depthRounds,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const jobId = data.session_id;
      setActiveJobId(jobId);

      // Connect to SSE stream
      connectToStream(jobId);
    } catch (err: any) {
      notify(`Research error: ${err.message || "Failed to start"}`);
      setJobStatus("idle");
    }
  };

  // Polling fallback ref
  const pollingTimerRef = useRef<any>(null);

  const startFallbackPolling = (jobId: string) => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);

    pollingTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/research/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status) setJobStatus(data.status);
          if (data.progress?.percent !== undefined) setProgressPercent(data.progress.percent);
          if (data.current_round !== undefined) setCurrentRound(data.current_round);
          if (data.progress?.message) setStageMessage(data.progress.message);

          if (data.status === "done" || data.status === "cancelled" || data.status === "error") {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
            loadCompletedResult(jobId);
          }
        }
      } catch (e) {
        console.warn("Polling status error:", e);
      }
    }, 2000);
  };

  const connectToStream = (jobId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/research/stream/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status) setJobStatus(data.status);
        if (data.percent !== undefined) setProgressPercent(data.percent);
        if (data.round !== undefined) setCurrentRound(data.round);
        if (data.message) {
          setStageMessage(data.message);
          setActivityLogs((prev) => [
            ...prev,
            { time: Date.now(), type: data.stage || "info", message: data.message },
          ]);
        }

        if (data.status === "done" || data.final) {
          es.close();
          eventSourceRef.current = null;
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
          }
          loadCompletedResult(jobId);
        }
      } catch (e) {
        console.warn("SSE parse error:", e);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      // Start fallback status polling loop
      startFallbackPolling(jobId);
    };
  };

  const loadCompletedResult = async (jobId: string) => {
    try {
      const res = await fetch(`/api/research/result-peek/${jobId}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReportMarkdown(data.result || "");
        setSources(data.sources || []);
        setFindings(data.findings || data.raw_findings || []);
        setReportStats(data.stats || { duration_seconds: 14, rounds_executed: depthRounds, sources_scanned: (data.sources || []).length });
        setJobStatus("done");
        setProgressPercent(100);
        notify("🎉 Deep Research finished! Executive report and evidence generated.");
      }
    } catch (e) {
      console.warn("Result peek error:", e);
    }
  };

  const handleCancelResearch = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`/api/research/cancel/${activeJobId}`, { method: "POST" });
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setJobStatus("cancelled");
      notify("Research run cancelled.");
    } catch (e) {
      console.warn("Cancel error:", e);
    }
  };

  const handleLoadSavedReport = async (id: string) => {
    try {
      const res = await fetch(`/api/research/detail/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveJobId(id);
        setQuery(data.query || "");
        setCategory(data.category || "general");
        setPlan(data.sub_questions || []);
        setSources(data.sources || []);
        setFindings(data.findings || []);
        setReportMarkdown(data.report_markdown || data.result || "");
        setReportStats(data.stats);
        setJobStatus("done");
        setActiveTab("workspace");
        setReportTab("visual");
        notify(`Loaded saved report: "${data.query}"`);
      }
    } catch (e) {
      notify("Failed to load saved report.");
    }
  };

  const handleDeleteSavedReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/research/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLibraryList((prev) => prev.filter((item) => item.id !== id));
        notify("Report deleted from library.");
      }
    } catch (err) {
      notify("Failed to delete report.");
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${query.slice(0, 30).replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_Research_Report.md`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Markdown report downloaded.");
  };

  const handleDownloadHtml = () => {
    if (!activeJobId) return;
    window.open(`/api/research/report/${activeJobId}`, "_blank");
  };

  const CATEGORIES = [
    { id: "general", label: "Comprehensive Deep Dive", icon: "🌐" },
    { id: "product", label: "Product & Architecture", icon: "🏛️" },
    { id: "comparison", label: "Comparison Matrix", icon: "⚖️" },
    { id: "howto", label: "Technical How-To", icon: "🛠️" },
    { id: "factcheck", label: "Fact Check & Debunk", icon: "🛡️" },
  ];

  const SEARCH_PROVIDERS = [
    { id: "DuckDuckGo (Live Web)", name: "DuckDuckGo", desc: "No API key required • Live Web", icon: "🦆" },
    { id: "Tavily Search API", name: "Tavily", desc: "AI-optimized search & clean markdown", icon: "⚡" },
    { id: "Brave Search API", name: "Brave Search", desc: "Independent Web Index & Neural Search", icon: "🦁" },
    { id: "Google Search Grounding", name: "Google Grounding", desc: "Live Gemini Google Search Grounding", icon: "🔍" },
  ];

  return (
    <div className="absolute inset-0 z-[15] bg-slate-50 dark:bg-slate-950 flex flex-col font-sans overflow-hidden">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
            title="Back to Studio"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white text-base font-bold shadow-sm">
              🔬
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
                Odysseus Deep Research
              </h2>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium tracking-tight">
                <span>Autonomous</span>
                <span aria-hidden="true">·</span>
                <span>Deep dive</span>
                <span aria-hidden="true">·</span>
                <span>Verified</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab switch: Workspace vs Library */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "workspace"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Investigation
          </button>
          <button
            onClick={() => setActiveTab("library")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "library"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Archive <span className="ml-1 opacity-50 tabular-nums">{libraryList.length}</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {activeTab === "workspace" ? (
          <>
            {/* Query & Strategy Input Box */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <label className="text-[11px] font-bold tracking-tight text-slate-400 flex items-center gap-2">
                  Investigative prompt & scope
                </label>
                <div className="flex flex-wrap gap-1 p-1 bg-slate-50 rounded-xl border border-slate-100">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        category === c.id
                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs border border-slate-100 dark:border-slate-700"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {c.label.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <AttachedFilePills attachedFiles={attachedFiles} onRemoveFile={(id) => setAttachedFiles(f => f.filter(x => x.id !== id))} />
                <div className="relative flex items-center">
                  <textarea
                    rows={2}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter any complex research question or attach source documents..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-3.5 pr-10 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none transition"
                  />
                  <div className="absolute right-2.5 top-2.5">
                    <FilePicker
                      attachedFiles={attachedFiles}
                      onAddFiles={(files) => setAttachedFiles(f => [...f, ...files])}
                      onRemoveFile={(id) => setAttachedFiles(f => f.filter(x => x.id !== id))}
                      compact={true}
                    />
                  </div>
                </div>
              </div>

              {/* Provider & Depth Configuration Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 mb-1">Search provider</div>
                  <select
                    value={searchProvider}
                    onChange={(e) => setSearchProvider(e.target.value)}
                    className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                  >
                    {SEARCH_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.icon} {p.name} ({p.desc.split("•")[0].trim()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Search depth & fan-out ({depthRounds} runs)</span>
                    <span className="text-sky-600 dark:text-sky-400 font-bold">Range: 3 to 25 runs</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={3}
                        max={25}
                        value={depthRounds}
                        onChange={(e) => setDepthRounds(Number(e.target.value))}
                        className="flex-1 accent-sky-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-800 rounded-lg"
                      />
                      <input
                        type="number"
                        min={3}
                        max={25}
                        value={depthRounds}
                        onChange={(e) => {
                          const v = Math.min(25, Math.max(3, Number(e.target.value) || 3));
                          setDepthRounds(v);
                        }}
                        className="w-14 text-xs font-bold text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-1 text-sky-600 dark:text-sky-400 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {[3, 5, 10, 15, 20, 25].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setDepthRounds(r)}
                          className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold border transition text-center ${
                            depthRounds === r
                              ? "bg-white dark:bg-slate-800 border-sky-400 text-sky-700 dark:text-sky-300 shadow-xs"
                              : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {r} Runs
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={handleGeneratePlan}
                  disabled={isPlanning || jobStatus === "running"}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isPlanning ? (
                    <>
                      <span className="w-3 h-3 rounded-xl border-2 border-sky-500 border-t-transparent animate-spin" />
                      Drafting Plan...
                    </>
                  ) : (
                    <>📋 {plan.length > 0 ? "Regenerate Plan" : "Draft Strategic Plan"}</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleStartResearch}
                  disabled={jobStatus === "running" || !query.trim()}
                  className="flex-1 px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-semibold text-xs shadow-sm hover:shadow transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {jobStatus === "running" ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-xl border-2 border-white border-t-transparent animate-spin" />
                      Research Running (Round {currentRound}/{depthRounds})...
                    </>
                  ) : (
                    <>🚀 Launch Deep Research ({depthRounds} Rounds)</>
                  )}
                </button>

                {jobStatus === "running" && (
                  <button
                    type="button"
                    onClick={handleCancelResearch}
                    className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 text-xs font-semibold hover:bg-rose-100 transition cursor-pointer"
                  >
                    ⏹ Stop
                  </button>
                )}
              </div>
            </div>

            {/* Strategic Plan Breakdown Card */}
            {plan.length > 0 && jobStatus !== "running" && (
              <div className="bg-sky-50/50 dark:bg-sky-950/20 rounded-2xl border border-sky-100 dark:border-sky-900/60 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold tracking-tight text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                    <span>🧭</span> Investigation roadmap & targets
                  </div>
                  <button
                    onClick={() => setPlan([])}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    Reset
                  </button>
                </div>

                <div className="space-y-1.5">
                  {plan.map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5 bg-white dark:bg-slate-900/80 px-3 py-2 rounded-xl border border-sky-100 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 group">
                      <span className="w-5 h-5 rounded-md bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 font-bold text-[11px] flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 font-medium">{step}</span>
                      <button
                        onClick={() => setPlan((p) => p.filter((_, idx) => idx !== i))}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition p-1"
                        title="Remove step"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newPlanStep}
                      onChange={(e) => setNewPlanStep(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newPlanStep.trim()) {
                          setPlan([...plan, newPlanStep.trim()]);
                          setNewPlanStep("");
                        }
                      }}
                      placeholder="+ Add a custom investigative sub-question..."
                      className="flex-1 bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Live Research Synapse & Progress Canvas (during run OR when done) */}
            {(jobStatus === "running" || jobStatus === "done") && (
              <div className="space-y-3">
                {/* Visual Research Synapse Component */}
                <ResearchSynapse
                  query={query}
                  status={jobStatus}
                  round={currentRound}
                  maxRounds={depthRounds}
                  sourcesCount={sources.length}
                  subQuestions={plan}
                  sources={sources}
                />

                {/* Progress bar & telemetry stream */}
                {jobStatus === "running" && (
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-xl bg-sky-500 animate-ping" />
                        {stageMessage}
                      </span>
                      <span className="font-bold text-sky-600 dark:text-sky-400 font-mono">
                        {progressPercent}%
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-xl overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-sky-500 to-indigo-600 h-full rounded-xl transition-all duration-300 shadow-xs"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    {/* Odysseus Crew Active Swarm */}
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs overflow-x-auto gap-1.5">
                      {[
                        { name: "Iris", role: "Query Architect", emoji: "🎯" },
                        { name: "Radar", role: "Provider Scout", emoji: "📡" },
                        { name: "Digger", role: "Deep Reader", emoji: "📖" },
                        { name: "Prism", role: "Evidence Extractor", emoji: "💠" },
                        { name: "Verify", role: "Fact Checker", emoji: "✅" },
                        { name: "Stitch", role: "Report Assembler", emoji: "🧵" },
                      ].map((agent) => {
                        const isActive = stageMessage.toLowerCase().includes(agent.name.toLowerCase()) || stageMessage.toLowerCase().includes(agent.role.toLowerCase());
                        return (
                          <div
                            key={agent.name}
                            className={`flex items-center gap-1.5 px-2 py-1 transition-all shrink-0 ${
                              isActive
                                ? "text-sky-700 dark:text-sky-300 font-bold"
                                : "text-slate-500 opacity-60"
                            }`}
                          >
                            <span className="text-xs">{agent.emoji}</span>
                            <span className="font-semibold text-[11px]">{agent.name}</span>
                            {isActive && <span className="text-[10px] text-sky-500 ml-1">/ Active</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Live Terminal Stream of crawler actions */}
                    <div className="bg-slate-950 text-slate-300 p-3 rounded-xl font-mono text-[11px] max-h-36 overflow-y-auto space-y-1 border border-slate-800">
                      <div className="text-slate-500 text-[10px] font-bold tracking-tight">Autonomous activity logs</div>
                      {activityLogs.slice(-6).map((log, i) => (
                        <div key={i} className="flex gap-2 text-slate-400">
                          <span className="text-slate-600 font-mono">[{new Date(log.time).toLocaleTimeString([], { hour12: false })}]</span>
                          <span className="text-sky-400">[{log.type}]</span>
                          <span className="text-slate-200">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Completed Report Explorer (when done) */}
            {jobStatus === "done" && reportMarkdown && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-0">
                {/* Report Toolbar */}
                <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 bg-slate-200/80 dark:bg-slate-900/80 p-0.5 rounded-xl text-xs font-semibold">
                    <button
                      onClick={() => setReportTab("visual")}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        reportTab === "visual"
                          ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      📑 Visual Report
                    </button>
                    <button
                      onClick={() => setReportTab("matrix")}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        reportTab === "matrix"
                          ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      ⚖️ Evidence Matrix ({findings.length})
                    </button>
                    <button
                      onClick={() => setReportTab("sources")}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        reportTab === "sources"
                          ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      🌐 Sources Radar ({sources.length})
                    </button>
                    <button
                      onClick={() => setReportTab("markdown")}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        reportTab === "markdown"
                          ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      📝 Raw Markdown
                    </button>
                  </div>

                  {/* Export & Spinoff Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowFullscreenReport(true)}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-semibold hover:bg-sky-100 transition cursor-pointer flex items-center gap-1"
                      title="Open Fullscreen Editorial Report"
                    >
                      ⛶ Fullscreen
                    </button>
                    <button
                      onClick={handleDownloadMarkdown}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      📥 .md
                    </button>
                    <button
                      onClick={handleDownloadHtml}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      🌐 HTML
                    </button>
                    {onSendToBrainstorm && (
                      <button
                        onClick={() => onSendToBrainstorm(query)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        💬 Brainstorm
                      </button>
                    )}
                    {onDelegateToCrew && (
                      <button
                        onClick={() => onDelegateToCrew(`Mission kickoff based on research: ${query}`)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        🚀 Assign to mission group
                      </button>
                    )}
                  </div>
                </div>

                {/* Tab 1: Editorial Visual Report View */}
                {reportTab === "visual" && (
                  <div className="p-4 md:p-6 space-y-6">
                    {/* Hero Meta Bar */}
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-blue-600 tracking-tight">
                          Autonomous synthesis
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                          {query}
                        </h2>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500 tabular-nums">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-900">{reportStats?.duration_seconds || 14}s</span>
                          <span className="opacity-50 font-medium">duration</span>
                        </div>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-900">{reportStats?.rounds_executed || depthRounds}</span>
                          <span className="opacity-50 font-medium">rounds</span>
                        </div>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-900">{sources.length}</span>
                          <span className="opacity-50 font-medium">verified sources</span>
                        </div>
                      </div>
                    </div>

                    {/* Markdown Rendered Content */}
                    <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                      {reportMarkdown}
                    </div>
                  </div>
                )}

                {/* Tab 2: Findings & Evidence Matrix */}
                {reportTab === "matrix" && (
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold text-[10px]">
                          <th className="py-2.5 px-3 text-slate-500">Sub-topic</th>
                          <th className="py-2.5 px-3 text-slate-500">Empirical claim / Signal</th>
                          <th className="py-2.5 px-3 text-slate-500">Classification</th>
                          <th className="py-2.5 px-3 text-slate-500">Corroborating source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {findings.map((f, i) => (
                          <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100 max-w-[140px] truncate">
                              {f.topic}
                            </td>
                            <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                              {f.claim}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`text-[10px] font-bold tracking-tight ${
                                f.type === "verified" ? "text-emerald-600 dark:text-emerald-400" :
                                f.type === "contrasting" ? "text-amber-600 dark:text-amber-400" :
                                "text-sky-600 dark:text-sky-400"
                              }`}>
                                {f.type === "verified" ? "Verified" : f.type === "contrasting" ? "Tradeoff" : "Metric"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-500">
                              <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline truncate max-w-[150px] inline-block">
                                {f.source_title}
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tab 3: Sources Radar */}
                {reportTab === "sources" && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sources.map((s, i) => (
                      <div key={i} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-sky-300 transition flex items-start gap-3">
                        <span className="w-6 h-6 rounded-md bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-900 dark:text-white hover:text-sky-500 truncate block">
                            {s.title}
                          </a>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {s.snippet || "Primary reference source cited in findings."}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                            <span>🌐 {s.domain}</span>
                            <span>•</span>
                            <span className="text-emerald-500 font-bold tabular-nums">{s.relevance || 92}% match</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 4: Raw Markdown */}
                {reportTab === "markdown" && (
                  <div className="p-4">
                    <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap border border-slate-800">
                      {reportMarkdown}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Tab: Research Library */
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search archived research by topic..."
                className="flex-1 max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
              />
              <select
                value={librarySort}
                onChange={(e) => setLibrarySort(e.target.value)}
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300"
              >
                <option value="recent">Most Recent</option>
                <option value="sources">Most Sources</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>

            {loadingLibrary ? (
              <div className="py-12 text-center text-xs text-slate-400">
                <span className="w-5 h-5 rounded-xl border-2 border-sky-500 border-t-transparent animate-spin inline-block mb-2" />
                <p>Loading saved research reports...</p>
              </div>
            ) : libraryList.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-2">
                <div className="text-3xl">📂</div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">No research reports saved yet</div>
                <div className="text-xs text-slate-400">Launch a research inquiry in the Studio to auto-persist reports here.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {libraryList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleLoadSavedReport(item.id)}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-400 transition cursor-pointer shadow-xs group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                        {item.category}
                      </span>
                      <button
                        onClick={(e) => handleDeleteSavedReport(item.id, e)}
                        className="text-slate-400 hover:text-rose-500 transition p-1 text-xs"
                        title="Delete report"
                      >
                        ✕
                      </button>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-2 group-hover:text-sky-500 transition line-clamp-2">
                      {item.query}
                    </h3>

                    <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span>🌐 {item.source_count} sources</span>
                      <span>•</span>
                      <span>⏱️ {item.duration}</span>
                      <span>•</span>
                      <span>{new Date(item.completed_at || item.started_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen HTML Report Modal Viewer */}
      {showFullscreenReport && activeJobId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col p-2 md:p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col flex-1 border border-slate-200 dark:border-slate-800">
            <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-base">📑</span>
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate max-w-md">
                  {query} — Full Editorial Visual Report
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open(`/api/research/report/${activeJobId}`, "_blank")}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-sky-500 text-white hover:bg-sky-600 transition"
                >
                  Open in New Window ↗
                </button>
                <button
                  onClick={() => setShowFullscreenReport(false)}
                  className="px-2 py-1 text-xs font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition"
                >
                  Close ✕
                </button>
              </div>
            </div>
            <iframe
              src={`/api/research/report/${activeJobId}`}
              className="flex-1 w-full h-full border-none bg-slate-50 dark:bg-slate-950"
              title="Editorial Visual Report"
            />
          </div>
        </div>
      )}
    </div>
  );
};
