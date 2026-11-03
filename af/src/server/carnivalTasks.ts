/**
 * Carnival task store — single-server integration of the original
 * FastAPI agent task model (entities/Task, TaskStep, ChatMessage, Deliverable).
 * Persists to data/carnival-tasks.json so no second process is required.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "carnival-tasks.json");

export type TaskStatus = "queued" | "running" | "paused" | "completed" | "failed";
export type Autonomy = "full_auto" | "confirm_each_step" | "manual";
export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface CarnivalTask {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  autonomy_level: Autonomy;
  max_steps: number;
  provider: "openrouter" | "bedrock";
  model_id?: string;
  final_summary?: string;
  error_message?: string;
  time_budget_minutes: number;
  // UI compatibility fields (scheduled-task view)
  emoji?: string;
  when?: string;
  created_at: string;
  updated_at: string;
}

export interface CarnivalStep {
  id: string;
  task_id: string;
  order_index: number;
  title: string;
  description?: string;
  status: StepStatus;
  output?: string;
  retry_count: number;
  started_at?: string;
  completed_at?: string;
}

export interface CarnivalMessage {
  id: string;
  task_id: string;
  role: "user" | "agent" | "system";
  content: string;
  created_at: string;
}

export interface CarnivalDeliverable {
  id: string;
  task_id: string;
  name: string;
  file_type: string;
  content?: string;
  storage_url?: string;
  size_bytes?: number;
  created_at: string;
}

interface Store {
  tasks: CarnivalTask[];
  steps: CarnivalStep[];
  messages: CarnivalMessage[];
  deliverables: CarnivalDeliverable[];
}

function emptyStore(): Store {
  return { tasks: [], steps: [], messages: [], deliverables: [] };
}

function load(): Store {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as Store;
  } catch {
    return emptyStore();
  }
}

function save(s: Store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
}

function now() {
  return new Date().toISOString();
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const carnivalTasks = {
  list(): CarnivalTask[] {
    return load().tasks;
  },
  get(taskId: string): CarnivalTask | undefined {
    return load().tasks.find((t) => t.id === taskId);
  },
  create(input: Partial<CarnivalTask> & { title: string; goal: string }): CarnivalTask {
    const s = load();
    const task: CarnivalTask = {
      id: input.id || id(),
      title: input.title,
      goal: input.goal,
      status: input.status || "queued",
      autonomy_level: input.autonomy_level || "full_auto",
      max_steps: input.max_steps ?? 10,
      provider: input.provider || "openrouter",
      model_id: input.model_id,
      time_budget_minutes: input.time_budget_minutes ?? 30,
      emoji: input.emoji || "🕒",
      when: input.when,
      created_at: now(),
      updated_at: now(),
    };
    s.tasks.push(task);
    save(s);
    return task;
  },
  update(taskId: string, patch: Partial<CarnivalTask>): CarnivalTask | undefined {
    const s = load();
    const t = s.tasks.find((x) => x.id === taskId);
    if (!t) return undefined;
    Object.assign(t, patch, { updated_at: now() });
    save(s);
    return t;
  },
  remove(taskId: string): boolean {
    const s = load();
    const before = s.tasks.length;
    s.tasks = s.tasks.filter((t) => t.id !== taskId);
    s.steps = s.steps.filter((x) => x.task_id !== taskId);
    s.messages = s.messages.filter((x) => x.task_id !== taskId);
    s.deliverables = s.deliverables.filter((x) => x.task_id !== taskId);
    save(s);
    return s.tasks.length < before;
  },
  steps(taskId: string): CarnivalStep[] {
    return load().steps.filter((x) => x.task_id === taskId).sort((a, b) => a.order_index - b.order_index);
  },
  addStep(taskId: string, step: Omit<CarnivalStep, "id" | "task_id" | "retry_count"> & { retry_count?: number }): CarnivalStep {
    const s = load();
    const rec: CarnivalStep = {
      id: id(),
      task_id: taskId,
      order_index: step.order_index,
      title: step.title,
      description: step.description,
      status: step.status || "pending",
      output: step.output,
      retry_count: step.retry_count ?? 0,
    };
    s.steps.push(rec);
    save(s);
    return rec;
  },
  messages(taskId: string): CarnivalMessage[] {
    return load().messages.filter((x) => x.task_id === taskId);
  },
  addMessage(taskId: string, role: CarnivalMessage["role"], content: string): CarnivalMessage {
    const s = load();
    const m: CarnivalMessage = { id: id(), task_id: taskId, role, content, created_at: now() };
    s.messages.push(m);
    save(s);
    return m;
  },
  deliverables(taskId: string): CarnivalDeliverable[] {
    return load().deliverables.filter((x) => x.task_id === taskId);
  },
  addDeliverable(taskId: string, d: Omit<CarnivalDeliverable, "id" | "task_id" | "created_at">): CarnivalDeliverable {
    const s = load();
    const rec: CarnivalDeliverable = { id: id(), task_id: taskId, created_at: now(), ...d };
    s.deliverables.push(rec);
    save(s);
    return rec;
  },
};

// Seed the three demo scheduled tasks the UI expected, if store is empty
export function ensureSeed() {
  const s = load();
  if (s.tasks.length > 0) return;
  const seeds = [
    { title: "Daily repo sync", goal: "Pull latest and report changes", emoji: "☀️", when: "7:00 AM daily", status: "queued" as TaskStatus },
    { title: "Weekly dependency audit", goal: "Check for outdated or vulnerable deps", emoji: "📦", when: "Mondays 9:00 AM", status: "queued" as TaskStatus },
    { title: "Monthly knowledge cleanup", goal: "Archive stale notes and reindex", emoji: "🗂️", when: "1st of month", status: "paused" as TaskStatus },
  ];
  for (const seed of seeds) carnivalTasks.create(seed);
}
