import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";

const execFileAsync = promisify(execFile);

async function runCheck(bin: string, args: string[], timeout = 180000): Promise<{ ok: boolean; details: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: process.cwd(),
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    });
    const details = `${stdout || ""}${stderr || ""}`.trim() || "finished with no output";
    return { ok: true, details: details.slice(-800) };
  } catch (err: any) {
    const details = `${err?.stdout || ""}${err?.stderr || err?.message || "failed"}`.trim().slice(-800);
    return { ok: false, details: details || "failed" };
  }
}

function veniceComplete(prompt: string, purpose = "model"): Promise<{ text: string; model: string }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-m", "venice.bridge", "complete"], {
      env: { ...process.env, PYTHONPATH: "/workspace/artifacts" },
      cwd: "/workspace/artifacts",
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Venice critic timed out"));
    }, 90000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", () => {
      clearTimeout(timer);
      const objects = jsonObjects(out);
      for (let i = objects.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(objects[i]);
          if (parsed?.ok && parsed.text) {
            activeTrace?.calls.push({ purpose, latencyMs: Date.now() - started, ok: true });
            resolve({ text: String(parsed.text), model: String(parsed.model || "venice") });
            return;
          }
        } catch { /* try the previous object */ }
      }
      reject(new Error((err || out || "Venice critic failed").slice(-400)));
      activeTrace?.calls.push({ purpose, latencyMs: Date.now() - started, ok: false });
    });
    child.stdin.end(JSON.stringify({
      model: "deepseek-v4-1-flash-free",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }));
  });
}

function jsonObjects(text: string): string[] {
  const found: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === "\"") inStr = false;
        continue;
      }
      if (ch === "\"") { inStr = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          found.push(text.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return found;
}

function parseCritic(text: string): { verdict: "approve" | "reject"; reasons: string[]; edgeCases: string[] } | null {
  const objects = jsonObjects(text);
  for (let i = objects.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(objects[i]);
      const verdict = String(data.verdict || "").toLowerCase();
      if (verdict !== "approve" && verdict !== "reject") continue;
      const reasons = Array.isArray(data.reasons) ? data.reasons.map((r: unknown) => String(r)).filter(Boolean).slice(0, 6) : [];
      const edgeCases = Array.isArray(data.edgeCases) ? data.edgeCases.map((r: unknown) => String(r)).filter(Boolean).slice(0, 6) : [];
      return { verdict, reasons, edgeCases };
    } catch {
      continue;
    }
  }
  return null;
}

async function askCritic(model: string, call: () => Promise<string>): Promise<CriticReview> {
  try {
    const text = (await call()).trim();
    const parsed = parseCritic(text);
    if (!parsed) return { model, verdict: "unparsed", text: text.slice(0, 500) || "The model returned no JSON verdict." };
    const summary = [parsed.verdict, ...parsed.reasons, ...parsed.edgeCases.map((e) => `edge: ${e}`)].join(" — ");
    return { model, verdict: parsed.verdict, text: summary.slice(0, 500) };
  } catch (err: any) {
    return { model, verdict: "error", text: String(err?.message || err).slice(0, 400) };
  }
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir) || acc.length > 300) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "data" || name === "dist") continue;
    const full = path.join(dir, name);
    let st: fs.Stats;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) listSourceFiles(full, acc);
    else if (/\.(tsx|ts|css)$/.test(name) && st.size < 250_000) {
      const rel = path.relative(process.cwd(), full).split(path.sep).join("/");
      if (rel.startsWith("src/") && !rel.endsWith("server_self_improvement.ts")) acc.push(rel);
    }
  }
  return acc;
}

function isAllowedRel(rel: string): boolean {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  return /^src\/[\w./-]+\.(tsx|ts|css)$/.test(cleaned) && !cleaned.includes("..") && !cleaned.endsWith("server_self_improvement.ts");
}

