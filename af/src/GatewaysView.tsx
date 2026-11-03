import React, { useState } from "react";

export interface CopilotGatewayUIState {
  enabled: boolean;
  apiKey: string;
  showKey: boolean;
  totalCalls: number;
  totalTokens: number;
  activeClients: Array<{ id: string; name: string; ip: string; lastSeen: string; userAgent: string; requests: number }>;
  requestHistory: Array<{ id: string; timestamp: string; model: string; client: string; promptTokens: number; completionTokens: number; latencyMs: number; status: number }>;
  activeTab: "connect" | "tester" | "logs" | "clients";
  activeSnippetTab: "cursor" | "continue" | "python" | "node" | "curl";
  testModel: string;
  testPrompt: string;
  testTesting: boolean;
  testResult: any;
  copiedSnippet: string | null;
}

interface GatewaysViewProps {
  copilotGateway: CopilotGatewayUIState;
  setCopilotGateway: React.Dispatch<React.SetStateAction<CopilotGatewayUIState>>;
  copilotAuth: {
    connected: boolean;
    stage: string;
    username?: string;
    plan?: string;
    sampleModels?: string[];
  };
  handleToggleGateway: () => Promise<void>;
  handleRegenerateGatewayKey: () => Promise<void>;
  handleTestGatewayCall: () => Promise<void>;
  copyGatewaySnippet: (text: string, label: string) => Promise<void>;
  onBack: () => void;
  onOpenSidebar: () => void;
  notify: (msg: string) => void;
  openView: (v: string, showVault?: boolean) => void;
  handleStartCopilotDeviceFlow: () => void;
}

