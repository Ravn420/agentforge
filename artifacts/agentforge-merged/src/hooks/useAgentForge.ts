import { useState, useCallback, useRef, useEffect } from 'react';
import type { View, Connector, ActivityItem, Model, SearchProvider } from '../types';
import { Icons } from '../components/Icons';

export type { View, Connector, ActivityItem, Model, SearchProvider };
export { Icons };

export const MODELS: Model[] = [
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI" },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "Anthropic" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google" },
  { id: "glm-4.7", name: "GLM-4.7", provider: "Zhipu" },
  { id: "mistral-large-3", name: "Mistral Large 3", provider: "Mistral" },
  { id: "llama-4-maverick", name: "Llama 4 Maverick", provider: "Meta" },
];

export const SEARCH_PROVIDERS: SearchProvider[] = [
  { id: "tavily", name: "Tavily", note: "AI-optimized web search" },
  { id: "google", name: "Google", note: "Broad web coverage" },
  { id: "bing", name: "Bing", note: "Microsoft index" },
  { id: "brave", name: "Brave Search", note: "Independent index" },
  { id: "duckduckgo", name: "DuckDuckGo", note: "Privacy-first" },
  { id: "kagi", name: "Kagi", note: "Premium quality" },
  { id: "exa", name: "Exa", note: "Neural/semantic search" },
  { id: "arxiv", name: "arXiv + PubMed", note: "Academic papers" },
];

export const RESEARCH_PHASES = [
  "Decomposing query into sub-questions",
  "Dispatching parallel search runs",
  "Crawling & reading top sources",
  "Cross-checking claims across sources",
  "Detecting contradictions & gaps",
  "Synthesizing final report",
];

export const SLASH_COMMANDS = [
  { cmd: "/research", desc: "Run a deep research report", hint: "/research <topic>" },
  { cmd: "/connectors", desc: "Manage app connectors", hint: "/connectors" },
  { cmd: "/tasks", desc: "View scheduled tasks", hint: "/tasks" },
  { cmd: "/claw", desc: "Grab files with AgentForge Claw", hint: "/claw" },
  { cmd: "/history", desc: "Browse chat history", hint: "/history" },
  { cmd: "/project", desc: "Open the project workspace", hint: "/project" },
  { cmd: "/slides", desc: "Open project slides", hint: "/slides" },
  { cmd: "/files", desc: "Browse project files", hint: "/files" },
];

export const INITIAL_CONNECTORS: Connector[] = [
  { name: "GitHub", desc: "Repos, issues, PRs", connected: true, category: "Developer tools" },
  { name: "GitLab", desc: "Repos & CI pipelines", connected: false, category: "Developer tools" },
  { name: "Linear", desc: "Issues & projects", connected: false, category: "Developer tools" },
  { name: "Jira", desc: "Issue tracking", connected: false, category: "Developer tools" },
  { name: "Slack", desc: "Channels & messages", connected: true, category: "Communication" },
  { name: "Discord", desc: "Servers & threads", connected: false, category: "Communication" },
  { name: "Gmail", desc: "Email & threads", connected: true, category: "Communication" },
  { name: "Notion", desc: "Pages & databases", connected: true, category: "Docs & knowledge" },
  { name: "Google Drive", desc: "Files & docs", connected: true, category: "Docs & knowledge" },
  { name: "Figma", desc: "Design files", connected: false, category: "Design & product" },
  { name: "Stripe", desc: "Payments & invoices", connected: false, category: "Business & commerce" },
  { name: "YouTube", desc: "Videos & transcripts", connected: false, category: "Media & social" },
  { name: "Tavily", desc: "AI web search", connected: true, category: "Search & research" },
];