function isInsideProject(full: string): boolean {
  const root = fs.realpathSync(process.cwd());
  const resolved = fs.existsSync(full) ? fs.realpathSync(full) : path.resolve(full);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function selectTarget(prompt: string): { rel: string; excerpt: string } | { error: string } {
  const files = listSourceFiles(path.join(process.cwd(), "src"));
  if (files.length === 0) return { error: "No source file was available to edit." };
  const request = prompt.trim();
  if (!request) return { error: "No request was given, so no file was edited." };

  const named = request.match(/(?:^|[\s"'`])([\w./-]+\.(?:tsx?|jsx?|css|html|mjs|json))/i);
  if (named) {
    const want = named[1].replace(/^\.\//, "");
    const hit = files.find((f) => f === want || f.endsWith("/" + want) || path.basename(f).toLowerCase() === path.basename(want).toLowerCase());
    if (!hit || !isAllowedRel(hit)) return { error: `${want} is not a file this engine is allowed to edit.` };
    return excerptOf(hit, request);
  }

  const words = request.toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 8);
  const hits = words.length
    ? files.filter((file) => {
        const body = fs.readFileSync(path.join(process.cwd(), file), "utf8").toLowerCase();
        return words.some((w) => body.includes(w));
      })
    : [];
  if (hits.length === 1) return excerptOf(hits[0], request);
  if (hits.length > 1) return { error: "The request matches more than one file. Name the file." };
  return { error: "No source file matched the request. Name the file." };
}

function excerptOf(rel: string, prompt: string): { rel: string; excerpt: string } {
  let text = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  if (text.length > 12000) {
    const words = prompt.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    let at = 0;
    for (const w of words) {
      const i = text.toLowerCase().indexOf(w);
      if (i >= 0) { at = Math.max(0, i - 1500); break; }
    }
    text = text.slice(at, at + 12000);
  }
  return { rel, excerpt: text };
}

function countOf(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

function parseAnalysis(text: string): { goal: string; constraints: string[]; doneWhen: string } | null {
  const objects = jsonObjects(text);
  for (let i = objects.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(objects[i]);
      const goal = String(data?.goal || "").trim().slice(0, 400);
      const doneWhen = String(data?.doneWhen || "").trim().slice(0, 400);
      const constraints = Array.isArray(data?.constraints)
        ? data.constraints.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 4)
        : [];
      if (goal && doneWhen && constraints.length > 0) return { goal, constraints, doneWhen };
    } catch { /* next object */ }
  }
  return null;
}

function parseIdeas(text: string): Array<{ title: string; approach: string; risk: string }> {
  const objects = jsonObjects(text);
  for (let i = objects.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(objects[i]);
      const list = Array.isArray(data?.ideas) ? data.ideas : null;
      if (!list) continue;
      const ideas = list.map((item: any) => ({
        title: String(item?.title || "").trim().slice(0, 160),
        approach: String(item?.approach || "").trim().slice(0, 600),
        risk: String(item?.risk || "").trim().slice(0, 300),
      })).filter((item: { title: string; approach: string }) => item.title && item.approach);
      const unique = ideas.filter((item: { title: string }, idx: number) => ideas.findIndex((other: { title: string }) => other.title.toLowerCase() === item.title.toLowerCase()) === idx);
      if (unique.length >= 2) return unique.slice(0, 3);
    } catch { /* next object */ }
  }
  return [];
}

function parsePick(text: string, count: number): { index: number; why: string; compared: string[] } | null {
  const objects = jsonObjects(text);
  for (let i = objects.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(objects[i]);
      const index = Number(data?.pick);
      const why = String(data?.why || "").trim().slice(0, 500);
      if (!Number.isInteger(index) || index < 0 || index >= count || !why) continue;
      const rows = Array.isArray(data?.compared) ? data.compared : [];
      const compared: string[] = [];
      let coversOthers = true;
      for (let other = 0; other < count; other++) {
        if (other === index) continue;
        const row = rows.find((item: any) => Number(item?.index) === other);
        const worse = String(row?.worse || "").trim().slice(0, 300);
        if (!worse) { coversOthers = false; break; }
        compared.push(`${other}: ${worse}`);
      }
      if (!coversOthers) continue;
      return { index, why, compared };
    } catch { /* next object */ }
  }
  return null;
}

function parseProposal(text: string): { summary: string; file: string; old: string; new: string } | null {
  const objects = jsonObjects(text);
  for (let i = objects.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(objects[i]);
      if (typeof data?.summary !== "string") continue;
      return {
        summary: data.summary.slice(0, 1200),
        file: String(data.file || "").replace(/\\/g, "/").replace(/^\.\//, ""),
        old: String(data.old || ""),
        new: String(data.new || ""),
      };
    } catch { /* next object */ }
  }
  return null;
}

const DATA_DIR = path.join(process.cwd(), "data", "self_improvement");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PENDING_PATCH = path.join(DATA_DIR, "pending-restore.json");

function recoverInterruptedPatch() {
  try {
    if (!fs.existsSync(PENDING_PATCH)) return;
    const data = JSON.parse(fs.readFileSync(PENDING_PATCH, "utf8"));
    if (data?.full && typeof data.original === "string" && isInsideProject(String(data.full))) {
      fs.writeFileSync(String(data.full), data.original);
    }
    fs.unlinkSync(PENDING_PATCH);
  } catch (err) {
    console.error("Could not restore an interrupted self-improvement patch:", err);
  }
}

recoverInterruptedPatch();

type Episode = { id: string; at: number; file: string | null; request: string; outcome: string; archetype: string; approach: string | null };
type Recipe = { file: string; approach: string; kept: number; failed: number };
let activeTrace: { calls: Array<{ purpose: string; latencyMs: number; ok: boolean }> } | null = null;

function loadMemory(): { episodes: Episode[]; recipes: Recipe[] } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "memory.json"), "utf8"));
    return {
      episodes: Array.isArray(raw.episodes) ? raw.episodes.slice(0, 50) : [],
      recipes: Array.isArray(raw.recipes) ? raw.recipes : [],
    };
  } catch {
    return { episodes: [], recipes: [] };
  }
}

function derivePatterns(mem: { episodes: Episode[]; recipes: Recipe[] }): { constraints: string[]; successes: string[] } {
  const rule: Record<string, string> = {
    typecheck_failed: "Do not change a type that is not already in the excerpt.",
    build_failed: "Do not change imports or syntax you have not seen in the excerpt.",
    snippet_not_found: "Copy the old snippet exactly from the excerpt.",
    no_comparison: "Say why every other approach is worse.",
    no_analysis: "State a goal, a constraint, and how to tell the change is finished.",
    no_approaches: "Give at least two different approaches.",
    secrets_blocked: "Do not add keys, tokens, or credentials.",
    deletion_blocked: "Do not delete most of a snippet.",
    critic_rejected: "Stay closer to the request than the last rejected edit.",
  };
  const counts = new Map<string, { file: string; archetype: string; n: number }>();
  for (const ep of mem.episodes) {
    if (!ep.file || ep.outcome === "kept" || ep.archetype === "cancelled" || ep.archetype === "error") continue;
    const key = `${ep.file}|${ep.archetype}`;
    const row = counts.get(key) || { file: ep.file, archetype: ep.archetype, n: 0 };
    row.n += 1;
    counts.set(key, row);
  }
  return {
    constraints: [...counts.values()].filter((row) => row.n >= 2).map((row) => `${row.file} failed ${row.n} times as ${row.archetype}. ${rule[row.archetype] || "Do not repeat that failure."}`),
    successes: mem.recipes.filter((r) => r.kept >= 2 && r.kept > r.failed).map((r) => `${r.file}: the approach that was kept is "${r.approach}" (${r.kept} kept, ${r.failed} failed).`),
  };
}