export const GatewaysView: React.FC<GatewaysViewProps> = ({
  copilotGateway,
  setCopilotGateway,
  copilotAuth,
  handleToggleGateway,
  handleRegenerateGatewayKey,
  handleTestGatewayCall,
  copyGatewaySnippet,
  onBack,
  onOpenSidebar,
  notify,
  openView,
  handleStartCopilotDeviceFlow,
}) => {
  const [activeMainTab, setActiveMainTab] = useState<"clients" | "tester" | "logs" | "models">("clients");
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const baseUrl = `${origin}/api/v1`;
  const aliasUrl = `${origin}/copilot/v1`;

  const availableModels = copilotAuth.sampleModels || [
    "copilot-gpt-4o",
    "copilot-claude-3.5-sonnet",
    "copilot-o1-mini",
    "copilot-codex-v2",
    "copilot-gpt-4o-mini",
    "copilot-o3-mini",
    "copilot-claude-3.5-haiku",
    "copilot-text-embedding",
  ];

  const samplePrompts = [
    { label: "LRU Cache", prompt: "Write a high-performance in-memory LRU Cache class in TypeScript with O(1) get and set operations." },
    { label: "FastAPI REST API", prompt: "Create a production-ready Python FastAPI route that validates request bodies with Pydantic and returns streamed responses." },
    { label: "React Custom Hook", prompt: "Write a resilient React useDebounce hook with TypeScript generics and immediate cancellation support." },
    { label: "SQL Query Optimization", prompt: "Explain how to index a PostgreSQL table with 10M rows for multi-column range queries." },
  ];

  return (
    <div className="absolute inset-0 z-[15] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden">
      {/* Header zone with breadcrumbs */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-slate-500">Gateways</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-semibold text-slate-900 dark:text-white font-display">Copilot Bridge</span>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <div className={`w-2 h-2 rounded-xl ${copilotGateway.enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-700"}`} />
            <span className="text-[12px] font-mono font-medium tracking-tight">
              {copilotGateway.enabled ? "ACTIVE" : "STOPPED"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleGateway}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              copilotGateway.enabled
                ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                : "bg-blue-600 text-white hover:bg-blue-500 shadow-sm"
            }`}
          >
            {copilotGateway.enabled ? "Stop Service" : "Start Service"}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 max-w-6xl mx-auto w-full">
        {/* Hero / Explanation */}
        <section className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-white">
                GitHub Copilot API Bridge
              </h1>
              <p className="text-[15px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                Exposes your authenticated GitHub Copilot engine as a standard local OpenAI API bridge. 
                Any external tool—such as Cursor, VS Code Continue.dev, or Python scripts—can communicate 
                with your Copilot subscription via standard <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">/v1</code> endpoints.
              </p>
            </div>
            <div className="hidden md:block text-right space-y-1">
              <div className="text-[11px] font-mono text-slate-400">Endpoint: {baseUrl}</div>
              <div className="text-[11px] font-mono text-slate-400">Spec: OpenAI v1.0.0</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[13px] text-slate-500 dark:text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-xl bg-emerald-500" />
              Upstream: @{copilotAuth.username || "ayresjay"}
            </span>
            <span>·</span>
            <span>Plan: {copilotAuth.plan || "Copilot Business"}</span>
            <span>·</span>
            <button
              type="button"
              onClick={() => openView("settings", true)}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Vault Settings
            </button>
          </div>
        </section>

        {/* Live Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Requests", value: copilotGateway.totalCalls, unit: "calls" },
            { label: "Tokens Served", value: copilotGateway.totalTokens.toLocaleString(), unit: "total" },
            { label: "Active Clients", value: copilotGateway.activeClients.length, unit: "tools" },
            { label: "Stream Support", value: "Ready", unit: "SSE" },
          ].map((stat, i) => (
            <div key={i} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{stat.label}</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">{stat.value}</div>
              <div className="text-[11px] text-slate-400 mt-1">{stat.unit}</div>
            </div>
          ))}
        </div>

        {/* Credentials */}
        <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white">Gateway Credentials</h2>
            <button
              type="button"
              onClick={handleRegenerateGatewayKey}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Regenerate API Key
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-slate-500">Local Base URL</label>
                <span className="text-[10px] font-mono text-slate-400">OpenAI compatible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-[13px] bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 truncate select-all">
                  {baseUrl}
                </div>
                <button
                  onClick={() => copyGatewaySnippet(baseUrl, "Base URL")}
                  className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {copilotGateway.copiedSnippet === "Base URL" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-slate-500">API Key</label>
                <span className="text-[10px] font-mono text-slate-400">Bearer Token</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-[13px] bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 truncate select-all">
                  {copilotGateway.showKey ? copilotGateway.apiKey : `${copilotGateway.apiKey.slice(0, 8)}••••••••••••••••••••`}
                </div>
                <button
                  onClick={() => setCopilotGateway((s) => ({ ...s, showKey: !s.showKey }))}
                  className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  {copilotGateway.showKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => copyGatewaySnippet(copilotGateway.apiKey, "API Key")}
                  className="px-4 py-3 text-xs font-bold text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
                >
                  {copilotGateway.copiedSnippet === "API Key" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Tabbed Workspace */}
        <div className="space-y-6">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit">
            {[
              { id: "clients", label: "Clients" },
              { id: "tester", label: "Playground" },
              { id: "logs", label: "Traffic" },
              { id: "models", label: "Models" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id as any)}
                className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-all cursor-pointer ${
                  activeMainTab === tab.id
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeMainTab === "clients" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1 space-y-1">
                {[
                  { id: "cursor", label: "Cursor IDE" },
                  { id: "continue", label: "Continue.dev" },
                  { id: "python", label: "Python SDK" },
                  { id: "node", label: "Node.js SDK" },
                  { id: "curl", label: "cURL / CLI" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setCopilotGateway((s) => ({ ...s, activeSnippetTab: tab.id as any }))}
                    className={`w-full text-left px-3 py-2 text-[13px] font-medium rounded-lg transition-colors ${
                      copilotGateway.activeSnippetTab === tab.id
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="lg:col-span-3 space-y-4">
                {(() => {
                  const key = copilotGateway.apiKey;
                  let snippet = "";
                  let guide = "";
                  let label = "";

                  if (copilotGateway.activeSnippetTab === "cursor") {
                    label = "Cursor Config";
                    guide = "Settings → Models → Override OpenAI Base URL & API Key";
                    snippet = `Base URL: ${baseUrl}\nAPI Key:  ${key}\n\nModels: copilot-gpt-4o, copilot-claude-3.5-sonnet`;
                  } else if (copilotGateway.activeSnippetTab === "continue") {
                    label = "Continue.dev config.json";
                    guide = "Add to your ~/.continue/config.json";
                    snippet = JSON.stringify({
                      models: [{ title: "Copilot GPT-4o", provider: "openai", model: "copilot-gpt-4o", apiKey: key, apiBase: baseUrl }]
                    }, null, 2);
                  } else if (copilotGateway.activeSnippetTab === "python") {
                    label = "Python OpenAI Example";
                    guide = "Standard python openai library usage";
                    snippet = `from openai import OpenAI\n\nclient = OpenAI(base_url="${baseUrl}", api_key="${key}")\n\nresp = client.chat.completions.create(\n    model="copilot-gpt-4o",\n    messages=[{"role": "user", "content": "Hello!"}],\n    stream=True\n)`;
                  } else if (copilotGateway.activeSnippetTab === "node") {
                    label = "TypeScript / Node Example";
                    guide = "Use with official openai npm package";
                    snippet = `import OpenAI from "openai";\n\nconst openai = new OpenAI({ baseURL: "${baseUrl}", apiKey: "${key}" });\n\nconst completion = await openai.chat.completions.create({\n  model: "copilot-gpt-4o",\n  messages: [{ role: "user", content: "Hi!" }],\n});`;
                  } else {
                    label = "cURL Command";
                    guide = "Test directly in terminal";
                    snippet = `curl -X POST "${baseUrl}/chat/completions" \\\n  -H "Authorization: Bearer ${key}" \\\n  -d '{"model": "copilot-gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'`;
                  }

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-slate-500">{guide}</span>
                        <button
                          onClick={() => copyGatewaySnippet(snippet, label)}
                          className="text-[12px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {copilotGateway.copiedSnippet === label ? "Copied!" : "Copy Code"}
                        </button>
                      </div>
                      <pre className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[13px] leading-relaxed overflow-x-auto text-slate-800 dark:text-slate-300">
                        {snippet}
                      </pre>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeMainTab === "tester" && (
            <div className="max-w-2xl space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-slate-500">Target Model</label>
                  <select
                    value={copilotGateway.testModel}
                    onChange={(e) => setCopilotGateway((s) => ({ ...s, testModel: e.target.value }))}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-slate-500">Quick Starters</label>
                  <div className="flex flex-wrap gap-2">
                    {samplePrompts.map((sp) => (
                      <button
                        key={sp.label}
                        onClick={() => setCopilotGateway((s) => ({ ...s, testPrompt: sp.prompt }))}
                        className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-semibold text-slate-500">System / User Prompt</label>
                <textarea
                  value={copilotGateway.testPrompt}
                  onChange={(e) => setCopilotGateway((s) => ({ ...s, testPrompt: e.target.value }))}
                  rows={4}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 resize-none font-sans"
                  placeholder="Ask the gateway something..."
                />
              </div>

              <button
                onClick={handleTestGatewayCall}
                disabled={copilotGateway.testTesting || !copilotGateway.testPrompt.trim()}
                className="w-full py-3 bg-slate-900 dark:bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-slate-800 dark:hover:bg-blue-500 transition-all disabled:opacity-50"
              >
                {copilotGateway.testTesting ? "Executing Request..." : "Send Test Request"}
              </button>

              {copilotGateway.testResult && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950/50">
                  <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300 uppercase">Response Body</span>
                    <span className="font-mono text-slate-500">Latency: {copilotGateway.testResult.latencyMs}ms</span>
                  </div>
                  <pre className="p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto text-slate-800 dark:text-slate-300">
                    {copilotGateway.testResult.content || JSON.stringify(copilotGateway.testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeMainTab === "logs" && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Model</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Tokens</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Latency</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {copilotGateway.requestHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-slate-400">
                        No traffic detected yet.
                      </td>
                    </tr>
                  ) : (
                    copilotGateway.requestHistory.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-mono font-bold ${req.status < 300 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] font-mono text-slate-700 dark:text-slate-300">{req.model}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-500">{req.client}</td>
                        <td className="px-4 py-3 text-[13px] font-mono tabular-nums text-right text-slate-500">
                          {req.promptTokens + req.completionTokens}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-mono tabular-nums text-right text-slate-500">{req.latencyMs}ms</td>
                        <td className="px-4 py-3 text-[12px] text-right text-slate-400">
                          {new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeMainTab === "models" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { id: "copilot-gpt-4o", provider: "OpenAI", context: "128k", tag: "Recommended" },
                { id: "copilot-claude-3.5-sonnet", provider: "Anthropic", context: "200k", tag: "Top Coding" },
                { id: "copilot-o1-mini", provider: "OpenAI", context: "128k", tag: "Reasoning" },
                { id: "copilot-gpt-4o-mini", provider: "OpenAI", context: "128k", tag: "Fast" },
                { id: "copilot-o3-mini", provider: "OpenAI", context: "128k", tag: "New" },
                { id: "copilot-text-embedding", provider: "OpenAI", context: "8k", tag: "RAG" },
              ].map((m) => (
                <div key={m.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold font-mono text-slate-900 dark:text-white">{m.id}</span>
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{m.tag}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{m.provider}</span>
                    <span>·</span>
                    <span>{m.context} Context</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Clients */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white">Detected Clients</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {copilotGateway.activeClients.length === 0 ? (
              <div className="col-span-2 p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-[13px] text-slate-400">
                No external tools connected yet.
              </div>
            ) : (
              copilotGateway.activeClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-xl bg-emerald-500" />
                    <div>
                      <div className="text-[14px] font-bold text-slate-900 dark:text-white">{client.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{client.ip} · {client.userAgent}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-bold font-mono tabular-nums text-slate-900 dark:text-white">{client.requests}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Requests</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
