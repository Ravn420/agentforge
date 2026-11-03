import React, { useState, useEffect, useRef } from "react";
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
      connectToStream(jobId);
      startFallbackPolling(jobId);
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
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
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
    { id: "general", label: "General", icon: "" },
    { id: "product", label: "Product", icon: "" },
    { id: "comparison", label: "Comparison", icon: "" },
    { id: "howto", label: "How-to", icon: "" },
    { id: "factcheck", label: "Fact check", icon: "" },
  ];

  const SEARCH_PROVIDERS = [
    { id: "DuckDuckGo (Live Web)", name: "DuckDuckGo", desc: "No API key required", icon: "" },
    { id: "Tavily Search API", name: "Tavily", desc: "Search API", icon: "" },
    { id: "Brave Search API", name: "Brave Search", desc: "Search API", icon: "" },
    { id: "Google Search Grounding", name: "Google Grounding", desc: "Search grounding", icon: "" },
  ];

  return (
    <div className="absolute inset-0 z-[15] bg-slate-50 flex flex-col font-sans overflow-hidden text-slate-900">
      <div className="h-12 px-3 flex items-center justify-between shrink-0 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="h-8 px-2 rounded-lg text-[12px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            Back
          </button>
          <h2 className="text-[14px] font-semibold tracking-tight truncate">Deep Research</h2>
        </div>
        <div className="flex items-center p-0.5 rounded-lg bg-slate-100 text-[12px] shrink-0">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`px-2.5 py-1 rounded-md cursor-pointer ${activeTab === "workspace" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            New
          </button>
          <button
            onClick={() => setActiveTab("library")}
            className={`px-2.5 py-1 rounded-md cursor-pointer ${activeTab === "library" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            Saved
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "workspace" ? (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <AttachedFilePills attachedFiles={attachedFiles} onRemoveFile={(id) => setAttachedFiles(f => f.filter(x => x.id !== id))} />
              <div className="relative">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Inquiry</label>
                <textarea
                  rows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What should this research answer?"
                  className="mt-1.5 w-full bg-transparent text-[16px] leading-snug text-slate-900 placeholder-slate-400 focus:outline-none resize-none"
                />
                <div className="absolute right-0 top-0">
                  <FilePicker
                    attachedFiles={attachedFiles}
                    onAddFiles={(files) => setAttachedFiles(f => [...f, ...files])}
                    onRemoveFile={(id) => setAttachedFiles(f => f.filter(x => x.id !== id))}
                    compact={true}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id as typeof category)}
                    className={`px-2.5 py-1 rounded-full text-[12px] border cursor-pointer ${
                      category === c.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 pt-3 border-t border-slate-100 text-[12px] text-slate-500">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">Source</span>
                    <select
                      value={searchProvider}
                      onChange={(e) => setSearchProvider(e.target.value)}
                      className="min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                    >
                      {SEARCH_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 shrink-0">
                    <span>Rounds</span>
                    <input
                      type="number"
                      min={3}
                      max={25}
                      value={depthRounds}
                      onChange={(e) => setDepthRounds(Math.min(25, Math.max(3, Number(e.target.value) || 3)))}
                      className="w-14 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-900 tabular-nums focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGeneratePlan}
                    disabled={isPlanning || jobStatus === "running"}
                    className="text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
                  >
                    {isPlanning ? "Drafting…" : plan.length > 0 ? "Redraft plan" : "Draft plan"}
                  </button>
                  {jobStatus === "running" && (
                    <button type="button" onClick={handleCancelResearch} className="text-slate-500 hover:text-slate-900 cursor-pointer">
                      Stop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleStartResearch}
                    disabled={jobStatus === "running" || !query.trim()}
                    className="ml-auto text-[13px] text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg px-3.5 py-1.5 cursor-pointer"
                  >
                    {jobStatus === "running" ? `Round ${currentRound || 1} of ${depthRounds}` : "Start research"}
                  </button>
                </div>
              </div>
            </div>

            {plan.length > 0 && jobStatus !== "running" && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-3">Plan</div>
                <ol className="space-y-2.5 text-[13px] text-slate-700">
                  {plan.map((step, i) => (
                    <li key={i} className="group flex gap-3">
                      <span className="w-5 shrink-0 text-slate-400 tabular-nums">{i + 1}</span>
                      <span className="flex-1 leading-snug">{step}</span>
                      <button
                        onClick={() => setPlan((p) => p.filter((_, idx) => idx !== i))}
                        className="opacity-0 group-hover:opacity-100 text-[12px] text-slate-400 hover:text-slate-900"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
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
                  placeholder="Add a step and press Enter"
                  className="mt-3 w-full bg-transparent text-[13px] text-slate-800 placeholder-slate-400 outline-none border-t border-slate-100 pt-3"
                />
              </div>
            )}

            {jobStatus === "running" && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-slate-700 truncate">{stageMessage || "Working"}</span>
                  <span className="text-slate-400 tabular-nums">{progressPercent}%</span>
                </div>
                <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-slate-900 transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="space-y-1.5">
                  {activityLogs.slice(-4).map((log, i) => (
                    <div key={i} className="text-[12px] text-slate-500 truncate">{log.message}</div>
                  ))}
                </div>
              </div>
            )}

            {jobStatus === "done" && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 space-y-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                    {([
                      ["visual", "Report"],
                      ["matrix", `Evidence (${findings.length})`],
                      ["sources", `Sources (${sources.length})`],
                      ["markdown", "Markdown"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setReportTab(id)}
                        className={`cursor-pointer ${
                          reportTab === id ? "text-slate-900 font-medium" : "text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-500">
                    <button onClick={() => setShowFullscreenReport(true)} className="hover:text-slate-900 cursor-pointer">Full screen</button>
                    <button onClick={handleDownloadMarkdown} className="hover:text-slate-900 cursor-pointer">Download</button>
                    <button onClick={handleDownloadHtml} className="hover:text-slate-900 cursor-pointer">HTML</button>
                    {onSendToBrainstorm && (
                      <button onClick={() => onSendToBrainstorm(query)} className="hover:text-slate-900 cursor-pointer">Brainstorm</button>
                    )}
                    {onDelegateToCrew && (
                      <button onClick={() => onDelegateToCrew(`Mission kickoff based on research: ${query}`)} className="hover:text-slate-900 cursor-pointer">Assign</button>
                    )}
                  </div>
                </div>

                {!reportMarkdown && (
                  <div className="px-4 py-8 text-[13px] text-slate-500">The report has not come back yet.</div>
                )}

                {reportMarkdown && reportTab === "visual" && (
                  <div className="px-4 sm:px-5 py-5 space-y-4">
                    <div className="text-[12px] text-slate-400 tabular-nums">
                      {reportStats?.duration_seconds || 0}s · {reportStats?.rounds_executed || depthRounds} rounds · {sources.length} sources
                    </div>
                    <div className="max-w-none text-[14px] text-slate-700 leading-7 whitespace-pre-wrap">
                      {reportMarkdown}
                    </div>
                  </div>
                )}

                {reportTab === "matrix" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                          <th className="py-2.5 px-4 font-medium">Topic</th>
                          <th className="py-2.5 px-4 font-medium">Claim</th>
                          <th className="py-2.5 px-4 font-medium">Status</th>
                          <th className="py-2.5 px-4 font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {findings.map((f, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            <td className="py-3 px-4 text-slate-900 align-top max-w-[140px]">{f.topic}</td>
                            <td className="py-3 px-4 text-slate-600 align-top leading-relaxed">{f.claim}</td>
                            <td className="py-3 px-4 align-top">
                              <span className={`text-[12px] ${
                                f.type === "verified" ? "text-emerald-700" :
                                f.type === "contrasting" ? "text-amber-700" :
                                "text-slate-500"
                              }`}>
                                {f.type === "verified" ? "Verified" : f.type === "contrasting" ? "Tradeoff" : "Metric"}
                              </span>
                            </td>
                            <td className="py-3 px-4 align-top">
                              <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:text-slate-900 underline underline-offset-2">
                                {f.source_title}
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {reportTab === "sources" && (
                  <div className="divide-y divide-slate-100">
                    {sources.map((s, i) => (
                      <div key={i} className="px-4 sm:px-5 py-3.5 flex gap-3">
                        <span className="text-[12px] text-slate-400 tabular-nums w-5 shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-slate-900 hover:underline">
                            {s.title}
                          </a>
                          <p className="text-[12px] text-slate-500 mt-1 line-clamp-2">
                            {s.snippet || "Cited in the report."}
                          </p>
                          <div className="mt-1.5 text-[11px] text-slate-400">
                            {s.domain} · {s.relevance || 92}% match
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {reportTab === "markdown" && (
                  <pre className="m-4 sm:m-5 p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-[12px] leading-relaxed overflow-x-auto whitespace-pre-wrap">
                    {reportMarkdown}
                  </pre>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search saved research"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 outline-none focus:border-slate-400"
              />
              <select
                value={librarySort}
                onChange={(e) => setLibrarySort(e.target.value)}
                className="text-[12px] bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700"
              >
                <option value="recent">Most recent</option>
                <option value="sources">Most sources</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>

            {loadingLibrary ? (
              <div className="py-16 text-center text-[13px] text-slate-400">Loading saved reports…</div>
            ) : libraryList.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 px-6">
                <div className="text-[14px] font-medium text-slate-800">No saved reports</div>
                <div className="text-[12px] text-slate-500 mt-1">Finished research is kept here.</div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
                {libraryList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleLoadSavedReport(item.id)}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[14px] text-slate-900 line-clamp-2">{item.query}</h3>
                      <button
                        onClick={(e) => handleDeleteSavedReport(item.id, e)}
                        className="text-[12px] text-slate-400 hover:text-rose-600 shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="mt-1.5 text-[12px] text-slate-400">
                      {item.category} · {item.source_count} sources · {item.duration} · {new Date(item.completed_at || item.started_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showFullscreenReport && activeJobId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex flex-col p-3 sm:p-6">
          <div className="bg-white rounded-2xl overflow-hidden shadow-xl flex flex-col flex-1 border border-slate-200">
            <div className="px-4 h-12 flex items-center justify-between border-b border-slate-200">
              <span className="text-[13px] font-medium text-slate-800 truncate max-w-md">
                {query || "Report"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open(`/api/research/report/${activeJobId}`, "_blank")}
                  className="px-2.5 py-1 text-[12px] rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Open in a new window
                </button>
                <button
                  onClick={() => setShowFullscreenReport(false)}
                  className="px-2.5 py-1 text-[12px] rounded-lg bg-slate-900 text-white"
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              src={`/api/research/report/${activeJobId}`}
              className="flex-1 w-full h-full border-none bg-slate-50"
              title="Research report"
            />
          </div>
        </div>
      )}
    </div>
  );
};