function memoryBrief(file: string, request: string): string {
  const mem = loadMemory();
  const words = request.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const related = mem.episodes.filter((ep) => ep.file === file || words.some((w) => ep.request.toLowerCase().includes(w))).slice(0, 5);
  const patterns = derivePatterns(mem);
  const constraints = patterns.constraints.filter((line) => line.startsWith(file));
  const successes = patterns.successes.filter((line) => line.startsWith(file));
  return [
    constraints.length ? `Do not repeat:\n${constraints.map((line) => `- ${line}`).join("\n")}` : "Repeated failures: none.",
    successes.length ? `Kept approaches:\n${successes.map((line) => `- ${line}`).join("\n")}` : "",
    related.length ? related.map((ep) => `- ${ep.outcome} (${ep.archetype}) for "${ep.request.slice(0, 100)}"`).join("\n") : "Past runs: none.",
  ].filter(Boolean).join("\n");
}

function guardPatch(rel: string, next: string): string | null {
  if (/secret|credential|\.env|\/auth/i.test(rel)) return `${rel} is security-sensitive, so the edit was not kept.`;
  if (/(api[_-]?key\s*[:=]\s*['"][^'"]{8,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/.test(next)) {
    return "The edit contains something that looks like a secret, so it was not kept.";
  }
  return null;
}

function archetypeOf(note: string, checks: Array<{ check: string; ok: boolean; skipped?: boolean }>, outcome: string): string {
  if (outcome === "cancelled") return "cancelled";
  if (outcome === "kept") return "kept";
  const failed = checks.find((c) => !c.ok && !c.skipped);
  if (failed?.check === "Secrets") return "secrets_blocked";
  if (failed?.check.startsWith("TypeScript")) return "typecheck_failed";
  if (failed?.check === "Vite build" || failed?.check.startsWith("Bundle")) return "build_failed";
  if (failed?.check === "Critic models") return "critic_rejected";
  if (/analysis/i.test(note)) return "no_analysis";
  if (/approaches/i.test(note)) return "no_approaches";
  if (/compare/i.test(note)) return "no_comparison";
  if (/snippet/i.test(note)) return "snippet_not_found";
  if (/too much/i.test(note)) return "deletion_blocked";
  return outcome === "no_patch" ? "no_patch" : "reverted";
}

function rememberRun(input: { id: string; request: string; file: string | null; approach: string | null; outcome: string; archetype: string; checks: Array<{ check: string; status: string }>; startedAt: number }) {
  if (!activeTrace) return;
  const finishedAt = Date.now();
  const dir = path.join(DATA_DIR, "traces");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${input.id}.json`), JSON.stringify({
    ...input,
    startedAt: input.startedAt,
    finishedAt,
    durationMs: finishedAt - input.startedAt,
    calls: activeTrace.calls,
  }, null, 2));
  const mem = loadMemory();
  mem.episodes.unshift({ id: input.id, at: finishedAt, file: input.file, request: input.request, outcome: input.outcome, archetype: input.archetype, approach: input.approach });
  mem.episodes = mem.episodes.slice(0, 50);
  if (input.file && input.approach) {
    let recipe = mem.recipes.find((r) => r.file === input.file && r.approach === input.approach);
    if (!recipe) {
      recipe = { file: input.file, approach: input.approach, kept: 0, failed: 0 };
      mem.recipes.push(recipe);
    }
    if (input.outcome === "kept") recipe.kept += 1;
    else recipe.failed += 1;
  }
  mem.recipes = mem.recipes.filter((r) => !(r.failed >= 2 && r.failed > r.kept));
  const patterns = derivePatterns(mem);
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), JSON.stringify({ ...mem, patterns }, null, 2));
  activeTrace = null;
}

export interface BrainstormRound {
  round: number;
  topic: string;
  dialogue: Array<{ agent: string; role: string; emoji: string; text: string; kind: string }>;
  ideas: Array<{ title: string; desc: string; by: string[]; impact: string }>;
}

export interface CodeDiffRecord {
  file: string;
  beforeSnippet: string;
  afterSnippet: string;
  status: "applied" | "verified" | "rolled_back";
}

export interface MetaPromptAdaptation {
  timestamp: number;
  trigger: string;
  adaptedPrompt: string;
  modelSelected: string;
  temperature: number;
}

export interface CriticReview {
  model: string;
  verdict: "approve" | "reject" | "unparsed" | "error";
  text: string;
}

export interface CriticAuditRecord {
  status: "approved" | "rejected" | "not_executed";
  securityScore: number | null;
  edgeCasesChecked: string[];
  verdict: string;
  reviewers: CriticReview[];
}

export interface SelfImprovementJob {
  id: string;
  status: "idle" | "running" | "done" | "error" | "cancelled";
  userPrompt?: string;
  currentStage: "research" | "brainstorm_1" | "brainstorm_2" | "brainstorm_3" | "implement" | "verify" | "refactor_polish" | "completed";
  progressPercent: number;
  startedAt: number;
  completedAt?: number;
  activeAgent: string;
  activeAgentEmoji: string;
  currentMessage: string;
  logs: Array<{ time: number; stage: string; agent: string; message: string; type?: "info" | "success" | "brainstorm" | "fix" | "verify" }>;
  researchFindings: Array<{ category: string; finding: string; metricBefore: string; targetAfter: string }>;
  brainstormRounds: BrainstormRound[];
  appliedFixes: Array<{ file: string; description: string; impact: string; status: "applied" | "verified" | "rolled_back" | "not_applied" }>;
  verificationResults: Array<{ check: string; status: "passed" | "failed" | "skipped"; details: string }>;
  qualityGateScore: number | null;
  qualityGateStatus: "passed" | "failed" | "not_run";
  metaPromptAdaptations: MetaPromptAdaptation[];
  criticAudit?: CriticAuditRecord;
  vectorMemorySynced: boolean;
  domainVectorTags: string[];
  codeDiffs: CodeDiffRecord[];
  summary: {
    totalOptimizations: number;
    lintScore: string;
    buildStatus: string;
    verifiedFunctional: boolean;
    performanceGain: string;
    qualityGateScore: number | null;
  };
}

let activeJob: SelfImprovementJob | null = null;
const historyJobs: SelfImprovementJob[] = [];

// Load past jobs from disk on boot
try {
  if (fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(DATA_DIR, f), "utf-8");
        const job = JSON.parse(raw);
        historyJobs.push(job);
      } catch (e) {}
    }
    historyJobs.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  }
} catch (e) {}

export function getSelfImprovementStatus(): { activeJob: SelfImprovementJob | null; history: SelfImprovementJob[] } {
  return { activeJob, history: historyJobs.slice(0, 10) };
}

export function cancelSelfImprovement(): boolean {
  if (activeJob && activeJob.status === "running") {
    activeJob.status = "cancelled";
    activeJob.currentMessage = "Self-improvement mission cancelled by user.";
    activeJob.logs.push({
      time: Date.now(),
      stage: activeJob.currentStage,
      agent: "Warden 🛡️",
      message: "Mission cancelled by user request.",
      type: "info",
    });
    saveJobToDisk(activeJob);
    return true;
  }
  return false;
}

export function rollbackSelfImprovementFix(jobId: string, filePath: string): { success: boolean; message: string } {
  const job = historyJobs.find((j) => j.id === jobId) || (activeJob?.id === jobId ? activeJob : null);
  if (!job) return { success: false, message: "That run was not found." };

  const stored = path.join(DATA_DIR, `kept-${jobId}.json`);
  if (!fs.existsSync(stored)) return { success: false, message: "The original is not stored, so the file was not changed." };
  let data: { full?: string; rel?: string; original?: string };
  try {
    data = JSON.parse(fs.readFileSync(stored, "utf8"));
  } catch {
    return { success: false, message: "The stored original could not be read." };
  }
  if (!data.full || typeof data.original !== "string" || data.rel !== filePath || !isInsideProject(data.full)) {
    return { success: false, message: "The stored original does not match this file." };
  }
  fs.writeFileSync(data.full, data.original);
  if (fs.readFileSync(data.full, "utf8") !== data.original) {
    return { success: false, message: "The file was not restored." };
  }
  fs.unlinkSync(stored);

  const fix = job.appliedFixes.find((f) => f.file === filePath);
  if (fix) fix.status = "rolled_back";
  const diff = job.codeDiffs?.find((d) => d.file === filePath);
  if (diff) diff.status = "rolled_back";
  job.logs.push({
    time: Date.now(),
    stage: "fixes",
    agent: "Probe 🧪",
    message: `Restored ${filePath} from the saved original.`,
    type: "info",
  });
  saveJobToDisk(job);
  return { success: true, message: `Restored ${filePath}.` };
}

function saveJobToDisk(job: SelfImprovementJob) {
  try {
    const filePath = path.join(DATA_DIR, `${job.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(job, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed saving self-improvement job to disk:", err);
  }
}

export async function startSelfImprovementMission(ai?: GoogleGenAI | null, requestedBrainstormRounds = 3, userPrompt?: string): Promise<SelfImprovementJob> {
  if (activeJob && activeJob.status === "running") {
    return activeJob;
  }

  const brainstormRounds = Math.min(25, Math.max(3, Number(requestedBrainstormRounds) || 3));
  const jobId = `si-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const cleanPrompt = userPrompt?.trim();
  const job: SelfImprovementJob = {
    id: jobId,
    status: "running",
    userPrompt: cleanPrompt,
    currentStage: "research",
    progressPercent: 5,
    startedAt: Date.now(),
    activeAgent: "Scout",
    activeAgentEmoji: "🔭",
    currentMessage: cleanPrompt
      ? `Asking Venice about: "${cleanPrompt.length > 80 ? cleanPrompt.slice(0, 80) + "…" : cleanPrompt}"`
      : "Name a file and a change before starting.",
    logs: [
      {
        time: Date.now(),
        stage: "research",
        agent: "Scout 🔭",
        message: cleanPrompt
          ? `Request: ${cleanPrompt}`
          : "No request was given.",
        type: "info",
      },
    ],
    researchFindings: [],
    brainstormRounds: [],
    appliedFixes: [],
    verificationResults: [],
    qualityGateScore: null,
    qualityGateStatus: "not_run",
    metaPromptAdaptations: [],
    vectorMemorySynced: false,
    domainVectorTags: cleanPrompt ? ["user_request", "custom_feature", "performance", "ui_polish"] : ["performance", "type_safety", "resilience", "ui_polish"],
    codeDiffs: [],
    summary: {
      totalOptimizations: 0,
      lintScore: "Pending",
      buildStatus: "Pending",
      verifiedFunctional: false,
      performanceGain: "Pending",
      qualityGateScore: null,
    },
  };

  activeJob = job;
  historyJobs.unshift(job);

  // Execute the CrewAI multi-step workflow asynchronously
  executeCrewAISelfImprovementLoop(job, ai, brainstormRounds, cleanPrompt).catch((err) => {
    console.error("Self-improvement execution error:", err);
    recoverInterruptedPatch();
    if (activeTrace) {
      rememberRun({ id: job.id, request: job.userPrompt || "", file: null, approach: null, outcome: "error", archetype: "error", checks: [], startedAt: job.startedAt });
    }
    if (job.status !== "cancelled") {
      job.status = "error";
      job.currentMessage = `Mission failed: ${err.message || String(err)}`;
    }
    saveJobToDisk(job);
  });

  return job;
}

async function executeCrewAISelfImprovementLoop(job: SelfImprovementJob, ai?: GoogleGenAI | null, _brainstormRoundsCount = 3, userPrompt?: string) {
  activeTrace = { calls: [] };
  const startedAt = Date.now();
  job.currentStage = "research";
  job.progressPercent = 10;
  job.activeAgent = "Scout";
  job.activeAgentEmoji = "🔭";
  job.currentMessage = "Analyzing the request against the file.";

  const request = (userPrompt || "").trim();
  const target = selectTarget(request);
  let proposal: { summary: string; file: string; old: string; new: string } | null = null;
  let proposalNote = "error" in target ? target.error : "";
  let shownExcerpt = "error" in target ? "" : target.excerpt;
  let chosen: { title: string; approach: string; risk: string } | null = null;
  let analysis: { goal: string; constraints: string[]; doneWhen: string } | null = null;
  const prior = "error" in target ? "Past runs: none." : memoryBrief(target.rel, request);
  if (prior.includes("Do not repeat:") || prior.includes("Kept approaches:")) {
    job.logs.push({ time: Date.now(), stage: "research", agent: "Venice", message: "Using patterns from earlier runs.", type: "info" });
  }
  job.brainstormRounds = [];
  if (!("error" in target) && job.status !== "cancelled") {
    job.currentStage = "research";
    job.progressPercent = 12;
    try {
      const analysisReply = await veniceComplete([
        "Analyze the request against this file. Do not propose code. Reply with one JSON object and no other text.",
        '{"goal":"what the user wants","constraints":["what must stay true"],"doneWhen":"how to tell the change is finished"}',
        "constraints must name something already in the excerpt that the edit must not break. Do not include a score.",
        prior,
        `User request: ${request}`,
        "Excerpt:",
        target.excerpt,
      ].join("\n"), "analysis");
      if (!analysis) proposalNote = "Venice did not return an analysis, so no patch was written.";
      else {
        job.logs.push({
          time: Date.now(),
          stage: "research",
          agent: "Venice",
          message: `Analysis: ${analysis.goal}`,
          type: "info",
        });
      }
    } catch (err: any) {
      proposalNote = `Analysis failed: ${String(err?.message || err).slice(0, 300)}`;
    }
  }

  if (analysis && !("error" in target) && job.status !== "cancelled") {
    job.currentStage = "brainstorm_1";
    job.progressPercent = 22;
    job.currentMessage = "Asking Venice for approaches.";
    try {
      const ideasReply = await veniceComplete([
        "Propose two or three different ways to satisfy the analysis. Reply with one JSON object and no other text.",
        '{"ideas":[{"title":"short name","approach":"what to change","risk":"what could go wrong"}]}',
        "Do not include a score. The approaches must be different. Do not write the code yet.",
        `Goal: ${analysis.goal}`,
        `Done when: ${analysis.doneWhen}`,
        `Constraints: ${analysis.constraints.join("; ")}`,
        prior,
        `User request: ${request}`,
        `File: ${target.rel}`,
        "Excerpt:",
        target.excerpt,
      ].join("\n"), "brainstorm");
      const ideas = parseIdeas(ideasReply.text);
      if (ideas.length < 2) {
        proposalNote = "Venice did not return two distinct approaches, so no patch was written.";
      } else {
        job.brainstormRounds.push({
          round: 1,
          topic: "Approaches",
          dialogue: ideas.map((idea) => ({ agent: "Venice", role: "proposer", emoji: "", text: `${idea.title}. ${idea.approach}`, kind: "idea" })),
          ideas: ideas.map((idea) => ({ title: idea.title, desc: idea.approach, by: ["Venice"], impact: idea.risk || "risk not stated" })),
        });
        job.logs.push({ time: Date.now(), stage: "brainstorm_1", agent: "Venice", message: `Returned ${ideas.length} approaches.`, type: "brainstorm" });
        if (job.status !== "cancelled") {
          job.currentStage = "brainstorm_2";
          job.currentMessage = "Asking Venice which approach is best.";
          job.progressPercent = 34;
          const pickReply = await veniceComplete([
            "Choose the best approach, not the first one that would work. Reply with one JSON object and no other text.",
            '{"pick":0,"why":"why this is better than the others","compared":[{"index":1,"worse":"why this one is worse"}]}',
            "pick is the index starting at 0. compared must include every approach you did not pick. Do not include a score.",
            "Best means it meets the goal, keeps the constraints, and changes less than the alternatives.",
            `Goal: ${analysis.goal}`,
            `Done when: ${analysis.doneWhen}`,
            `Constraints: ${analysis.constraints.join("; ")}`,
            prior,
            `User request: ${request}`,
            ...ideas.map((idea, index) => `${index}. ${idea.title}: ${idea.approach} Risk: ${idea.risk || "not stated"}`),
          ].join("\n"), "best");
          const pick = parsePick(pickReply.text, ideas.length);
          if (!pick) {
            proposalNote = "Venice did not compare the approaches, so no patch was written.";
          } else {
            chosen = ideas[pick.index];
            job.brainstormRounds.push({
              round: 2,
              topic: "Best",
              dialogue: [
                { agent: "Venice", role: "reviewer", emoji: "", text: pick.why, kind: "pick" },
                ...pick.compared.map((line) => ({ agent: "Venice", role: "comparison", emoji: "", text: line, kind: "reject" })),
              ],
              ideas: [{ title: chosen.title, desc: chosen.approach, by: ["Venice"], impact: "best" }],
            });
            job.logs.push({ time: Date.now(), stage: "brainstorm_2", agent: "Venice", message: `Best approach: "${chosen.title}". ${pick.why}`, type: "brainstorm" });
          }
        }
      }
    } catch (err: any) {
      proposalNote = `Brainstorm failed: ${String(err?.message || err).slice(0, 300)}`;
    }
  }

  if (chosen && !("error" in target) && job.status !== "cancelled") {
    job.currentStage = "research";
    job.currentMessage = `Writing a patch for "${chosen.title}".`;
    const researchPrompt = [
      "Implement only the chosen approach. Reply with one JSON object and no other text.",
      '{"summary":"what and why","file":"relative/path","old":"exact snippet from the excerpt","new":"replacement"}',
      "Copy old exactly from the excerpt. Change as little as possible. Do not include a score.",
      `User request: ${request}`,
      prior,
      `Chosen approach: ${chosen.title}. ${chosen.approach}`,
      analysis ? `Goal: ${analysis.goal}` : "",
      analysis ? `Constraints: ${analysis.constraints.join("; ")}` : "",
      `File: ${target.rel}`,
      "Excerpt:",
      target.excerpt,
    ].join("\n");
    try {
      const reply = await veniceComplete(researchPrompt, "patch");
      proposal = parseProposal(reply.text);
      proposalNote = proposal?.summary || "Venice replied, but not with a usable change.";
    } catch (err: any) {
      proposalNote = `Venice did not answer: ${String(err?.message || err).slice(0, 300)}`;
    }
  }

  job.researchFindings = [
    ...(prior.includes("Do not repeat:") || prior.includes("Kept approaches:") ? [{
      category: "Patterns",
      finding: prior,
      metricBefore: "n/a",
      targetAfter: "used in the next analysis",
    }] : []),
    ...(analysis ? [{
      category: "Analysis",
      finding: `${analysis.goal} Done when: ${analysis.doneWhen} Constraints: ${analysis.constraints.join("; ")}`,
      metricBefore: "n/a",
      targetAfter: "guides the pick",
    }] : []),
    {
      category: "Best approach",
      finding: chosen ? `${chosen.title}. ${chosen.approach}` : proposalNote,
      metricBefore: "n/a",
      targetAfter: proposal ? "unverified until checks pass" : "no patch",
    },
  ];
  job.logs.push({
    time: Date.now(),
    stage: "research",
    agent: "Scout 🔭",
    message: proposal ? `Venice proposed a change to ${proposal.file || ("rel" in target ? target.rel : "a file")}.` : proposalNote,
    type: "info",
  });

  job.currentStage = "implement";
  job.progressPercent = 40;
  job.activeAgent = "Forge";
  job.activeAgentEmoji = "🔥";
  job.appliedFixes = [];
  job.codeDiffs = [];

  let patch: { rel: string; full: string; original: string; old: string; next: string; summary: string; kept: boolean } | null = null;
  let commit = false;
  const restore = () => {
    if (!patch?.kept) return;
    fs.writeFileSync(patch.full, patch.original);
    const back = fs.readFileSync(patch.full, "utf8");
    if (back !== patch.original) throw new Error(`Restore failed for ${patch.rel}`);
    patch.kept = false;
    if (fs.existsSync(PENDING_PATCH)) fs.unlinkSync(PENDING_PATCH);
    job.appliedFixes = job.appliedFixes.map((f) => ({ ...f, status: "rolled_back" as const }));
    job.codeDiffs = job.codeDiffs.map((d) => ({ ...d, status: "rolled_back" as const }));
  };
  try {
  if (job.status === "cancelled") {
    saveJobToDisk(job);
    rememberRun({ id: job.id, request, file: "rel" in target ? target.rel : null, approach: chosen?.title || null, outcome: "cancelled", archetype: "cancelled", checks: [], startedAt });
    return;
  }
  if (proposal && proposal.old && proposal.new && proposal.old !== proposal.new && proposal.old.length >= 12 && proposal.old.length <= 4000 && proposal.new.length <= 8000) {
    if (proposal.old.length > 80 && proposal.new.length < proposal.old.length * 0.4) {
      proposalNote = "The change deletes too much of the snippet. It was not applied.";
    } else if (shownExcerpt && !shownExcerpt.replace(/\r\n/g, "\n").includes(proposal.old.replace(/\r\n/g, "\n")) && !shownExcerpt.replace(/\r\n/g, "\n").includes(proposal.old.replace(/\r\n/g, "\n").trim())) {
      proposalNote = "The snippet was not in the excerpt shown to the model. It was not applied.";
    } else {
      const rel = isAllowedRel(proposal.file) ? proposal.file : ("rel" in target && isAllowedRel(target.rel) ? target.rel : "");
      const full = rel ? path.resolve(process.cwd(), rel) : "";
      if (!rel || !full || !fs.existsSync(full) || !isInsideProject(full)) {
        proposalNote = "The proposed file is not an editable source file.";
      } else {
        const original = fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n");
        let needle = proposal.old.replace(/\r\n/g, "\n");
        if (countOf(original, needle) !== 1 && countOf(original, needle.trim()) === 1) needle = needle.trim();
        const hits = countOf(original, needle);
        if (hits !== 1) {
          proposalNote = hits === 0 ? "The proposed snippet was not found in the file." : "The proposed snippet matched more than once.";
        } else {
          const next = original.replace(needle, proposal.new);
          fs.writeFileSync(PENDING_PATCH, JSON.stringify({ full, original }));
          fs.writeFileSync(full, next);
          patch = { rel, full, original, old: needle, next: proposal.new, summary: proposal.summary, kept: true };
          job.appliedFixes = [{ file: rel, description: proposal.summary, impact: "Pending checks", status: "applied" }];
          job.codeDiffs = [{ file: rel, beforeSnippet: needle.slice(0, 1200), afterSnippet: proposal.new.slice(0, 1200), status: "applied" }];
          job.currentMessage = `Wrote a patch to ${rel}. Type-checking before the build.`;
          job.logs.push({ time: Date.now(), stage: "implement", agent: "Forge 🔥", message: `Patched ${rel}. It stays only if the checks pass.`, type: "fix" });
        }
      }
    }
  } else if (!proposalNote) {
    proposalNote = "Venice did not return one exact replacement.";
  }
  if (!patch) {
    job.currentMessage = proposalNote;
    job.logs.push({ time: Date.now(), stage: "implement", agent: "Forge 🔥", message: proposalNote, type: "info" });
  }
  let blocked = false;
  if (patch?.kept) {
    const guard = guardPatch(patch.rel, patch.next);
    if (guard) {
      restore();
      blocked = true;
      proposalNote = guard;
      job.logs.push({ time: Date.now(), stage: "verify", agent: "Probe 🧪", message: guard, type: "verify" });
    }
  }

  job.currentStage = "verify";
  job.progressPercent = 70;
  job.activeAgent = "Probe";
  job.activeAgentEmoji = "🧪";
  job.criticAudit = {
    status: "not_executed",
    securityScore: null,
    edgeCasesChecked: [],
    verdict: "No critic model was called.",
  };

  const tscBin = path.join(process.cwd(), "node_modules", ".bin", "tsc");
  const esbuildBin = path.join(process.cwd(), "node_modules", ".bin", "esbuild");
  const viteBin = path.join(process.cwd(), "node_modules", ".bin", "vite");
  const outDir = path.join(process.cwd(), "data", "self_improvement", "check-build");
  const checks: Array<{ check: string; ok: boolean; details: string; skipped?: boolean }> = [];
  if (job.status === "cancelled") {
    restore();
    saveJobToDisk(job);
    rememberRun({ id: job.id, request, file: "rel" in target ? target.rel : null, approach: chosen?.title || null, outcome: "cancelled", archetype: "cancelled", checks: [], startedAt });
    return;
  }

  checks.push({
    check: "Patch",
    ok: Boolean(patch?.kept),
    details: patch?.kept ? `${patch.rel}: ${patch.summary}` : proposalNote,
  });
  let typecheck = { ok: false, details: "not run" };
  if (blocked || !patch) {
    checks.push({ check: "Secrets", ok: !blocked, skipped: !blocked, details: blocked ? proposalNote : "Not run. No patch was written." });
    typecheck = { ok: false, details: blocked ? "Not run. The edit was blocked." : "Not run. No patch was written." };
    checks.push({ check: "TypeScript (`tsc --noEmit`)", ok: false, skipped: true, details: typecheck.details });
  } else {
    job.currentMessage = "Running tsc --noEmit.";
    typecheck = await runCheck(tscBin, ["--noEmit", "--pretty", "false"]);
    checks.push({ check: "TypeScript (`tsc --noEmit`)", ...typecheck });
  }

  if (!patch || blocked) {
    checks.push(
      { check: "Bundle (`esbuild src/main.tsx`)", ok: false, skipped: true, details: blocked ? "Not run. The edit was blocked." : "Not run. No patch was written." },
      { check: "Vite build", ok: false, skipped: true, details: blocked ? "Not run. The edit was blocked." : "Not run. No patch was written." },
      { check: "Server health (`/api/health`)", ok: false, skipped: true, details: blocked ? "Not run. The edit was blocked." : "Not run. No patch was written." },
    );
  } else if (!typecheck.ok) {
    restore();
    checks.push(
      { check: "Bundle (`esbuild src/main.tsx`)", ok: false, skipped: true, details: "Not run. The type-check failed and the patch was reverted." },
      { check: "Vite build", ok: false, skipped: true, details: "Not run. The type-check failed and the patch was reverted." },
      { check: "Server health (`/api/health`)", ok: false, skipped: true, details: "Not run. The type-check failed and the patch was reverted." },
    );
    job.logs.push({ time: Date.now(), stage: "verify", agent: "Probe 🧪", message: "Type-check failed. The patch was reverted.", type: "verify" });
  } else {
    job.currentMessage = "Type-check passed. Bundling and building the patch.";
    job.progressPercent = 82;
    const bundle = await runCheck(esbuildBin, ["src/main.tsx", "--bundle", "--format=esm", "--packages=external", `--outfile=${path.join(outDir, "ui.js")}`]);
    const build = await runCheck(viteBin, ["build", "--outDir", path.join(outDir, "vite"), "--emptyOutDir"]);
    const health = await runCheck("curl", ["-sf", "--max-time", "5", "http://127.0.0.1:8080/api/health"], 8000);
    checks.push(
      { check: "Bundle (`esbuild src/main.tsx`)", ...bundle },
      { check: "Vite build", ...build },
      { check: "Server health (`/api/health`)", ...health },
    );
    if (!bundle.ok || !build.ok || !health.ok) {
      restore();
      job.logs.push({ time: Date.now(), stage: "verify", agent: "Probe 🧪", message: "A later check failed. The patch was reverted.", type: "verify" });
    }
  }

  const failed = checks.filter((c) => !c.ok && !c.skipped);
  job.currentMessage = "Checks finished. Asking the critic to review the diff.";
  const diffText = patch
    ? `File ${patch.rel}\n--- old\n${patch.old.slice(0, 1500)}\n+++ new\n${patch.next.slice(0, 1500)}\nKept on disk: ${patch.kept ? "yes" : "no, reverted"}`
    : "No patch was written.";
  const criticPrompt = [
    "You are a critic reviewing someone else's change. Reply with one JSON object and no other text.",
    '{"verdict":"approve","reasons":["one short reason"],"edgeCases":["one short risk"]}',
    'verdict must be "approve" or "reject". Do not include a score.',
    "Reject if any check failed, if no patch was written, or if the change does not do what the user asked.",
    "If every check passed and the change matches the request, approve.",
    userPrompt ? `User request: ${userPrompt}` : "User request: one small clarity edit that does not change behavior.",
    chosen ? `Chosen approach: ${chosen.title}. ${chosen.approach}` : "Chosen approach: none.",
    analysis ? `Analysis goal: ${analysis.goal}. Constraints: ${analysis.constraints.join("; ")}` : "Analysis: none.",
    diffText,
    ...checks.map((c) => {
      if (c.skipped) return `- ${c.check}: not run`;
      if (c.ok) return `- ${c.check}: passed`;
      const line = c.details.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "failed";
      return `- ${c.check}: failed (${line.slice(0, 180)})`;
    }),
  ].join("\n");

  const reviewers: CriticReview[] = [];
  reviewers.push(await askCritic("venice/deepseek-v4-1-flash-free", async () => (await veniceComplete(criticPrompt, "critic")).text));
  if (ai) {
    reviewers.push(await askCritic("gemini", async () => {
      const models = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
      let last = "Gemini returned no text.";
      for (const model of models) {
        try {
          const response = await ai.models.generateContent({ model, contents: criticPrompt });
          const text = String(response?.text || "").trim();
          if (text) return text;
        } catch (err: any) {
          last = String(err?.message || err);
          if (last.includes("429") || last.includes("RESOURCE_EXHAUSTED")) break;
        }
      }
      throw new Error(last);
    }));
  }

  const parsed = reviewers.filter((r) => r.verdict === "approve" || r.verdict === "reject");
  const rejectedByModel = parsed.some((r) => r.verdict === "reject");
  const approvedByModel = parsed.length > 0 && parsed.every((r) => r.verdict === "approve");
  const criticRejected = rejectedByModel || (approvedByModel && failed.length > 0);
  const criticStatus: CriticAuditRecord["status"] = parsed.length === 0
    ? "not_executed"
    : criticRejected ? "rejected" : "approved";
  const edgeCases = parsed.flatMap((r) => r.text.split(" — ").filter((part) => part.startsWith("edge: ")).map((part) => part.slice(6)));
  job.criticAudit = {
    status: criticStatus,
    securityScore: null,
    edgeCasesChecked: edgeCases,
    verdict: parsed.length === 0
      ? "No critic returned a verdict."
      : criticRejected && approvedByModel
        ? "Rejected. A model approved, but a check failed, so the approval was not accepted."
        : reviewers.map((r) => `${r.model}: ${r.verdict}`).join("; "),
    reviewers,
  };
  if (patch?.kept && criticStatus === "approved" && failed.length === 0 && job.status !== "cancelled") {
    commit = true;
    fs.writeFileSync(path.join(DATA_DIR, `kept-${job.id}.json`), JSON.stringify({ full: patch.full, rel: patch.rel, original: patch.original }));
    if (fs.existsSync(PENDING_PATCH)) fs.unlinkSync(PENDING_PATCH);
    job.appliedFixes = job.appliedFixes.map((f) => ({ ...f, status: "verified" as const, impact: "Checks passed and the critic approved" }));
    job.codeDiffs = job.codeDiffs.map((d) => ({ ...d, status: "verified" as const }));
  } else if (patch?.kept) {
    restore();
    job.logs.push({
      time: Date.now(),
      stage: "verify",
      agent: "Probe 🧪",
      message: job.status === "cancelled" ? "Cancelled. The patch was reverted." : "The patch was not approved. It was reverted.",
      type: "verify",
    });
  }
  checks.push({
    check: "Critic models",
    ok: criticStatus === "approved",
    details: reviewers.map((r) => `${r.model} (${r.verdict}): ${r.text}`).join("\n").slice(0, 800),
  });
  const patchRow = checks.find((c) => c.check === "Patch");
  if (patchRow && patch && !patch.kept) {
    patchRow.ok = false;
    patchRow.details = `${patchRow.details} The patch was reverted.`;
  }
  const failedAfterCritic = checks.filter((c) => !c.ok && !c.skipped);
  job.qualityGateScore = null;
  job.qualityGateStatus = failedAfterCritic.length === 0 ? "passed" : "failed";
  job.verificationResults = checks.map((c) => ({
    check: c.check,
    status: c.skipped ? "skipped" as const : c.ok ? "passed" as const : "failed" as const,
    details: c.details,
  }));
  const typeRow = checks.find((c) => c.check.startsWith("TypeScript"));
  const buildRow = checks.find((c) => c.check === "Vite build");
  const healthRow = checks.find((c) => c.check.startsWith("Server"));
  job.summary = {
    totalOptimizations: patch?.kept ? 1 : 0,
    lintScore: typeRow?.ok ? "tsc passed" : "tsc failed",
    buildStatus: buildRow?.skipped ? "not run" : buildRow?.ok ? "vite build passed" : "vite build failed",
    verifiedFunctional: Boolean(healthRow?.ok && !healthRow.skipped),
    performanceGain: "not measured",
    qualityGateScore: null,
  };

  job.logs.push({
    time: Date.now(),
    stage: "verify",
    agent: "Probe 🧪",
    message: failedAfterCritic.length === 0
      ? "Type-check, bundle, Vite build, health, and the critic all passed."
      : `${failedAfterCritic.length} check(s) failed: ${failedAfterCritic.map((c) => c.check).join(", ")}.`,
    type: "verify",
  });

  job.vectorMemorySynced = false;
  job.logs.push({
    time: Date.now(),
    stage: "verify",
    agent: "Scribe 📜",
    message: "Past runs were saved by file and request. They are not embeddings.",
    type: "info",
  });

  if (job.status !== "cancelled") {
    job.currentStage = "completed";
    job.progressPercent = 100;
    job.status = "done";
    job.completedAt = Date.now();
    job.activeAgent = "Warden";
    job.activeAgentEmoji = "🛡️";
    job.currentMessage = patch?.kept
      ? `Finished. ${patch.rel} was kept. Checks passed and the critic approved.`
      : failedAfterCritic.length === 0
        ? "Finished. Nothing was written."
        : `Finished. ${failedAfterCritic.length} check(s) failed. The file was not changed.`;
    job.logs.push({
      time: Date.now(),
      stage: "completed",
      agent: "Atlas 🧭",
      message: patch?.kept
        ? `Mission complete. ${patch.rel} was kept.`
        : `Mission complete. Failed: ${failedAfterCritic.map((c) => c.check).join(", ") || "no patch"}.`,
      type: "info",
    });
  }

  saveJobToDisk(job);
  const outcome = job.status === "cancelled" ? "cancelled" : patch?.kept ? "kept" : patch ? "reverted" : "no_patch";
  const archetype = archetypeOf(proposalNote, checks, outcome);
  rememberRun({
    id: job.id,
    request,
    file: "rel" in target ? target.rel : null,
    approach: chosen?.title || null,
    outcome,
    archetype,
    checks: checks.map((c) => ({ check: c.check, status: c.skipped ? "skipped" : c.ok ? "passed" : "failed" })),
    startedAt,
  });
  job.vectorMemorySynced = true;
  } finally {
    if (!commit && patch?.kept) {
      try { restore(); } catch (err) {
        console.error(err);
        recoverInterruptedPatch();
      }
    }
  }
}