export function useAgentForge() {
  const [view, setView] = useState<View>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Project');
  const [toast, setToast] = useState('');
  const [projectTab, setProjectTab] = useState('Chat');
  const [projectSectionTab, setProjectSectionTab] = useState('Slides');
  const [prompt, setPrompt] = useState('');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  
  const [researchQuery, setResearchQuery] = useState('');
  const [researchModel, setResearchModel] = useState(MODELS[1].id);
  const [researchRuns, setResearchRuns] = useState(3);
  const [researchSearch, setResearchSearch] = useState('tavily');
  const [researchState, setResearchState] = useState<'idle' | 'planning' | 'running' | 'done'>('idle');
  const [researchPhase, setResearchPhase] = useState(0);
  const [researchProgress, setResearchProgress] = useState(0);
  const [researchPlan, setResearchPlan] = useState<string[]>([]);
  const [planStepDraft, setPlanStepDraft] = useState('');
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [sourcesFound, setSourcesFound] = useState(0);
  const [searchesDone, setSearchesDone] = useState(0);
  
  const [connectors, setConnectors] = useState<Connector[]>(INITIAL_CONNECTORS);
  const [authTarget, setAuthTarget] = useState<Connector | null>(null);
  const [authStage, setAuthStage] = useState<'consent' | 'redirect' | 'success'>('consent');
  
  const researchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    return () => {
      if (researchTimerRef.current) clearInterval(researchTimerRef.current);
      if (authTimerRef.current) clearTimeout(authTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);
  
  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2200);
  }, []);
  
  const openView = useCallback((v: View) => {
    setView(v);
    setSidebarOpen(false);
  }, []);
  
  const generatePlan = useCallback((q: string) => {
    if (!q.trim()) { notify('Enter a research question first'); return; }
    setResearchState('planning');
    const base = q.trim().replace(/\?+$/, '');
    setResearchPlan([
      `Define the scope and key terms for: ${base}`,
      'Survey the current landscape and major players',
      'Compare strengths, costs, and limitations with evidence',
      'Identify contrarian views and unresolved debates',
      'Synthesize findings into a recommendation matrix',
    ]);
    setActivityFeed([]); setSourcesFound(0); setSearchesDone(0);
    notify('Research plan drafted — edit it, then start');
  }, [notify]);
  
  const startResearch = useCallback((q: string) => {
    if (!q.trim()) { notify('Enter a research question first'); return; }
    if (researchPlan.length === 0) { generatePlan(q); return; }
    setResearchState('running'); setResearchPhase(0); setResearchProgress(0);
    const modelName = MODELS.find(m => m.id === researchModel)?.name || researchModel;
    const searchName = SEARCH_PROVIDERS.find(p => p.id === researchSearch)?.name || researchSearch;
    setActivityFeed([{ id: 0, line: `Run started · ${modelName} · ${researchRuns}x runs · ${searchName}`, timestamp: Date.now() }]);
    setSourcesFound(0); setSearchesDone(0);
    if (researchTimerRef.current) clearInterval(researchTimerRef.current);
    
    const actions: { type: string; line: string }[] = [];
    researchPlan.forEach((step, si) => {
      for (let r = 0; r < Math.max(1, researchRuns - 1); r++) {
        actions.push({ type: 'search', line: `[${searchName}] Search ${actions.filter(a => a.type === 'search').length + 1}: ${step.slice(0, 42)}...` });
        actions.push({ type: 'read', line: 'Reading 3 sources · extracting claims & dates' });
        actions.push({ type: 'reason', line: `Reasoning: refining angle for step ${si + 1}` });
      }
    });
    actions.push({ type: 'cross', line: `Cross-checking claims across ${researchRuns * 4} top sources` });
    actions.push({ type: 'write', line: 'Writing structured report with citations' });
    
    const totalTicks = actions.length; let tick = 0;
    researchTimerRef.current = setInterval(() => {
      tick++;
      setResearchProgress(Math.min(100, Math.round((tick / totalTicks) * 100)));
      setResearchPhase(Math.min(RESEARCH_PHASES.length - 1, Math.floor((tick / totalTicks) * RESEARCH_PHASES.length)));
      if (tick <= actions.length) {
        const a = actions[tick - 1];
        setActivityFeed(f => [...f, { id: tick, line: a.line, timestamp: Date.now() }]);
        if (a.type === 'search') setSearchesDone(n => n + 1);
        if (a.type === 'read') setSourcesFound(n => Math.min(n + 3, researchRuns * 8));
      }
      if (tick >= totalTicks) {
        if (researchTimerRef.current) clearInterval(researchTimerRef.current);
        setResearchPhase(RESEARCH_PHASES.length - 1); setSourcesFound(researchRuns * 8); setResearchState('done');
      }
    }, 320);
  }, [researchPlan, researchModel, researchRuns, researchSearch, generatePlan, notify]);
  
  const stopResearch = useCallback(() => {
    if (researchTimerRef.current) clearInterval(researchTimerRef.current);
    setResearchState(researchPlan.length ? 'planning' : 'idle');
    setActivityFeed(f => [...f, { id: f.length + 1, line: 'Run interrupted by user — partial results kept', timestamp: Date.now() }]);
    notify('Research interrupted');
  }, [researchPlan.length, notify]);
  
  const beginAuth = useCallback(() => {
    setAuthStage('redirect');
    if (authTimerRef.current) clearTimeout(authTimerRef.current);
    authTimerRef.current = setTimeout(() => {
      if (authTarget) setConnectors(prev => prev.map(c => c.name === authTarget.name ? { ...c, connected: true } : c));
      setAuthStage('success');
    }, 1800);
  }, [authTarget]);
  
  const closeAuth = useCallback(() => {
    if (authTimerRef.current) clearTimeout(authTimerRef.current);
    setAuthTarget(null); setAuthStage('consent');
  }, []);
  
  const toggleConnector = useCallback((connector: Connector, value: boolean) => {
    if (value) { setAuthTarget(connector); setAuthStage('consent'); }
    else { setConnectors(prev => prev.map(c => c.name === connector.name ? { ...c, connected: false } : c)); notify(`Disconnected ${connector.name}`); }
  }, [notify]);
  
  const runSlash = useCallback((raw: string): boolean => {
    const text = raw.trim(); const parts = text.split(/\s+/); const cmd = parts[0].toLowerCase(); const arg = parts.slice(1).join(' ');
    switch (cmd) {
      case '/research': setResearchQuery(arg); openView('research'); if (arg) generatePlan(arg); else notify('Research view opened — enter a question'); setPrompt(''); setShowCommandPalette(false); return true;
      case '/connectors': openView('connectors'); setPrompt(''); setShowCommandPalette(false); return true;
      case '/tasks': openView('tasks'); setPrompt(''); setShowCommandPalette(false); return true;
      case '/claw': openView('claw'); setPrompt(''); setShowCommandPalette(false); return true;
      case '/history': openView('history'); setPrompt(''); setShowCommandPalette(false); return true;
      case '/project': openView('project'); setPrompt(''); setShowCommandPalette(false); return true;
      case '/slides': setProjectSectionTab('Slides'); openView('project'); setPrompt(''); setShowCommandPalette(false); return true;
      case '/files': setProjectTab('Files'); openView('project'); setPrompt(''); setShowCommandPalette(false); return true;
    }
    return false;
  }, [openView, generatePlan, notify]);
  
  const handleSend = useCallback(() => {
    const text = prompt.trim();
    if (!text) { notify('Type a message first'); return; }
    if (text.startsWith('/')) { if (!runSlash(text)) notify(`Unknown command: ${text.split(' ')[0]}`); return; }
    notify(`Message sent: ${text.slice(0, 24)}${text.length > 24 ? '...' : ''}`); setPrompt('');
  }, [prompt, runSlash, notify]);
  
  return {
    view, setView, sidebarOpen, setSidebarOpen, activeTab, setActiveTab, toast,
    projectTab, setProjectTab, projectSectionTab, setProjectSectionTab,
    prompt, setPrompt, showCommandPalette, setShowCommandPalette,
    researchQuery, setResearchQuery, researchModel, setResearchModel, researchRuns, setResearchRuns,
    researchSearch, setResearchSearch, researchState, researchPhase, researchProgress,
    researchPlan, setResearchPlan, planStepDraft, setPlanStepDraft, activityFeed, sourcesFound, searchesDone,
    connectors, setConnectors, authTarget, setAuthTarget, authStage, setAuthStage,
    openView, notify, generatePlan, startResearch, stopResearch, beginAuth, closeAuth, toggleConnector, runSlash, handleSend,
  };
}
