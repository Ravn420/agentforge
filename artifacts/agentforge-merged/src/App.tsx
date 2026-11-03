import React from "react";
import { useAgentForge, MODELS, SEARCH_PROVIDERS, RESEARCH_PHASES, SLASH_COMMANDS } from "./hooks/useAgentForge";
import { Icons } from "./components/Icons";
import type { View, Model, SearchProvider, Connector, ActivityItem } from "./hooks/useAgentForge";

type ModelItem = Model;
type SearchProviderItem = SearchProvider;
type ConnectorItem = Connector;
type SlashCommand = { cmd: string; desc: string; hint: string };

// React state setters accept a value or an updater function.
type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

type ResearchViewProps = {
  researchQuery: string;
  setResearchQuery: Setter<string>;
  researchModel: string;
  setResearchModel: Setter<string>;
  researchRuns: number;
  setResearchRuns: Setter<number>;
  researchSearch: string;
  setResearchSearch: Setter<string>;
  researchState: 'idle' | 'planning' | 'running' | 'done';
  researchPhase: number;
  researchProgress: number;
  researchPlan: string[];
  setResearchPlan: Setter<string[]>;
  planStepDraft: string;
  setPlanStepDraft: Setter<string>;
  activityFeed: ActivityItem[];
  sourcesFound: number;
  searchesDone: number;
  MODELS: Model[];
  SEARCH_PROVIDERS: SearchProvider[];
  RESEARCH_PHASES: string[];
  startResearch: (q: string) => void;
  stopResearch: () => void;
};

type ConnectorsViewProps = {
  connectors: Connector[];
  setConnectors: Setter<Connector[]>;
  authTarget: Connector | null;
  authStage: 'consent' | 'redirect' | 'success';
  beginAuth: () => void;
  closeAuth: () => void;
  toggleConnector: (c: Connector, connected: boolean) => void;
};

type ProjectViewProps = {
  projectTab: string;
  setProjectTab: Setter<string>;
  projectSectionTab: string;
  setProjectSectionTab: Setter<string>;
  prompt: string;
  setPrompt: Setter<string>;
  handleSend: () => void;
  showCommandPalette: boolean;
  setShowCommandPalette: Setter<boolean>;
  SLASH_COMMANDS: SlashCommand[];
};

// Status Bar
function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-4 pb-1 text-[13px] font-semibold text-gray-900">
      <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      <div className="flex items-center gap-1.5 text-gray-900">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M2 22h20V2L2 22z" opacity="0.9" /></svg>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4.2-4.7l1.8 1.8a3.4 3.4 0 0 1 4.8 0l1.8-1.8a6 6 0 0 0-8.4 0zM4 10l1.8 1.8a9.9 9.9 0 0 1 12.4 0L20 10a12.4 12.4 0 0 0-16 0z" /></svg>
        <svg viewBox="0 0 26 24" width="24" height="17" fill="none">
          <rect x="1" y="8" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
    </div>
  );
}

// SubHeader
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-gray-800 border-b border-gray-100">
      <div className="flex items-center gap-1">
        <button onClick={onBack} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">{Icons.back()}</button>
      </div>
      <span className="text-[15px] font-semibold text-gray-900">{title}</span>
      <span className="w-[40px]" />
    </div>
  );
}

