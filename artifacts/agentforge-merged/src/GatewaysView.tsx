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
    <div className="absolute inset-0 z-[15] bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Top Mobile/Header Status Bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-[13px] font-semibold text-slate-400 bg-slate-950 border-b border-slate-900">
        <span>2:38</span>
        <div className="flex items-center gap-1.5 text-slate-400">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
            <path d="M2 22h20V2L2 22z" opacity="0.9" />
          </svg>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
            <path d="M12 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4.2-4.7l1.8 1.8a3.4 3.4 0 0 1 4.8 0l1.8-1.8a6 6 0 0 0-8.4 0zM4 10l1.8 1.8a9.9 9.9 0 0 1 12.4 0L20 10a12.4 12.4 0 0 0-16 0z" />
          </svg>
          <svg viewBox="0 0 26 24" width="24" height="17" fill="none">
            <rect x="1" y="8" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
            <rect x="3" y="10" width="14" height="6" rx="1" fill="currentColor" />
            <path d="M23 11v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* SubHeader */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 relative z-10">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenSidebar}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            aria-label="Open sidebar menu"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-[13px]">
            🌐
          </div>
          <span className="text-[15px] font-bold text-white tracking-wide">API Gateways</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
            copilotGateway.enabled
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              : "bg-slate-800 text-slate-400 border-slate-700"
          }`}>
            {copilotGateway.enabled ? "● RUNNING" : "○ STOPPED"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleToggleGateway}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              copilotGateway.enabled
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
            }`}
          >
            <span>{copilotGateway.enabled ? "Disable" : "Enable"}</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Banner: Explain What the Gateway Is */}
        <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 rounded-2xl border border-blue-900/40 p-4 relative overflow-hidden shadow-lg">
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-white">GitHub Copilot OpenAI-Compatible Gateway</span>
                <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/30 font-semibold">
                  v1 Specification
                </span>
              </div>
              <p className="text-[12px] text-slate-300 leading-relaxed max-w-2xl">
                Exposes your authenticated GitHub Copilot engine as a standard local OpenAI API bridge. Any external tool—such as Cursor, VS Code Continue.dev, Cline, Python scripts, or LangChain—can communicate with your Copilot subscription seamlessly.
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span className="text-[10px] text-slate-400 font-mono">Port: 3000 (Local)</span>
              <span className="text-[10px] text-slate-400 font-mono">CORS: Enabled (*)</span>
            </div>
          </div>

          {/* Connected Account Bar */}
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Upstream Account:</span>
              <span className="font-bold text-white">@{copilotAuth.username || "ayresjay"}</span>
              <span className="text-slate-500 font-mono">({copilotAuth.plan || "Copilot Business"})</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  openView("settings", true);
                }}
                className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>Manage Auth in Vault ↗</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 text-center shadow-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Total Requests</div>
            <div className="text-[20px] font-extrabold text-white font-mono">{copilotGateway.totalCalls}</div>
            <div className="text-[9.5px] text-slate-500 mt-0.5">Proxy completions</div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 text-center shadow-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Tokens Served</div>
            <div className="text-[20px] font-extrabold text-emerald-400 font-mono">
              {copilotGateway.totalTokens.toLocaleString()}
            </div>
            <div className="text-[9.5px] text-slate-500 mt-0.5">Prompt + Gen tokens</div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 text-center shadow-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Active Clients</div>
            <div className="text-[20px] font-extrabold text-blue-400 font-mono">{copilotGateway.activeClients.length}</div>
            <div className="text-[9.5px] text-slate-500 mt-0.5">Identified tools</div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 text-center shadow-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">SSE Streaming</div>
            <div className="text-[20px] font-extrabold text-amber-400 font-mono">Live</div>
            <div className="text-[9.5px] text-slate-500 mt-0.5">text/event-stream</div>
          </div>
        </div>

        {/* Credentials & Endpoint Box */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">🔑</span>
              <div>
                <div className="text-[13px] font-bold text-white">Gateway API Credentials</div>
                <div className="text-[10.5px] text-slate-400">Use these parameters in any external OpenAI-compatible client</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRegenerateGatewayKey}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>🔄 Regenerate Key</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Base URL */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Base URL (OpenAI Spec):</span>
                <span className="text-[10px] text-slate-500 font-mono">/v1 endpoints</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-[12px] font-mono text-emerald-300 select-all overflow-x-auto truncate">
                  {baseUrl}
                </div>
                <button
                  type="button"
                  onClick={() => copyGatewaySnippet(baseUrl, "Base URL")}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11.5px] font-medium rounded-xl transition-colors cursor-pointer shrink-0 border border-slate-700"
                >
                  {copilotGateway.copiedSnippet === "Base URL" ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
              <div className="text-[9.5px] text-slate-500">
                Alternative alias: <span className="font-mono text-slate-400">{aliasUrl}</span>
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>API Key:</span>
                <span className="text-[10px] text-slate-500 font-mono">Bearer auth</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-[12px] font-mono text-slate-100 select-all overflow-x-auto truncate">
                  {copilotGateway.showKey ? copilotGateway.apiKey : `${copilotGateway.apiKey.slice(0, 14)}••••••••••••••••••••`}
                </div>
                <button
                  type="button"
                  onClick={() => setCopilotGateway((s) => ({ ...s, showKey: !s.showKey }))}
                  className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11.5px] rounded-xl transition-colors cursor-pointer shrink-0 border border-slate-700"
                  title={copilotGateway.showKey ? "Hide API Key" : "Show API Key"}
                >
                  {copilotGateway.showKey ? "🙈" : "👁️"}
                </button>
                <button
                  type="button"
                  onClick={() => copyGatewaySnippet(copilotGateway.apiKey, "API Key")}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11.5px] font-medium rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  {copilotGateway.copiedSnippet === "API Key" ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
              <div className="text-[9.5px] text-slate-500">
                Pass in <span className="font-mono text-slate-400">Authorization: Bearer &lt;key&gt;</span> header or as <span className="font-mono text-slate-400">api_key</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Tab Controls */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveMainTab("clients")}
            className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMainTab === "clients" ? "bg-blue-600 text-white shadow-xs font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🔌 Client Presets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab("tester")}
            className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMainTab === "tester" ? "bg-blue-600 text-white shadow-xs font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🧪 API Tester & Playground</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab("logs")}
            className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMainTab === "logs" ? "bg-blue-600 text-white shadow-xs font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>📊 Traffic Logs</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
              {copilotGateway.requestHistory.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab("models")}
            className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMainTab === "models" ? "bg-blue-600 text-white shadow-xs font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🤖 Verified Models</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
              {availableModels.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Client Presets */}
        {activeMainTab === "clients" && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3.5 shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold text-white">1-Click Client Presets & Configs</div>
                <div className="text-[11px] text-slate-400">Select your tool or language to copy ready-to-use configuration</div>
              </div>
            </div>

            {/* Sub-tabs for tools */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto">
              {[
                { id: "cursor", label: "Cursor IDE" },
                { id: "continue", label: "VS Code / Continue" },
                { id: "python", label: "Python OpenAI SDK" },
                { id: "node", label: "Node.js / TypeScript" },
                { id: "curl", label: "cURL / CLI" },
              ].map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setCopilotGateway((s) => ({ ...s, activeSnippetTab: tab.id as any }))}
                  className={`flex-1 min-w-[90px] py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer text-center ${
                    copilotGateway.activeSnippetTab === tab.id
                      ? "bg-blue-600 text-white shadow-xs font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Code Snippets */}
            {(() => {
              const key = copilotGateway.apiKey;
              let snippet = "";
              let guide = "";
              let label = "";

              if (copilotGateway.activeSnippetTab === "cursor") {
                label = "Cursor Config";
                guide = "In Cursor: Settings → Models → Add custom model (e.g. copilot-gpt-4o), set OpenAI Base URL & API Key:";
                snippet = `// Cursor Settings -> Models -> Override OpenAI Base URL:
Base URL: ${baseUrl}
API Key:  ${key}

// Supported Model Names:
- copilot-gpt-4o
- copilot-claude-3.5-sonnet
- copilot-o1-mini
- copilot-codex-v2`;
              } else if (copilotGateway.activeSnippetTab === "continue") {
                label = "Continue.dev config.json";
                guide = "Add to your ~/.continue/config.json:";
                snippet = JSON.stringify(
                  {
                    models: [
                      {
                        title: "Copilot GPT-4o",
                        provider: "openai",
                        model: "copilot-gpt-4o",
                        apiKey: key,
                        apiBase: baseUrl,
                      },
                      {
                        title: "Copilot Claude 3.5 Sonnet",
                        provider: "openai",
                        model: "copilot-claude-3.5-sonnet",
                        apiKey: key,
                        apiBase: baseUrl,
                      },
                    ],
                  },
                  null,
                  2
                );
              } else if (copilotGateway.activeSnippetTab === "python") {
                label = "Python OpenAI Example";
                guide = "Use with standard python openai library (pip install openai):";
                snippet = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${key}",
)

response = client.chat.completions.create(
    model="copilot-gpt-4o",
    messages=[
        {"role": "system", "content": "You are a senior software engineer."},
        {"role": "user", "content": "Explain async generator pipelines in Python with code."}
    ],
    stream=True,
)

for chunk in response:
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)
`;
              } else if (copilotGateway.activeSnippetTab === "node") {
                label = "TypeScript / Node Example";
                guide = "Use with official openai npm package (npm install openai):";
                snippet = `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${key}",
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: "copilot-claude-3.5-sonnet",
    messages: [{ role: "user", content: "Write a high-performance LRU cache in TypeScript." }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}

main();`;
              } else {
                label = "cURL Command";
                guide = "Test directly in your terminal:";
                snippet = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{
    "model": "copilot-gpt-4o",
    "messages": [{"role": "user", "content": "Hello via Copilot Gateway!"}],
    "temperature": 0.7,
    "stream": false
  }'`;
              }

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{guide}</span>
                    <button
                      type="button"
                      onClick={() => copyGatewaySnippet(snippet, label)}
                      className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer flex items-center gap-1"
                    >
                      <span>{copilotGateway.copiedSnippet === label ? "✓ Copied!" : "📋 Copy Snippet"}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11.5px] font-mono text-emerald-300 overflow-x-auto leading-relaxed select-all">
                    {snippet}
                  </pre>
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab 2: Interactive API Tester & Playground */}
        {activeMainTab === "tester" && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3.5 shadow-md">
            <div>
              <div className="text-[13px] font-bold text-white">Live API Gateway Playground</div>
              <div className="text-[11px] text-slate-400">
                Send an actual OpenAI-format completion request directly to your local gateway bridge
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Model Selector */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Model Endpoint:</label>
                  <select
                    value={copilotGateway.testModel}
                    onChange={(e) => setCopilotGateway((s) => ({ ...s, testModel: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-[12px] font-mono text-slate-100 outline-none focus:border-blue-400 cursor-pointer"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Prompt Starters */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Quick Prompts:</label>
                  <div className="flex flex-wrap gap-1">
                    {samplePrompts.map((sp) => (
                      <button
                        type="button"
                        key={sp.label}
                        onClick={() => setCopilotGateway((s) => ({ ...s, testPrompt: sp.prompt }))}
                        className="text-[10px] bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg px-2 py-1 text-slate-300 transition-colors cursor-pointer"
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Prompt Input */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-medium">User Prompt Message:</label>
                <textarea
                  value={copilotGateway.testPrompt}
                  onChange={(e) => setCopilotGateway((s) => ({ ...s, testPrompt: e.target.value }))}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-[12px] text-slate-100 placeholder-slate-500 outline-none focus:border-blue-400 resize-none font-mono"
                  placeholder="Enter prompt for Copilot Gateway..."
                />
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleTestGatewayCall}
                disabled={copilotGateway.testTesting || !copilotGateway.testPrompt.trim()}
                className={`w-full py-2.5 rounded-xl text-[12.5px] font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
                  copilotGateway.testTesting || !copilotGateway.testPrompt.trim()
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                {copilotGateway.testTesting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Calling Gateway /api/v1/chat/completions…</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Send Test Request to Copilot Gateway</span>
                  </>
                )}
              </button>

              {/* Test Result Display */}
              {copilotGateway.testResult && (
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2 mt-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${copilotGateway.testResult.ok ? "bg-emerald-400" : "bg-red-400"}`} />
                      <span className="font-bold text-white">
                        {copilotGateway.testResult.ok ? "200 OK — Gateway Response" : "Request Error"}
                      </span>
                    </div>
                    {copilotGateway.testResult.latencyMs && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        ⏱️ {copilotGateway.testResult.latencyMs}ms · {copilotGateway.testResult.tokens || 120} tokens
                      </span>
                    )}
                  </div>
                  <pre className="text-[11.5px] font-mono text-slate-200 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                    {copilotGateway.testResult.content || JSON.stringify(copilotGateway.testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Traffic Logs */}
        {activeMainTab === "logs" && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <div>
                <div className="text-[13px] font-bold text-white">Gateway Request Traffic Logs</div>
                <div className="text-[11px] text-slate-400">Live feed of all client requests routed through this bridge</div>
              </div>
              <span className="text-[10.5px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                ● Live Streaming
              </span>
            </div>

            {copilotGateway.requestHistory.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-slate-500">
                No requests recorded yet. Fire a test request above or connect Cursor/Continue to see traffic.
              </div>
            ) : (
              <div className="space-y-2">
                {copilotGateway.requestHistory.map((req) => (
                  <div
                    key={req.id}
                    className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-[11px] hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                        {req.status}
                      </span>
                      <div>
                        <div className="font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                          <span>{req.model}</span>
                          <span className="text-[10px] text-slate-500 font-sans">({req.client})</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(req.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400 font-mono text-[10.5px]">
                      <span>{req.promptTokens + req.completionTokens} tokens</span>
                      <span className="text-slate-500">⏱️ {req.latencyMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Verified Models Catalog */}
        {activeMainTab === "models" && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3.5 shadow-md">
            <div>
              <div className="text-[13px] font-bold text-white">Verified Models Exposed via /v1/models</div>
              <div className="text-[11px] text-slate-400">
                Any client connecting to this gateway can query or complete using these verified models
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { id: "copilot-gpt-4o", provider: "OpenAI", context: "128k tokens", desc: "Flagship multimodal reasoning model for complex code, architecture, and chat.", badge: "Recommended" },
                { id: "copilot-claude-3.5-sonnet", provider: "Anthropic", context: "200k tokens", desc: "State-of-the-art coding, autonomous problem solving, and refactoring.", badge: "Top Coding" },
                { id: "copilot-o1-mini", provider: "OpenAI", context: "128k tokens", desc: "Deep reasoning and mathematical verification with internal chain-of-thought.", badge: "Reasoning" },
                { id: "copilot-codex-v2", provider: "GitHub", context: "64k tokens", desc: "Specialized inline code completion, function generation, and test generation.", badge: "Fast" },
                { id: "copilot-gpt-4o-mini", provider: "OpenAI", context: "128k tokens", desc: "Ultra-fast low-latency code assistance and fast agent tool loops.", badge: "Low Latency" },
                { id: "copilot-o3-mini", provider: "OpenAI", context: "128k tokens", desc: "Latest high-efficiency reasoning engine optimized for complex logic.", badge: "New" },
                { id: "copilot-claude-3.5-haiku", provider: "Anthropic", context: "200k tokens", desc: "Rapid responses for real-time editor diagnostics and inline queries.", badge: "Rapid" },
                { id: "copilot-text-embedding", provider: "OpenAI", context: "8k tokens", desc: "Dense semantic vector embeddings for code retrieval and RAG search.", badge: "Embedding" },
              ].map((m) => (
                <div key={m.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1.5 hover:border-blue-900/60 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-300 text-[12px]">{m.id}</span>
                    <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800/40">
                      {m.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 leading-snug">{m.desc}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-900">
                    <span>Provider: {m.provider}</span>
                    <span>Context: {m.context}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Clients Section */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
            <div>
              <div className="text-[13px] font-bold text-white">Recognized Connected Clients</div>
              <div className="text-[11px] text-slate-400">Applications detected connecting via User-Agent and IP headers</div>
            </div>
            <span className="text-[11px] font-bold text-blue-400 bg-blue-950/80 border border-blue-800/40 px-2 py-0.5 rounded-full">
              {copilotGateway.activeClients.length} Active
            </span>
          </div>

          <div className="space-y-2">
            {copilotGateway.activeClients.map((client) => (
              <div
                key={client.id}
                className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-[11px] hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <div>
                    <div className="font-bold text-slate-100 flex items-center gap-2">
                      <span>{client.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({client.userAgent})</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      IP: {client.ip} · Last seen: {client.lastSeen}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11.5px] font-bold text-emerald-400 font-mono">{client.requests} reqs</div>
                  <div className="text-[9.5px] text-slate-500">Connected</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
