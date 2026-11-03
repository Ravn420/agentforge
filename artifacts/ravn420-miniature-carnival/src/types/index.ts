// Backend-facing types below are kept in sync with entities/*.jsonc and
// backend/app/schemas.py - edit all three together. Types after the
// "UI-specific types" divider have no backend counterpart and stay local.

export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed';
export type AutonomyLevel = 'full_auto' | 'confirm_each_step' | 'manual';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type MessageRole = 'user' | 'agent' | 'system';
export type FileType = 'text' | 'markdown' | 'code' | 'csv' | 'json';
export type CallStatus = 'success' | 'error';
export type UserRole = 'admin' | 'user';
export type Provider = 'bedrock' | 'openrouter';

export interface Task {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  autonomy_level: AutonomyLevel;
  max_steps: number;
  provider: Provider;
  model_id?: string;
  final_summary?: string;
  error_message?: string;
  time_budget_minutes: number;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  task_id: string;
  role: MessageRole;
  content: string;
  created_by_id: string;
  created_at: string;
}

export interface User {
  id: string;
  role: UserRole;
  email?: string;
  name?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Deliverable {
  id: string;
  task_id: string;
  name: string;
  file_type: FileType;
  content?: string;
  storage_url?: string;
  size_bytes: number;
  created_by_id: string;
  created_at: string;
}

export interface ProviderSettings {
  id: string;
  provider: Provider;
  aws_region: string;
  openrouter_default_model: string;
  bedrock_default_model: string;
  is_active: boolean;
  created_by_id: string;
  updated_at: string;
}

export interface TaskStep {
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
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  name: string;
  extracted_text?: string;
  file_url?: string;
  size_bytes: number;
  created_at: string;
}

export interface ProviderCall {
  id: string;
  task_id: string;
  provider: Provider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status: CallStatus;
  error?: string;
  created_at: string;
}

// UI-specific types
export type View = 'home' | 'project' | 'research' | 'connectors' | 'tasks' | 'claw' | 'history' | 'chat' | 'crew' | 'brainstorm' | 'settings';

export interface Connector {
  name: string;
  desc: string;
  connected: boolean;
  category: string;
  auth?: 'oauth' | 'apikey' | 'credentials';
  fields?: Array<{ label: string; type?: 'password' }>;
  hint?: string;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
}

export interface SearchProvider {
  id: string;
  name: string;
  note: string;
}

export interface ResearchPlan {
  steps: string[];
  model: string;
  runs: number;
  searchProvider: string;
}

export interface ActivityItem {
  id: number;
  line: string;
  timestamp: number;
}

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  goal: string;
  skill: string;
  tags: string[];
}

export interface CrewPreset {
  id: string;
  label: string;
  ids: string[];
}

export interface BrainstormMessage {
  a: string;
  kind: 'open' | 'challenge' | 'build' | 'idea' | 'synthesize';
  text: string;
}

export interface BrainstormScript {
  messages: BrainstormMessage[];
  ideas: Array<{ title: string; desc: string; by: string[] }>;
}

export interface Improvement {
  icon: string;
  title: string;
  version: string;
  n: number;
}

export interface Chat {
  id: string;
  title: string;
  section: string;
  messages: Array<{ role: 'user' | 'agent'; content: string }>;
}