// ResearchView Component
function ResearchView(props: ResearchViewProps) {
  const { researchQuery, setResearchQuery, researchModel, setResearchModel, researchRuns, setResearchRuns,
    researchSearch, setResearchSearch, researchState, researchPhase, researchProgress,
    researchPlan, setResearchPlan, planStepDraft, setPlanStepDraft, activityFeed, sourcesFound, searchesDone,
    MODELS, SEARCH_PROVIDERS, RESEARCH_PHASES,
    startResearch, stopResearch } = props;
  const isPlanning = researchState === "planning";
  const isRunning = researchState === "running";
  const isDone = researchState === "done";

  return (
    <div className="flex flex-col h-full bg-white">
      <SubHeader title="Deep Research" onBack={() => {}} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Query Input */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Research Question</label>
          <textarea
            value={researchQuery}
            onChange={(e) => setResearchQuery(e.target.value)}
            placeholder="e.g. Compare GPT-5.2 vs Claude Sonnet 4.5 for coding tasks — cost, latency, quality"
            className="w-full min-h-[80px] p-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 text-sm resize-none"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <select value={researchModel} onChange={(e) => setResearchModel(e.target.value)} className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              {MODELS.map((m: ModelItem) => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
            </select>
            <select value={researchSearch} onChange={(e) => setResearchSearch(e.target.value)} className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              {SEARCH_PROVIDERS.map((p: SearchProviderItem) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={researchRuns} onChange={(e) => setResearchRuns(Number(e.target.value))} className="w-24 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}x runs</option>)}
            </select>
          </div>
        </div>

        {/* Plan Editor */}
        {isPlanning && (
          <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan Steps (editable)</span>
              <button onClick={() => startResearch(researchQuery)} className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">Start Research</button>
            </div>
            {researchPlan.map((step: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 text-center text-xs text-gray-400 mt-1">{i + 1}.</span>
                <input
                  value={step}
                              onChange={(e) => setResearchPlan((prev: string[]) => prev.map((s: string, idx: number) => idx === i ? e.target.value : s))}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <input
                value={planStepDraft}
                onChange={(e) => setPlanStepDraft(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && planStepDraft.trim() && (setResearchPlan((prev: string[]) => [...prev, planStepDraft.trim()]), setPlanStepDraft(""))}
                placeholder="Add a custom step…"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
                          <button onClick={() => planStepDraft.trim() && (setResearchPlan((prev: string[]) => [...prev, planStepDraft.trim()]), setPlanStepDraft(""))} className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-gray-600 hover:bg-gray-200 transition-colors">Add</button>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {(isRunning || isDone) && (
          <div className="space-y-2 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{RESEARCH_PHASES[researchPhase]}</span>
              <span className="text-gray-500">{researchProgress}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${researchProgress}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{searchesDone} searches</span>
              <span>{sourcesFound} sources read</span>
              {isRunning && <span className="flex items-center gap-1 text-blue-500"><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />Running…</span>}
              {isDone && <span className="text-green-500 font-medium">Complete</span>}
            </div>
          </div>
        )}

        {/* Activity Feed */}
        {(isRunning || isDone) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Activity Feed</span>
              {isRunning && <button onClick={stopResearch} className="text-xs text-red-500 hover:text-red-600">Stop</button>}
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-1.5 p-3 rounded-xl bg-gray-50 border border-gray-100">
              {activityFeed.map((a: ActivityItem) => (
                <div key={a.id} className="text-xs text-gray-600 font-mono leading-relaxed">{a.line}</div>
              ))}
            </div>
          </div>
        )}

        {/* Results Placeholder */}
        {isDone && (
          <div className="p-4 rounded-xl bg-green-50 border border-green-100">
            <div className="flex items-center gap-2 text-green-700 mb-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              <span className="font-semibold">Research complete</span>
            </div>
            <p className="text-sm text-green-600">Full report with citations would appear here. This demo simulates the research pipeline.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ConnectorsView Component
function ConnectorsView(props: ConnectorsViewProps) {
  const { connectors, authTarget, authStage, beginAuth, closeAuth, toggleConnector } = props;
  const categories = [...new Set(connectors.map((c: ConnectorItem) => c.category))];

  return (
    <div className="flex flex-col h-full bg-white">
      <SubHeader title="Connectors" onBack={() => {}} />
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {categories.map(cat => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">{cat}</h3>
            {connectors.filter((c: ConnectorItem) => c.category === cat).map((conn: ConnectorItem) => (
              <div key={conn.name} className="flex items-center justify-between px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 font-medium text-sm">{conn.name[0]}</div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{conn.name}</p>
                    <p className="text-xs text-gray-500">{conn.desc}</p>
                  </div>
                </div>
                <button onClick={() => toggleConnector(conn, !conn.connected)} className="p-1.5 rounded-full bg-gray-100 text-gray-500 text-sm hover:bg-gray-200 transition-colors">{conn.connected ? "Disconnect" : "Connect"}</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Auth Modal */}
      {authTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closeAuth}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            {authStage === "consent" && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto text-gray-400 font-medium text-sm">{authTarget.name[0]}</div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900">Connect {authTarget.name}?</h3>
                  <p className="text-sm text-gray-500 mt-1">{authTarget.desc}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={closeAuth} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium">Cancel</button>
                  <button onClick={beginAuth} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-medium">Continue</button>
                </div>
              </>
            )}
            {authStage === "redirect" && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto" />
                <h3 className="text-lg font-semibold text-gray-900">Redirecting…</h3>
                <p className="text-sm text-gray-500">Opening {authTarget.name} authorization page</p>
              </div>
            )}
            {authStage === "success" && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto text-green-500">{Icons.check()}</div>
                <h3 className="text-lg font-semibold text-gray-900">Connected!</h3>
                <p className="text-sm text-gray-500">{authTarget.name} is now connected</p>
                <button onClick={closeAuth} className="w-full py-3 rounded-xl bg-blue-500 text-white font-medium mt-2">Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ProjectView Component
function ProjectView(props: ProjectViewProps) {
  const { projectTab, setProjectTab, projectSectionTab, setProjectSectionTab, prompt, setPrompt, handleSend, showCommandPalette, setShowCommandPalette, SLASH_COMMANDS } = props;
  return (
    <div className="flex flex-col h-full bg-white">
      <SubHeader title="Project" onBack={() => {}} />
      <div className="flex-1 flex flex-col">
        {/* Tab Bar */}
        <div className="flex border-b border-gray-100">
          {["Chat", "Files", "Tasks"].map(tab => (
            <button key={tab} onClick={() => setProjectTab(tab)} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${projectTab === tab ? "border-blue-500 text-blue-500" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{tab}</button>
          ))}
        </div>

        {/* Chat Tab */}
        {projectTab === "Chat" && (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-center text-gray-400 text-sm py-8">No messages yet. Start a conversation or use /commands.</div>
            </div>
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    onFocus={() => setShowCommandPalette(true)}
                    onBlur={() => setTimeout(() => setShowCommandPalette(false), 200)}
                    placeholder="Message AgentForge…"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 pr-12"
                  />
                  {showCommandPalette && prompt.startsWith("/") && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-white rounded-xl border border-gray-200 shadow-lg z-10 max-h-60 overflow-y-auto">
                      {SLASH_COMMANDS.filter((c: SlashCommand) => c.cmd.startsWith(prompt.toLowerCase())).map((c: SlashCommand) => (
                        <button key={c.cmd} onClick={() => { setPrompt(c.cmd + " "); setShowCommandPalette(false); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 text-sm flex items-center justify-between">
                          <span className="font-mono text-blue-500">{c.cmd}</span>
                          <span className="text-gray-500">{c.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={handleSend} disabled={!prompt.trim()} className="p-3 rounded-2xl bg-blue-500 text-white disabled:bg-gray-300 disabled:text-gray-500 transition-colors">{Icons.send()}</button>
              </div>
            </div>
          </div>
        )}

        {/* Files Tab */}
        {projectTab === "Files" && (
          <div className="flex-1 flex flex-col">
            <div className="flex border-b border-gray-100">
              {["Slides", "Code", "Docs", "Data"].map(tab => (
                <button key={tab} onClick={() => setProjectSectionTab(tab)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${projectSectionTab === tab ? "border-blue-500 text-blue-500" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{tab}</button>
              ))}
            </div>
            <div className="flex-1 p-4 text-center text-gray-400 text-sm">
              {projectSectionTab} files would appear here
            </div>
          </div>
        )}

        {/* Tasks Tab */}
        {projectTab === "Tasks" && (
          <div className="flex-1 p-4 text-center text-gray-400 text-sm">Scheduled tasks view</div>
        )}
      </div>
    </div>
  );
}

// TasksView Component
function TasksView() {
  return (
    <div className="flex flex-col h-full bg-white">
      <SubHeader title="Tasks" onBack={() => {}} />
      <div className="flex-1 p-4 text-center text-gray-400 text-sm">Task scheduler view</div>
    </div>
  );
}

// ClawView Component
function ClawView() {
  return (
    <div className="flex flex-col h-full bg-white">
      <SubHeader title="AgentForge Claw" onBack={() => {}} />
      <div className="flex-1 p-4 text-center text-gray-400 text-sm">File grabber tool</div>
    </div>
  );
}

// HistoryView Component
function HistoryView() {
  return (
    <div className="flex flex-col h-full bg-white">
      <SubHeader title="History" onBack={() => {}} />
      <div className="flex-1 p-4 text-center text-gray-400 text-sm">Chat history</div>
    </div>
  );
}

// HomeView Component
function HomeView() {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-6 text-white text-3xl">{Icons.sparkles()}</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">AgentForge</h1>
          <p className="text-gray-500 mb-8 max-w-xs mx-auto">Your AI agent workspace. Research, connect, and automate.</p>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            {["Research", "Connectors", "Tasks", "Claw", "History"].map((item) => (
              <button key={item} className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-left hover:bg-gray-100 transition-colors">
                <p className="font-medium text-gray-900 text-sm">{item}</p>
                <p className="text-xs text-gray-500 mt-1">Tap to open</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sidebar Component with collapsible sections
function Sidebar({
  view, openView, sidebarOpen, setSidebarOpen,
  MODELS, SEARCH_PROVIDERS, RESEARCH_PHASES, SLASH_COMMANDS,
}: {
  view: View;
  openView: (id: View) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  MODELS: Model[];
  SEARCH_PROVIDERS: SearchProvider[];
  RESEARCH_PHASES: string[];
  SLASH_COMMANDS: SlashCommand[];
}) {
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({
    research: false,
    connectors: false,
    project: false,
    tools: false,
  });

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sidebarItems = [
    { id: "home", label: "Home", icon: Icons.sparkles },
    { id: "research", label: "Deep Research", icon: Icons.research },
    { id: "connectors", label: "Connectors", icon: Icons.connectors },
    { id: "tasks", label: "Tasks", icon: Icons.tasks },
    { id: "claw", label: "Claw", icon: Icons.claw },
    { id: "history", label: "History", icon: Icons.history },
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-gray-200 shadow-lg transform transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} w-64 overflow-y-auto`}>
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">AgentForge</h2>
        <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">{Icons.close()}</button>
      </div>
      <nav className="p-2 space-y-1">
        {sidebarItems.map(item => (
          <button
            key={item.id}
            onClick={() => { openView(item.id as View); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${view === item.id ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50"}`}
          >
            {item.icon()}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Collapsible Sections */}
      <div className="p-2 space-y-1">
        {/* Research Section */}
        <div>
          <button onClick={() => toggleSection("research")} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 rounded-xl">
            <span>Research Tools</span>
            <span className="transform transition-transform">{collapsedSections.research ? "▸" : "▾"}</span>
          </button>
          {!collapsedSections.research && (
            <div className="pl-4 pr-2 space-y-1">
              <div className="text-xs text-gray-500 px-2 py-1">Models: {MODELS.length} available</div>
              <div className="text-xs text-gray-500 px-2 py-1">Search: {SEARCH_PROVIDERS.length} providers</div>
              <div className="text-xs text-gray-500 px-2 py-1">Phases: {RESEARCH_PHASES.length} steps</div>
            </div>
          )}
        </div>

        {/* Connectors Section */}
        <div>
          <button onClick={() => toggleSection("connectors")} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 rounded-xl">
            <span>Connectors</span>
            <span className="transform transition-transform">{collapsedSections.connectors ? "▸" : "▾"}</span>
          </button>
          {!collapsedSections.connectors && (
            <div className="pl-4 pr-2 space-y-1">
              <div className="text-xs text-gray-500 px-2 py-1">13 integrations available</div>
            </div>
          )}
        </div>

        {/* Project Section */}
        <div>
          <button onClick={() => toggleSection("project")} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 rounded-xl">
            <span>Project</span>
            <span className="transform transition-transform">{collapsedSections.project ? "▸" : "▾"}</span>
          </button>
          {!collapsedSections.project && (
            <div className="pl-4 pr-2 space-y-1">
              <div className="text-xs text-gray-500 px-2 py-1">Tabs: Chat, Files, Tasks</div>
              <div className="text-xs text-gray-500 px-2 py-1">Sections: Slides, Code, Docs, Data</div>
            </div>
          )}
        </div>

        {/* Tools Section */}
        <div>
          <button onClick={() => toggleSection("tools")} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 rounded-xl">
            <span>Commands</span>
            <span className="transform transition-transform">{collapsedSections.tools ? "▸" : "▾"}</span>
          </button>
          {!collapsedSections.tools && (
            <div className="pl-4 pr-2 space-y-1">
              {SLASH_COMMANDS.map((cmd: SlashCommand) => (
                <div key={cmd.cmd} className="text-xs text-gray-500 px-2 py-1 font-mono">{cmd.cmd}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Toast notification
function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-gray-800 text-white text-sm font-medium shadow-lg animate-fade-in">
      {message}
    </div>
  );
}

// Main App Component
export default function App() {
  const {
    view, sidebarOpen, setSidebarOpen, toast,
    projectTab, setProjectTab, projectSectionTab, setProjectSectionTab,
    prompt, setPrompt, showCommandPalette, setShowCommandPalette,
    researchQuery, setResearchQuery, researchModel, setResearchModel, researchRuns, setResearchRuns,
    researchSearch, setResearchSearch, researchState, researchPhase, researchProgress,
    researchPlan, setResearchPlan, planStepDraft, setPlanStepDraft, activityFeed, sourcesFound, searchesDone,
    connectors, setConnectors, authTarget, authStage,
    openView, startResearch, stopResearch, beginAuth, closeAuth, toggleConnector, handleSend,
  } = useAgentForge();

  const renderView = () => {
    switch (view) {
      case "home":
        return <HomeView />;
      case "research":
        return <ResearchView
          researchQuery={researchQuery} setResearchQuery={setResearchQuery}
          researchModel={researchModel} setResearchModel={setResearchModel}
          researchRuns={researchRuns} setResearchRuns={setResearchRuns}
          researchSearch={researchSearch} setResearchSearch={setResearchSearch}
          researchState={researchState} researchPhase={researchPhase} researchProgress={researchProgress}
          researchPlan={researchPlan} setResearchPlan={setResearchPlan}
          planStepDraft={planStepDraft} setPlanStepDraft={setPlanStepDraft}
          activityFeed={activityFeed} sourcesFound={sourcesFound} searchesDone={searchesDone}
          MODELS={MODELS} SEARCH_PROVIDERS={SEARCH_PROVIDERS} RESEARCH_PHASES={RESEARCH_PHASES}
          startResearch={startResearch} stopResearch={stopResearch}
        />;
      case "connectors":
        return <ConnectorsView
          connectors={connectors} setConnectors={setConnectors}
          authTarget={authTarget} authStage={authStage}
          beginAuth={beginAuth} closeAuth={closeAuth} toggleConnector={toggleConnector}
        />;
      case "project":
        return <ProjectView
          projectTab={projectTab} setProjectTab={setProjectTab}
          projectSectionTab={projectSectionTab} setProjectSectionTab={setProjectSectionTab}
          prompt={prompt} setPrompt={setPrompt} handleSend={handleSend}
          showCommandPalette={showCommandPalette} setShowCommandPalette={setShowCommandPalette}
          SLASH_COMMANDS={SLASH_COMMANDS}
        />;
      case "tasks":
        return <TasksView />;
      case "claw":
        return <ClawView />;
      case "history":
        return <HistoryView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-50 overflow-hidden">
      {/* Mobile Phone Frame */}
      <div className="hidden md:flex items-center justify-center w-full">
        <div className="relative">
          <div className="w-[420px] h-[840px] bg-gray-900 rounded-[40px] shadow-2xl relative">
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-40 h-6 bg-gray-800 rounded-b-xl" />
            <div className="absolute top-12 left-0 right-0 h-[780px] bg-white rounded-[32px] overflow-hidden flex flex-col">
              <StatusBar />
              <div className="flex-1 relative">
                <button className="absolute top-4 left-4 z-10 p-2 rounded-full bg-white/90 text-gray-900 hover:bg-white transition-colors" onClick={() => setSidebarOpen(true)}>{Icons.menu()}</button>
                {renderView()}
                <Sidebar
                  view={view} openView={openView}
                  sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
                  MODELS={MODELS} SEARCH_PROVIDERS={SEARCH_PROVIDERS} RESEARCH_PHASES={RESEARCH_PHASES} SLASH_COMMANDS={SLASH_COMMANDS}
                />
                <Toast message={toast} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}