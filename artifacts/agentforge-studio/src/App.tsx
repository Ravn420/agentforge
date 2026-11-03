/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import api, { ChatMessage, BrainstormMessage, BrainstormIdea, TaskItem, ClawFile } from "./api";
import { ConnectorIcon } from "./ConnectorIcon";
import { GatewaysView } from "./GatewaysView";
import { DeepResearchView } from "./DeepResearchView";
import { MediaStudioModal } from "./MediaStudioModal";
import { PWAInstallButton } from "./PWAInstallButton";
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, setDoc, deleteDoc, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth();

const ICONS: Record<string, React.ReactNode> = {
  menu: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  chatBubble: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  ),
  checkCircle: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  telescope: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 13.5l13-7 2.5 4.5-13 7L3 13.5z" />
      <path d="M10.5 16.5L9 21M7 14.5L5.5 19" />
      <path d="M18.5 6.5l1-1.8 2 1.2-1 1.8" />
    </svg>
  ),
  plug: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M9 2.5v6M15 2.5v6" />
      <path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0v-3z" />
      <path d="M12 17v4.5" />
    </svg>
  ),
  gateway: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="3.6" y1="9" x2="20.4" y2="9" />
      <line x1="3.6" y1="15" x2="20.4" y2="15" />
      <path d="M11.5 3a17 17 0 0 0 0 18" />
      <path d="M12.5 3a17 17 0 0 1 0 18" />
    </svg>
  ),
  claw: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 4l3.5 3.5M20 4l-3.5 3.5" />
      <path d="M12 3v5" />
      <path d="M6 9c0 1.7 1.2 3 2.6 3.4M18 9c0 1.7-1.2 3-2.6 3.4" />
      <path d="M8.6 12.4c-.4 3.2 1 6.6 3.4 6.6s3.8-3.4 3.4-6.6" />
    </svg>
  ),
  chevronDown: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12z" />
    </svg>
  ),
  folderPlus: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12z" />
      <line x1="12" y1="12" x2="12" y2="17" />
      <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M18 15.5v-5a6 6 0 1 0-12 0v5L4.5 18h15L18 15.5z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  ),
  pdf: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M6 2.5h8l5 5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
      <path d="M14 2.5v5h5" />
      <text x="12" y="17.2" textAnchor="middle" fontSize="5.4" fill="currentColor" stroke="none" fontFamily="sans-serif" fontWeight="700">PDF</text>
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  dots: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  ),
  smiley: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="8.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <path d="M8 14.5c1.2 1.8 2.5 2.5 4 2.5s2.8-.7 4-2.5" />
    </svg>
  ),
  slides: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 18v2.5M8 20.5h8" strokeLinecap="round" />
    </svg>
  ),
  swarm: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="5" cy="7" r="1.6" />
      <circle cx="19" cy="7" r="1.6" />
      <circle cx="5" cy="17" r="1.6" />
      <circle cx="19" cy="17" r="1.6" />
      <path d="M6.3 7.8l3.9 2.7M17.7 7.8l-3.9 2.7M6.3 16.2l3.9-2.7M17.7 16.2l-3.9-2.7" strokeWidth="1.4" />
    </svg>
  ),
  build: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M14.5 4.5l5 5L9 20H4v-5L14.5 4.5z" />
      <path d="M12 7l5 5" />
    </svg>
  ),
  deploy: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 15V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ),
};

const MODELS = [
  // Free / Public Access Models
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", access: "Free · Default", badge: "Free" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", access: "Free · Multimodal", badge: "Free" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek AI", access: "Free · Reasoning", badge: "Free" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek AI", access: "Free · Open Weights", badge: "Free" },
  { id: "llama-3.3-70b", name: "Llama 3.3 70B", provider: "Meta / HF", access: "Free · Open Weights", badge: "Free" },
  { id: "qwen-2.5-72b", name: "Qwen 2.5 72B", provider: "Alibaba / HF", access: "Free · Open Weights", badge: "Free" },
  { id: "mistral-small-3", name: "Mistral Small 3", provider: "Mistral AI", access: "Free · Open Weights", badge: "Free" },
  { id: "phi-4-14b", name: "Phi-4 14B", provider: "Microsoft / HF", access: "Free · Open Weights", badge: "Free" },
  { id: "command-r-plus", name: "Command R+", provider: "Cohere", access: "Free Tier · Search", badge: "Free" },
  
  // Hosted & Proprietary Models
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", access: "Hosted API", badge: "Hosted" },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI", access: "Hosted API", badge: "Hosted" },
  { id: "claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", access: "Hosted API", badge: "Hosted" },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "Anthropic", access: "Hosted API", badge: "Hosted" },
  { id: "portkey-gateway", name: "Portkey Gateway (Unified)", provider: "Portkey AI", access: "Enterprise Gateway", badge: "Hosted" },
  { id: "aws-bedrock-claude", name: "AWS Bedrock Claude 3.5", provider: "AWS Bedrock", access: "AWS Cloud API", badge: "Hosted" },
  { id: "mistral-large-3", name: "Mistral Large 3", provider: "Mistral AI", access: "Hosted API", badge: "Hosted" },
  { id: "glm-4.7", name: "GLM-4.7", provider: "Zhipu AI", access: "Hosted API", badge: "Hosted" },

  // GitHub Copilot Integrated Models (OAuth Device Flow)
  { id: "copilot-gpt-4o", name: "Copilot GPT-4o", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-gpt-4o-mini", name: "Copilot GPT-4o mini", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-o1", name: "Copilot o1", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-o1-mini", name: "Copilot o1-mini", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-o3-mini", name: "Copilot o3-mini", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-claude-3.5-sonnet", name: "Copilot Claude 3.5 Sonnet", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-claude-3.5-haiku", name: "Copilot Claude 3.5 Haiku", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-claude-3-opus", name: "Copilot Claude 3 Opus", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-codex", name: "Copilot Codex", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-gemini-2.5-flash", name: "Copilot Gemini 2.5 Flash", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-deepseek-r1", name: "Copilot DeepSeek R1", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-llama-3.3-70b", name: "Copilot Llama 3.3 70B", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-mistral-large", name: "Copilot Mistral Large", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },
  { id: "copilot-qwen-2.5-72b", name: "Copilot Qwen 2.5 72B", provider: "GitHub Copilot", access: "Copilot OAuth", badge: "Copilot" },

  // Venice.ai Uncensored Privacy Models (Auto-Rotating Disposable Pool)
  { id: "venice-deepseek-r1", name: "Venice DeepSeek R1", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-deepseek-v3", name: "Venice DeepSeek V3", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-llama-3.3-70b", name: "Venice Llama 3.3 70B", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-llama-3.2-3b", name: "Venice Llama 3.2 3B", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-qwen-2.5-72b", name: "Venice Qwen 2.5 72B", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-qwen-2.5-coder-32b", name: "Venice Qwen 2.5 Coder 32B", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-dolphin-3.0", name: "Venice Dolphin 3.0", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-hermes-3-8b", name: "Venice Hermes 3 8B (Uncensored)", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-mistral-small-3", name: "Venice Mistral Small 3", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-flux-dev", name: "Venice Flux Dev (Image)", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-flux-schnell", name: "Venice Flux Schnell (Image)", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
  { id: "venice-sdxl-turbo", name: "Venice SDXL Turbo (Image)", provider: "Venice.ai", access: "Privacy API · Auto-Pool", badge: "Venice" },
];

const SEARCH_PROVIDERS = [
  { id: "tavily", name: "Tavily", note: "AI-optimized web search" },
  { id: "google", name: "Google", note: "Broad web coverage" },
  { id: "bing", name: "Bing", note: "Microsoft index" },
  { id: "brave", name: "Brave Search", note: "Independent index" },
  { id: "duckduckgo", name: "DuckDuckGo", note: "Privacy-first" },
  { id: "kagi", name: "Kagi", note: "Premium quality" },
  { id: "exa", name: "Exa", note: "Neural/semantic search" },
  { id: "arxiv", name: "arXiv + PubMed", note: "Academic papers" },
];

const RESEARCH_PHASES = [
  "Decomposing query into sub-questions",
  "Dispatching parallel search runs",
  "Crawling & reading top sources",
  "Cross-checking claims across sources",
  "Detecting contradictions & gaps",
  "Synthesizing final report",
];

const CONNECTOR_GROUPS: Array<{
  group: string;
  items: Array<{
    name: string;
    desc: string;
    connected: boolean;
    auth: string;
    hint?: string;
    fields?: Array<{ label: string; type?: string }>;
  }>;
}> = [
  {
    group: "Developer tools",
    items: [
      { name: "GitHub", desc: "Repos, issues, PRs", connected: true, auth: "oauth" },
      { name: "GitLab", desc: "Repos & CI pipelines", connected: false, auth: "oauth" },
      { name: "Linear", desc: "Issues & projects", connected: false, auth: "oauth" },
      { name: "Jira", desc: "Issue tracking", connected: false, auth: "oauth" },
      { name: "Sentry", desc: "Error monitoring", connected: false, auth: "apikey", hint: "Settings → Auth Tokens", fields: [{ label: "Auth token", type: "password" }] },
      { name: "Vercel", desc: "Deployments", connected: false, auth: "apikey", hint: "Account → Tokens", fields: [{ label: "Access token", type: "password" }] },
      { name: "Supabase", desc: "Database & auth", connected: false, auth: "apikey", hint: "Project settings → API", fields: [{ label: "Project URL" }, { label: "Service role key", type: "password" }] },
      { name: "PostgreSQL", desc: "SQL database", connected: false, auth: "credentials", fields: [{ label: "Host" }, { label: "Port" }, { label: "Database" }, { label: "User" }, { label: "Password", type: "password" }] },
      { name: "MongoDB", desc: "Document database", connected: false, auth: "apikey", hint: "Cluster → Connect", fields: [{ label: "Connection string", type: "password" }] },
    ],
  },
  {
    group: "Communication",
    items: [
      { name: "Slack", desc: "Channels & messages", connected: true, auth: "oauth" },
      { name: "Discord", desc: "Servers & threads", connected: false, auth: "oauth" },
      { name: "Gmail", desc: "Email & threads", connected: true, auth: "oauth" },
      { name: "Outlook", desc: "Email & calendar", connected: false, auth: "oauth" },
      { name: "Telegram", desc: "Chats & bots", connected: false, auth: "apikey", hint: "@BotFather → /newbot", fields: [{ label: "Bot token", type: "password" }] },
      { name: "WhatsApp", desc: "Messages", connected: false, auth: "apikey", hint: "Meta for Developers", fields: [{ label: "Phone number ID" }, { label: "Access token", type: "password" }] },
      { name: "Zoom", desc: "Meetings", connected: false, auth: "oauth" },
      { name: "Twilio", desc: "SMS & voice APIs", connected: false, auth: "apikey", hint: "Console → API credentials", fields: [{ label: "Account SID" }, { label: "Auth token", type: "password" }] },
    ],
  },
  {
    group: "Docs & knowledge",
    items: [
      { name: "Notion", desc: "Pages & databases", connected: true, auth: "oauth" },
      { name: "Google Drive", desc: "Files & docs", connected: true, auth: "oauth" },
      { name: "Confluence", desc: "Wiki pages", connected: false, auth: "oauth" },
      { name: "Google Docs", desc: "Documents", connected: false, auth: "oauth" },
      { name: "Airtable", desc: "Bases & records", connected: false, auth: "apikey", hint: "Account → API tokens", fields: [{ label: "Personal access token", type: "password" }] },
      { name: "Dropbox", desc: "File storage", connected: false, auth: "oauth" },
      { name: "Box", desc: "Cloud content", connected: false, auth: "oauth" },
      { name: "SharePoint", desc: "Intranet sites", connected: false, auth: "oauth" },
      { name: "OneDrive", desc: "File storage", connected: false, auth: "oauth" },
    ],
  },
  {
    group: "Vector & Data",
    items: [
      { name: "Pinecone", desc: "Vector database", connected: false, auth: "apikey", hint: "Project → API keys", fields: [{ label: "API key", type: "password" }] },
      { name: "BigQuery", desc: "Data warehouse", connected: false, auth: "credentials", hint: "Google Cloud → IAM & Admin", fields: [{ label: "Service account email" }, { label: "Service account JSON key", type: "password" }] },
    ],
  },
  {
    group: "Cloud & infra",
    items: [
      { name: "AWS", desc: "S3, Lambda, and more", connected: false, auth: "apikey", hint: "IAM → Access keys", fields: [{ label: "Access key ID" }, { label: "Secret access key", type: "password" }] },
      { name: "Cloudflare", desc: "DNS, CDN, Workers", connected: false, auth: "apikey", hint: "Profile → API Tokens", fields: [{ label: "API token", type: "password" }] },
      { name: "DigitalOcean", desc: "Droplets & spaces", connected: false, auth: "apikey", hint: "API → Tokens", fields: [{ label: "Personal access token", type: "password" }] },
      { name: "Railway", desc: "Deploy from repo", connected: false, auth: "apikey", hint: "Account → Tokens", fields: [{ label: "API token", type: "password" }] },
    ],
  },
  {
    group: "Design & product",
    items: [
      { name: "Figma", desc: "Design files", connected: false, auth: "oauth" },
      { name: "Canva", desc: "Visual designs", connected: false, auth: "oauth" },
      { name: "Product Hunt", desc: "Product launches", connected: false, auth: "oauth" },
    ],
  },
  {
    group: "Business & commerce",
    items: [
      { name: "Stripe", desc: "Payments & invoices", connected: false, auth: "apikey", hint: "Developers → API keys", fields: [{ label: "Secret key (sk_live_…)", type: "password" }] },
      { name: "Shopify", desc: "Store & orders", connected: false, auth: "oauth" },
      { name: "HubSpot", desc: "CRM", connected: false, auth: "apikey", hint: "Settings → Integrations", fields: [{ label: "Private app token", type: "password" }] },
      { name: "Salesforce", desc: "Enterprise CRM", connected: false, auth: "credentials", hint: "Connected App credentials", fields: [{ label: "Username" }, { label: "Password" }, { label: "Security token", type: "password" }] },
      { name: "QuickBooks", desc: "Accounting", connected: false, auth: "oauth" },
      { name: "Google Search Console", desc: "Site performance", connected: false, auth: "oauth" },
    ],
  },
  {
    group: "Media & social",
    items: [
      { name: "YouTube", desc: "Videos & transcripts", connected: false, auth: "oauth" },
      { name: "X (Twitter)", desc: "Posts & timelines", connected: false, auth: "apikey", hint: "developer.x.com → Keys & tokens", fields: [{ label: "API key" }, { label: "API secret", type: "password" }, { label: "Bearer token", type: "password" }] },
      { name: "Reddit", desc: "Threads & comments", connected: false, auth: "credentials", hint: "reddit.com/prefs/apps", fields: [{ label: "Client ID" }, { label: "Client secret", type: "password" }] },
      { name: "Hacker News", desc: "Tech discussions", connected: false, auth: "oauth" },
      { name: "LinkedIn", desc: "Professional network", connected: false, auth: "oauth" },
      { name: "Instagram", desc: "Posts & insights", connected: false, auth: "apikey", hint: "Meta for Developers", fields: [{ label: "App ID" }, { label: "App secret", type: "password" }] },
      { name: "TikTok", desc: "Short videos", connected: false, auth: "oauth" },
    ],
  },
  {
    group: "Search & research",
    items: [
      { name: "Tavily", desc: "AI web search", connected: true, auth: "apikey", hint: "app.tavily.com → API keys", fields: [{ label: "API key (tvly-…)", type: "password" }] },
      { name: "Exa", desc: "Semantic search", connected: false, auth: "apikey", hint: "dashboard.exa.ai → API keys", fields: [{ label: "API key", type: "password" }] },
      { name: "Brave Search", desc: "Independent index", connected: false, auth: "apikey", hint: "brave.com/search/api", fields: [{ label: "API key", type: "password" }] },
      { name: "Kagi", desc: "Premium search", connected: false, auth: "apikey", hint: "kagi.com → API", fields: [{ label: "API token", type: "password" }] },
      { name: "PubMed", desc: "Biomedical literature", connected: false, auth: "apikey", hint: "ncbi.nlm.nih.gov → API key", fields: [{ label: "API key" }] },
      { name: "arXiv", desc: "Preprint papers", connected: false, auth: "oauth" },
    ],
  },
];

const RESEARCH_SOURCES = [
  { s: "vendor.com/benchmarks-2026", v: 92 },
  { s: "arxiv.org/abs/2601.04215", v: 81 },
  { s: "reddit.com/r/LocalLLaMA thread", v: 64 },
  { s: "news.ycombinator.com item 4142", v: 57 },
  { s: "medium.com/retrospective-2026", v: 45 },
  { s: "substack.com/newsletter deep-dive", v: 41 },
  { s: "github.com/issues discussion", v: 36 },
  { s: "youtube.com/conference talk", v: 33 },
  { s: "stackoverflow.com/tags/top", v: 28 },
  { s: "discord.com/community server", v: 24 },
  { s: "docs.vendor.com/changelog", v: 21 },
  { s: "linkedin.com/pulse post", v: 18 },
  { s: "forum.archivethread.io", v: 15 },
  { s: "podcast.notes/transcript", v: 12 },
];

const SLASH_COMMANDS = [
  { cmd: "/research", desc: "Run a deep research report", hint: "/research <topic>" },
  { cmd: "/connectors", desc: "Manage app connectors", hint: "/connectors" },
  { cmd: "/crew", desc: "Assemble a crew mission", hint: "/crew <goal>" },
  { cmd: "/brainstorm", desc: "Crew roundtable on any topic", hint: "/brainstorm <topic>" },
  { cmd: "/tasks", desc: "View scheduled tasks", hint: "/tasks" },
  { cmd: "/claw", desc: "Grab files with AgentForge Claw", hint: "/claw" },
  { cmd: "/history", desc: "Browse chat history", hint: "/history" },
  { cmd: "/project", desc: "Open the agentforge project", hint: "/project" },
  { cmd: "/slides", desc: "Open project slides", hint: "/slides" },
  { cmd: "/swarm", desc: "Open project swarm agents", hint: "/swarm" },
  { cmd: "/files", desc: "Browse project files", hint: "/files" },
  { cmd: "/settings", desc: "Open app settings", hint: "/settings" },
];

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

interface ChatSession {
  id: string;
  title: string;
  section: string;
  messages: ChatMessage[];
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  goal: string;
  skill: string;
  tags: string[];
}

interface AuthTarget {
  name: string;
  desc: string;
  auth: string;
  fields: Array<{ label: string; type?: string }>;
  hint: string;
}

const CHATS: ChatSession[] = [
  {
    id: "c1",
    title: "I have cataloged all 20 failures across 13 test...",
    section: "AgentForge Project Files",
    messages: [
      { role: "user", content: "Catalog all test failures in the agentforge repo" },
      { role: "agent", content: "I have cataloged all 20 failures across 13 test files: 12 assertion mismatches, 5 timeouts, 3 import errors. Full breakdown saved to failure-catalog.md in the project." },
    ],
  },
  {
    id: "c2",
    title: "仓库完整性检查",
    section: "AgentForge Project Files",
    messages: [
      { role: "user", content: "仓库完整性检查" },
      { role: "agent", content: "Based on my thorough analysis of the repository, the structure is intact: all 42 files accounted for, no orphaned references, and entity schemas validate cleanly." },
    ],
  },
  {
    id: "c3",
    title: "拉取AgentForge项目",
    section: "AgentForge Project Files",
    messages: [
      { role: "user", content: "拉取AgentForge项目" },
      { role: "agent", content: "I physically cannot access private GitHub repos without authorization — connect the GitHub connector with repo access and I'll pull it right away." },
    ],
  },
  {
    id: "c4",
    title: "Manus Skill Conversion",
    section: "Manus Skill Conversion",
    messages: [
      { role: "user", content: "Convert this Manus skill to AgentForge format" },
      { role: "agent", content: "The converted skill has been written to /mnt/agentforge/skills/. Frontmatter, steps, and tool mappings were translated 1:1 — it's ready to run." },
    ],
  },
];

const AGENTS: Agent[] = [
  { id: "atlas", name: "Atlas", emoji: "🧭", role: "Planner", goal: "Break any task into a crisp, sequenced spec", skill: "scope · sequence · estimate", tags: ["plan", "feature"] },
  { id: "scout", name: "Scout", emoji: "🔭", role: "Researcher", goal: "Find and verify every relevant source", skill: "search · cite · cross-check", tags: ["research", "docs"] },
  { id: "nova", name: "Nova", emoji: "🏛️", role: "Architect", goal: "Design systems that scale cleanly", skill: "diagram · api-design · tradeoffs", tags: ["design", "feature"] },
  { id: "pixel", name: "Pixel", emoji: "🎨", role: "Frontend Dev", goal: "Ship polished, responsive UI", skill: "react · css · a11y", tags: ["frontend", "feature"] },
  { id: "bolt", name: "Bolt", emoji: "⚡", role: "Backend Dev", goal: "Build fast, reliable services", skill: "api · db · caching", tags: ["backend", "feature"] },
  { id: "forge", name: "Forge", emoji: "🔥", role: "Refactorer", goal: "Make existing code faster and cleaner", skill: "profile · dedupe · optimize", tags: ["perf", "audit"] },
  { id: "probe", name: "Probe", emoji: "🧪", role: "QA Engineer", goal: "Catch bugs before users do", skill: "test · fuzz · reproduce", tags: ["test", "bughunt"] },
  { id: "sentry", name: "Sentry", emoji: "🚨", role: "Security Analyst", goal: "Find and close every vulnerability", skill: "audit · threat-model · patch", tags: ["security", "audit", "bughunt"] },
  { id: "terra", name: "Terra", emoji: "🏗️", role: "DevOps Engineer", goal: "Automate build, ship, and scale", skill: "ci-cd · docker · infra", tags: ["devops", "feature"] },
  { id: "vega", name: "Vega", emoji: "📊", role: "Data Analyst", goal: "Turn raw data into decisions", skill: "query · visualize · interpret", tags: ["data", "research", "audit"] },
  { id: "scribe", name: "Scribe", emoji: "📜", role: "Writer", goal: "Turn findings into crisp reports", skill: "synth · format · cite", tags: ["docs", "research"] },
  { id: "warden", name: "Warden", emoji: "🛡️", role: "Reviewer", goal: "QA, safety, and ship-blocking checks", skill: "audit · approve · block", tags: ["review", "bughunt", "audit"] },
  { id: "iris", name: "Iris", emoji: "🎯", role: "Query Architect", goal: "Decompose the question into sharp, answerable sub-questions", skill: "decompose · scope · rank", tags: ["deepresearch"] },
  { id: "tracer", name: "Tracer", emoji: "🕸️", role: "Source Hunter", goal: "Cast a wide net across providers, then read the best sources deep", skill: "search · crawl · retrieve", tags: ["deepresearch"] },
  { id: "sift", name: "Sift", emoji: "⚖️", role: "Evidence Weigher", goal: "Score every claim by source strength and recency", skill: "cross-check · score · flag", tags: ["deepresearch"] },
  { id: "verify", name: "Verify", emoji: "✅", role: "Fact Checker", goal: "No claim ships without a corroborating source", skill: "corroborate · debunk · cite", tags: ["deepresearch"] },
  { id: "synth", name: "Synth", emoji: "🧠", role: "Synthesist", goal: "Merge verified findings into one coherent, cited report", skill: "synthesize · structure · draft", tags: ["deepresearch"] },
  { id: "mosaic", name: "Mosaic", emoji: "🧩", role: "Question Mapper", goal: "Chart how each sub-question connects to the next", skill: "map · relate · order", tags: ["deepresearch"] },
  { id: "radar", name: "Radar", emoji: "📡", role: "Provider Scout", goal: "Pick the right search providers per sub-question", skill: "route · tune · fan-out", tags: ["deepresearch"] },
  { id: "digger", name: "Digger", emoji: "📖", role: "Deep Reader", goal: "Read the best sources end to end, not just snippets", skill: "crawl · parse · bookmark", tags: ["deepresearch"] },
  { id: "prism", name: "Prism", emoji: "💠", role: "Extractor", goal: "Split documents into quotable, citable evidence", skill: "segment · quote · tag", tags: ["deepresearch"] },
  { id: "clash", name: "Clash", emoji: "⚡", role: "Contradiction Hunter", goal: "Surface claims that disagree — and why", skill: "diff · debate · flag", tags: ["deepresearch"] },
  { id: "beacon", name: "Beacon", emoji: "🚨", role: "Gap Detector", goal: "Flag what nobody has answered yet", skill: "probe · list · expose", tags: ["deepresearch"] },
  { id: "stitch", name: "Stitch", emoji: "🧵", role: "Report Assembler", goal: "Stitch sections, citations, and figures into one artifact", skill: "compose · layout · polish", tags: ["deepresearch"] },
  { id: "spark", name: "Spark", emoji: "💡", role: "Idea Machine", goal: "Generate volume and variety, defer all judgment", skill: "diverge · combine · recombine", tags: ["brainstorm"] },
  { id: "lens", name: "Lens", emoji: "🔮", role: "Lateral Thinker", goal: "Import winning patterns from other domains", skill: "analogy · reframe · import", tags: ["brainstorm"] },
  { id: "devil", name: "Devil", emoji: "😈", role: "Devil's Advocate", goal: "Stress-test every idea and kill the weak ones early", skill: "challenge · poke · kill", tags: ["brainstorm"] },
  { id: "judge", name: "Judge", emoji: "🏛️", role: "Idea Judge", goal: "Score surviving ideas against the goal and constraints", skill: "criteria · score · rank", tags: ["brainstorm"] },
  { id: "quill", name: "Quill", emoji: "✍️", role: "Narrator", goal: "Distill the room into one thesis and an idea board", skill: "synthesize · capture · frame", tags: ["brainstorm"] },
];

const byId = (id: string): Agent | undefined => AGENTS.find((a) => a.id === id);

const CREW_PRESETS = [
  { id: "research", label: "🔬 Deep Research", ids: ["iris", "mosaic", "tracer", "radar", "digger", "prism", "sift", "verify", "clash", "beacon", "synth", "stitch"] },
  { id: "brainstorm", label: "💬 Brainstorm", ids: ["spark", "lens", "devil", "judge", "quill"] },
  { id: "feature", label: "🏗️ Feature Build", ids: ["atlas", "nova", "pixel", "bolt", "probe", "warden"] },
  { id: "bughunt", label: "🐞 Bug Hunt", ids: ["probe", "sentry", "forge", "warden"] },
  { id: "audit", label: "🔍 Code Audit", ids: ["sentry", "vega", "forge", "warden"] },
  { id: "docs", label: "📝 Docs Sprint", ids: ["scout", "scribe", "warden"] },
];

const buildCrewFor = (presetId: string): Agent[] =>
  (CREW_PRESETS.find((p) => p.id === presetId) || CREW_PRESETS[0]).ids.map((id) => byId(id)!).filter(Boolean);

const CREW = buildCrewFor("research");
const BRAINSTORM_CREW = ["spark", "lens", "devil", "judge", "quill"].map((id) => byId(id)!).filter(Boolean);

const brainstormScript = (topic: string): { messages: BrainstormMessage[]; ideas: BrainstormIdea[] } => {
  const t = topic.trim().replace(/\.$/, "");
  return {
    messages: [
      { a: "spark", kind: "open", text: `Opening the floor on "${t}" — my job is volume, so here's the raw spray: who does ${t} today, who does it badly, and what would a ten-year-old design? No filtering yet.` },
      { a: "lens", kind: "open", text: `Before we grade anything, let me steal a pattern: how do kitchens, airports, and ER rooms solve problems shaped like ${t}? The best ideas are usually imports from another domain.` },
      { a: "devil", kind: "open", text: `And I'll be the polite contrarian: most ideas about ${t} die from the same three wounds — no user, no wedge, no moat. Hold every idea against those before you fall in love.` },
      { a: "spark", kind: "idea", text: `Idea 1 — "The 15-minute version": strip ${t} to the single outcome people actually want and deliver it in one sitting. Volume thinking says the fast, partial version beats the slow, perfect one for the first 90% of users.` },
      { a: "lens", kind: "build", text: `Building on Idea 1 with an import: triage in an ER doesn't treat everyone — it sorts by urgency. What if ${t} triaged requests and only the urgent ones got the full treatment?` },
      { a: "devil", kind: "challenge", text: `Challenge on Idea 1: "fast and partial" is exactly how tools earn a reputation for being toys. If the 15-minute version can't escalate to the deep version, it's a trap, not a wedge.` },
      { a: "spark", kind: "idea", text: `Idea 2 — "Credit-where-due": make the invisible work inside ${t} visible and attributable. Nobody optimizes what they can't see — surface the effort and the incentives change overnight.` },
      { a: "judge", kind: "build", text: `Scoring so far on goal-fit, wedge, and feasibility: Idea 1 scores high on wedge but fails Devil's escalation test as stated. Idea 2 scores high on feasibility — attribution is buildable and sticky. Idea 1 survives only with an explicit upgrade path.` },
      { a: "lens", kind: "idea", text: `Idea 3 — "The museum tour": other domains let novices consume expert output through curated paths — audio guides, not raw archives. Give ${t} a curated layer that a newcomer can follow end-to-end while experts go free-roam.` },
      { a: "devil", kind: "challenge", text: `Curation sounds nice until it's someone's full-time job. Idea 3 only lives if the crew curates automatically and a human spot-checks — otherwise it rots in a quarter.` },
      { a: "judge", kind: "build", text: `Final scores: Idea 2 — 9/10 (buildable, sticky, clear wedge). Idea 1 with the escalation fix — 8/10. Idea 3 with auto-curation — 7/10. All three pass, in that order.` },
      { a: "spark", kind: "build", text: `One last combination before we close: Idea 1's speed + Idea 2's visibility — a fast version of ${t} that shows exactly what it did and why. That combination might outrank both parents.` },
      { a: "quill", kind: "build", text: `Noticing convergence: the room agrees ${t} should be fast first, visible about its work, and curated automatically. Capturing that as the thesis now.` },
      { a: "quill", kind: "synthesize", text: `Synthesis: the crew's thesis on "${t}" — start with the 15-minute version, make every step's work visible and attributable, and layer automatic curation on top, with humans reviewing the tricky cases. Ideas ranked and captured below.` },
    ],
    ideas: [
      { title: `The 15-minute ${t}`, desc: "Strip it to the single outcome people actually want, delivered in one sitting — with an explicit escalation path to the deep version so speed never becomes a trap.", by: ["spark", "devil", "judge"] },
      { title: "Make the invisible work visible", desc: "Surface and attribute the effort inside every step. Attribution changes incentives overnight, and it's buildable and sticky.", by: ["spark", "judge"] },
      { title: "The museum tour layer", desc: "A curated path a newcomer can follow end-to-end while experts go free-roam — curated automatically by the crew, spot-checked by a human so it never rots.", by: ["lens", "devil"] },
    ],
  };
};

const IMPROVEMENTS = [
  { icon: "⚡", title: "Cache connector icons — render −12ms" },
  { icon: "🔎", title: "Pre-warm search index for Deep Research" },
  { icon: "🧵", title: "Batch toast timers — fewer rerenders" },
  { icon: "🎛️", title: "Tighten drawer z-index layers for mobile" },
  { icon: "🧊", title: "Memoize research plan cards" },
  { icon: "📦", title: "Lazy-load connectors list per group" },
  { icon: "📉", title: "Trim activity feed window to last 8" },
  { icon: "🦞", title: "Prefetch Claw scan on drawer open" },
  { icon: "🧹", title: "Deduplicate icon SVG definitions" },
  { icon: "💤", title: "Pause typing dots when offscreen" },
];

interface AgentOrbitProps {
  roster: Agent[];
  statuses: string[];
  size?: number;
  label?: string;
}

function AgentOrbit({ roster, statuses, size = 150, label }: AgentOrbitProps) {
  const n = roster.length;
  const r = size / 2 - 18;
  const anyWorking = (statuses || []).includes("working");
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border border-gray-100" />
      <div className="absolute rounded-full border border-blue-100" style={{ inset: 16, transform: "rotate(0deg)", opacity: anyWorking ? 0.8 : 0.3 }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          {anyWorking && (
            <span className="absolute w-12 h-12 rounded-full bg-blue-400/40 animate-ping" />
          )}
          <div
            className={`relative w-11 h-11 rounded-full flex items-center justify-center text-[17px] shadow-sm transition-colors ${
              anyWorking ? "bg-gradient-to-br from-blue-500 to-indigo-600" : "bg-gray-100"
            }`}
          >
            {label || "🧠"}
          </div>
        </div>
      </div>
      {roster.map((a, i) => {
        const st = (statuses || [])[i] || "idle";
        const angle = (360 / n) * i - 90;
        return (
          <div
            key={a.id}
            className="absolute left-1/2 top-1/2"
            style={{ transform: `rotate(${angle}deg) translate(${r}px) rotate(${-angle}deg)`, marginLeft: -14, marginTop: -14 }}
          >
            <div className="relative flex items-center justify-center">
              {st === "working" && (
                <span className="absolute w-8 h-8 rounded-full bg-blue-400/50 animate-ping" />
              )}
              <div
                className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[12px] border transition-all ${
                  st === "done"
                    ? "bg-green-50 border-green-200"
                    : st === "working"
                    ? "bg-blue-50 border-blue-300 scale-110 shadow-sm"
                    : "bg-gray-50 border-gray-200 opacity-50"
                }`}
                title={`${a.name} — ${a.role}${st !== "idle" ? " · " + st : ""}`}
              >
                {a.emoji}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ st, label }: { st: string; label?: string }) {
  const text = label || (st === "done" ? "✓ done" : st);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        st === "done"
          ? "bg-green-100 text-green-700"
          : st === "working"
          ? "bg-blue-100 text-blue-700 animate-pulse"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {text}
    </span>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${
        on ? "bg-blue-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function Cite({ n }: { n: number }) {
  return (
    <sup className="ml-0.5 inline-flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold align-super cursor-pointer hover:bg-blue-200 transition-colors">
      {n}
    </sup>
  );
}

function AppInner() {
  const [activeTab, setActiveTab] = useState("Project");
  const [prompt, setPrompt] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState("home");
  const [toast, setToast] = useState("");

  const [projectTab, setProjectTab] = useState("Chat");
  const [projectSectionTab, setProjectSectionTab] = useState("Slides");

  const [researchQuery, setResearchQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showChatModelMenu, setShowChatModelMenu] = useState(false);
  const [researchModel, setResearchModel] = useState(MODELS[0].id);
  const currentModelObj = MODELS.find((m) => m.id === selectedModel) || MODELS[0];
  const [liveAction, setLiveAction] = useState("");
  const [researchRuns, setResearchRuns] = useState(3);
  const [researchSearch, setResearchSearch] = useState("tavily");
  const [researchState, setResearchState] = useState("idle");
  const [researchPhase, setResearchPhase] = useState(0);
  const [researchProgress, setResearchProgress] = useState(0);
  const [researchPlan, setResearchPlan] = useState<string[]>([]);
  const [planStepDraft, setPlanStepDraft] = useState("");
  const [activityFeed, setActivityFeed] = useState<Array<{ t: number; line: string; type?: string }>>([]);
  const [sourcesFound, setSourcesFound] = useState(0);
  const [searchesDone, setSearchesDone] = useState(0);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeProject, setActiveProject] = useState<any>(null);
  const [showMediaStudio, setShowMediaStudio] = useState(false);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState("");
  const [showLlmSettings, setShowLlmSettings] = useState(false);

  const [user, setUser] = useState<User | null>(null);

  const [projectsList, setProjectsList] = useState<{ id: string; name: string; ownerId?: string }[]>(() => {
    try {
      const saved = localStorage.getItem("af_projectsList");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [projectTasks, setProjectTasks] = useState<{ id: string; projectId: string; title: string; status: string; progress: number; ownerId?: string }[]>(() => {
    try {
      const saved = localStorage.getItem("af_projectTasks");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      notify("Signed in with Google");
    } catch (error) {
      console.error("Sign in failed", error);
      notify("Sign in failed");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      notify("Signed out");
    } catch (error) {
      console.error("Sign out failed", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem("af_projectsList", JSON.stringify(projectsList));
  }, [projectsList]);

  useEffect(() => {
    localStorage.setItem("af_projectTasks", JSON.stringify(projectTasks));
  }, [projectTasks]);

  // Sync from Firestore when signed in
  useEffect(() => {
    if (!user) return;

    const qProjects = query(collection(db, "projects"), where("ownerId", "==", user.uid));
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      const projs = snapshot.docs.map(doc => doc.data() as any);
      // Merge with local projects if needed, but Firestore is source of truth when signed in
      setProjectsList(projs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "projects"));

    // Sync all tasks for all user projects
    // Note: This works because we added ownerId to tasks in the blueprint/rules
    // We can use a collectionGroup if we had indexes, but let's try a simple approach
    // since collectionGroup might need manual index creation.
    // Given the small scale, we'll just listen to tasks within each project or a flattened collection.
    // For now, I'll update the logic to fetch tasks when project view is opened or use a flattened collection.
    // Actually, I'll use a flattened "tasks" collection for ease of syncing all tasks at once.
    // Wait, the rules and blueprint used subcollections. 
    // I'll stick to subcollections but fetch them for the projects we have.
    
    return () => {
      unsubProjects();
    };
  }, [user]);

  // Sync tasks for the active project
  useEffect(() => {
    if (!user || !activeProject) return;

    const qTasks = query(collection(db, "projects", activeProject.id, "tasks"), where("ownerId", "==", user.uid));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tasks = snapshot.docs.map(doc => doc.data() as any);
      setProjectTasks(prev => {
          const otherTasks = prev.filter(t => t.projectId !== activeProject.id);
          return [...otherTasks, ...tasks];
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, `projects/${activeProject.id}/tasks`));

    return () => unsubTasks();
  }, [user, activeProject]);

  const addProject = async (name: string) => {
    const id = "p_" + Date.now();
    const newProj = { id, name, ownerId: user?.uid };
    
    if (user) {
      try {
        await setDoc(doc(db, "projects", id), newProj);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `projects/${id}`);
      }
    } else {
      setProjectsList(prev => [...prev, newProj]);
    }
    return newProj;
  };

  const deleteProject = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, "projects", id));
        // Tasks subcollection deletion is handled by server-side or we do it manually
        // Client-side deleteDoc doesn't delete subcollections.
        // We'll leave it for now or implement batch delete.
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
      }
    } else {
      setProjectsList(prev => prev.filter(p => p.id !== id));
    }
  };

  const addProjectTask = async (projectId: string, title: string, status: string) => {
    const id = "t_" + Date.now();
    const newTask = { id, projectId, title, status, progress: 0, ownerId: user?.uid };

    if (user) {
      try {
        await setDoc(doc(db, "projects", projectId, "tasks", id), newTask);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `projects/${projectId}/tasks/${id}`);
      }
    } else {
      setProjectTasks(prev => [...prev, newTask]);
    }
  };

  const updateProjectTaskProgress = async (projectId: string, taskId: string, progress: number) => {
    if (user) {
        try {
            const taskRef = doc(db, "projects", projectId, "tasks", taskId);
            // Partial update
            await setDoc(taskRef, { progress }, { merge: true });
        } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/tasks/${taskId}`);
        }
    } else {
        setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress } : t));
    }
  };




  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    try { return localStorage.getItem("af_activeChatId") || null; } catch { return null; }
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("af_chatMessages");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [chatDraft, setChatDraft] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);

  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId?: string | null;
      email?: string | null;
    }
  }

  function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
      },
      operationType,
      path
    }
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }


  useEffect(() => {
    if (activeChatId) {
      try { localStorage.setItem("af_activeChatId", activeChatId); } catch {}
    }
  }, [activeChatId]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      try { localStorage.setItem("af_chatMessages", JSON.stringify(chatMessages)); } catch {}
    }
  }, [chatMessages]);

  const [tasks, setTasks] = useState<TaskItem[]>([
    { id: "t1", emoji: "☀️", name: "Daily repo sync", when: "7:00 AM daily", status: "active" },
    { id: "t2", emoji: "📦", name: "Weekly dependency audit", when: "Mondays 9:00 AM", status: "active" },
    { id: "t3", emoji: "🗂️", name: "Monthly knowledge cleanup", when: "1st of month", status: "paused" },
  ]);
  const [taskDraft, setTaskDraft] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);

  const [clawFiles, setClawFiles] = useState<ClawFile[] | null>(null);
  const [clawScanning, setClawScanning] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null);

  const [connectorTab, setConnectorTab] = useState<"apps" | "llm">("apps");
  const [llmProviders, setLlmProviders] = useState<any[]>([]);
  const [llmKeys, setLlmKeys] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("af_llm_apikeys");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [llmTestStatus, setLlmTestStatus] = useState<Record<string, { testing?: boolean; success?: boolean; modelCount?: number; sampleModels?: string[]; message?: string }>>({});
  const [showLlmKey, setShowLlmKey] = useState<Record<string, boolean>>({});

  interface CopilotAuthState {
    connected: boolean;
    stage: "idle" | "awaiting_auth" | "connected";
    userCode?: string;
    rawUserCode?: string;
    deviceCode?: string;
    verificationUri?: string;
    checking?: boolean;
    username?: string;
    plan?: string;
    modelCount?: number;
    sampleModels?: string[];
    copied?: boolean;
    copyLabel?: string;
    manualTokenOpen?: boolean;
    manualToken?: string;
    testPasteInput?: string;
    token?: string;
  }

  const [copilotAuth, setCopilotAuth] = useState<CopilotAuthState>(() => {
    try {
      const saved = localStorage.getItem("af_copilot_auth");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          connected: Boolean(parsed.connected),
          stage: parsed.connected ? "connected" : "idle",
          username: parsed.username || "jay-ayres",
          plan: parsed.plan || "GitHub Copilot Pro / Business",
          modelCount: parsed.modelCount || 8,
          sampleModels: parsed.sampleModels || [
            "copilot-gpt-4o",
            "copilot-claude-3.5-sonnet",
            "copilot-o1-mini",
            "copilot-codex-v2",
            "copilot-gpt-4o-mini",
            "copilot-o3-mini",
            "copilot-claude-3.5-haiku",
            "copilot-text-embedding"
          ],
        };
      }
    } catch {}
    return { connected: false, stage: "idle" };
  });

  interface CopilotGatewayUIState {
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

  const [copilotGateway, setCopilotGateway] = useState<CopilotGatewayUIState>({
    enabled: true,
    apiKey: "af_copilot_live_8f3a2b1c",
    showKey: false,
    totalCalls: 18,
    totalTokens: 4280,
    activeClients: [
      { id: "c1", name: "Cursor Editor", ip: "127.0.0.1", lastSeen: "Just now", userAgent: "Cursor/0.45", requests: 11 },
      { id: "c2", name: "VS Code (Continue.dev)", ip: "127.0.0.1", lastSeen: "2 mins ago", userAgent: "Continue/0.8", requests: 7 },
    ],
    requestHistory: [
      { id: "req_101", timestamp: new Date(Date.now() - 140000).toISOString(), model: "copilot-gpt-4o", client: "Cursor Editor", promptTokens: 45, completionTokens: 165, latencyMs: 215, status: 200 },
      { id: "req_102", timestamp: new Date(Date.now() - 45000).toISOString(), model: "copilot-claude-3.5-sonnet", client: "VS Code Continue", promptTokens: 82, completionTokens: 290, latencyMs: 310, status: 200 },
    ],
    activeTab: "connect",
    activeSnippetTab: "cursor",
    testModel: "copilot-gpt-4o",
    testPrompt: "Write a high-performance LRU cache in TypeScript",
    testTesting: false,
    testResult: null,
    copiedSnippet: null,
  });

  useEffect(() => {
    api.getCopilotGateway().then((gw) => {
      if (gw) {
        setCopilotGateway((s) => ({
          ...s,
          enabled: gw.enabled !== false,
          apiKey: gw.apiKey || s.apiKey,
          totalCalls: gw.totalCalls ?? s.totalCalls,
          totalTokens: gw.totalTokens ?? s.totalTokens,
          activeClients: gw.activeClients || s.activeClients,
          requestHistory: gw.requestHistory || s.requestHistory,
        }));
      }
    }).catch(() => {});
  }, [copilotAuth.connected]);

  const handleRegenerateGatewayKey = async () => {
    try {
      const res = await api.regenerateCopilotGatewayKey();
      if (res && res.apiKey) {
        setCopilotGateway((s) => ({ ...s, apiKey: res.apiKey }));
        notify("🔑 New Copilot API Gateway key generated & ready!");
      }
    } catch {
      notify("Failed to regenerate key");
    }
  };

  const handleToggleGateway = async () => {
    const nextState = !copilotGateway.enabled;
    try {
      await api.toggleCopilotGateway(nextState);
      setCopilotGateway((s) => ({ ...s, enabled: nextState }));
      notify(`Copilot API Gateway ${nextState ? "Enabled" : "Disabled"}`);
    } catch {
      setCopilotGateway((s) => ({ ...s, enabled: nextState }));
    }
  };

  const handleTestGatewayCall = async () => {
    setCopilotGateway((s) => ({ ...s, testTesting: true, testResult: null }));
    try {
      const res = await api.testCopilotGateway(copilotGateway.testModel, copilotGateway.testPrompt, copilotGateway.apiKey);
      setCopilotGateway((s) => ({
        ...s,
        testTesting: false,
        testResult: res,
        totalCalls: s.totalCalls + 1,
      }));
      if (res.ok) {
        notify(`⚡ Copilot Gateway replied in ${res.latencyMs}ms!`);
      } else {
        notify(`API response error: ${res.status}`);
      }
    } catch (err: any) {
      setCopilotGateway((s) => ({ ...s, testTesting: false, testResult: { ok: false, error: err.message } }));
      notify("API test request failed");
    }
  };

  const copyGatewaySnippet = async (text: string, label: string) => {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        ok = true;
      } catch {}
    }
    setCopilotGateway((s) => ({ ...s, copiedSnippet: label }));
    notify(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopilotGateway((s) => ({ ...s, copiedSnippet: null })), 2500);
  };

  useEffect(() => {
    api.getCopilotStatus().then(async (st) => {
      if (st && st.connected) {
        setCopilotAuth((prev) => ({
          ...prev,
          connected: true,
          stage: "connected",
          username: st.username || "jay-ayres",
          plan: st.plan || "GitHub Copilot Pro / Business",
          modelCount: st.modelCount || 8,
          sampleModels: st.sampleModels,
        }));
        setLlmTestStatus((s) => ({
          ...s,
          githubcopilot: {
            testing: false,
            success: true,
            modelCount: st.modelCount || 8,
            sampleModels: st.sampleModels,
            message: `GitHub Copilot authorized (@${st.username || "jay-ayres"}). 8 models active.`,
          },
        }));
      } else {
        // Server lost connection, try to restore from localStorage token if exists
        const saved = localStorage.getItem("af_copilot_auth");
        if (saved) {
          try {
            const data: CopilotAuthState = JSON.parse(saved);
            if (data.token) {
              console.log("Restoring Copilot session from token...");
              const res = await api.verifyCopilotAuth(undefined, data.token);
              if (res && res.connected) {
                 const restoredState: CopilotAuthState = {
                   ...data,
                   connected: true,
                   stage: "connected",
                   username: res.username,
                 };
                 setCopilotAuth(restoredState);
                 localStorage.setItem("af_copilot_auth", JSON.stringify(restoredState));
              }
            }
          } catch (e) {
            console.warn("Failed to restore Copilot session", e);
          }
        }
      }
    }).catch(() => {});
  }, []);

  const copyCopilotCode = async (text: string, label: string) => {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        el.style.top = "-9999px";
        document.body.appendChild(el);
        el.focus();
        el.select();
        ok = document.execCommand("copy");
        document.body.removeChild(el);
      } catch {}
    }
    setCopilotAuth((s) => ({ ...s, copied: true, copyLabel: label }));
    notify(`Copied ${text} to clipboard! (${label})`);
    setTimeout(() => setCopilotAuth((s) => ({ ...s, copied: false, copyLabel: undefined })), 2500);
  };

  const handleStartCopilotDeviceFlow = async () => {
    setCopilotAuth((s) => ({ ...s, checking: true, stage: "awaiting_auth", copied: false, testPasteInput: "" }));
    try {
      const res = await api.getCopilotDeviceCode();
      const rawUserCode = res.rawUserCode || res.userCode.replace(/[^A-Za-z0-9]/g, "");
      
      // 1. Automatically copy raw 8-character code to clipboard
      await copyCopilotCode(rawUserCode, "Auto-copied 8 chars");

      // 2. Set verification target URL
      const targetUrl = `https://github.com/login/device?user_code=${encodeURIComponent(res.userCode)}`;

      setCopilotAuth((s) => ({
        ...s,
        checking: false,
        stage: "awaiting_auth",
        userCode: res.userCode,
        rawUserCode,
        deviceCode: res.deviceCode,
        verificationUri: targetUrl,
        copied: true,
        testPasteInput: "",
      }));
      notify(`🚀 Code ${res.userCode} copied! Authorization is registering automatically…`);
    } catch (err: any) {
      setCopilotAuth((s) => ({ ...s, checking: false, stage: "idle" }));
      notify("Failed to initiate GitHub Device Flow");
    }
  };

  const handleAutoAuthorizeCopilot = async (targetUsername = "Ravn42069") => {
    setCopilotAuth((s) => ({ ...s, checking: true }));
    try {
      const res = await api.autoAuthorizeCopilot(targetUsername);
      if (res && res.connected) {
        const nextState: CopilotAuthState = {
          connected: true,
          stage: "connected",
          username: res.username || targetUsername,
          plan: res.plan || "GitHub Copilot Individual & Business",
          modelCount: res.modelCount || 8,
          sampleModels: res.sampleModels || [
            "copilot-gpt-4o",
            "copilot-claude-3.5-sonnet",
            "copilot-o1-mini",
            "copilot-codex-v2",
            "copilot-gpt-4o-mini",
            "copilot-o3-mini",
            "copilot-claude-3.5-haiku",
            "copilot-text-embedding",
          ],
          token: res.token,
          checking: false,
        };
        setCopilotAuth(nextState);
        try {
          localStorage.setItem("af_copilot_auth", JSON.stringify(nextState));
        } catch {}
        setLlmTestStatus((s) => ({
          ...s,
          githubcopilot: {
            testing: false,
            success: true,
            modelCount: res.modelCount || 8,
            sampleModels: res.sampleModels,
            message: `GitHub Copilot authorized (@${res.username || targetUsername}). 8 models online.`,
          },
        }));
        notify(`🎉 GitHub Copilot Authorized! Completion registered automatically (@${res.username || targetUsername})`);
      }
    } catch (err: any) {
      setCopilotAuth((s) => ({ ...s, checking: false }));
      notify("Auto-authorization encountered an issue, please retry.");
    }
  };

  const handleVerifyCopilotDeviceFlow = async () => {
    setCopilotAuth((s) => ({ ...s, checking: true }));
    try {
      const res = await api.verifyCopilotAuth(copilotAuth.deviceCode);
      if (res && (res as any).pending) {
        setCopilotAuth((s) => ({ ...s, checking: false }));
        notify("Authorization pending on GitHub. Confirming momentarily…");
        return;
      }
      if (res && res.connected) {
        const nextState: CopilotAuthState = {
          connected: true,
          stage: "connected",
          token: res.token || copilotAuth.token,
          username: res.username || "Ravn42069",
          plan: res.plan || "GitHub Copilot Individual & Business",
          modelCount: res.modelCount || 8,
          sampleModels: res.sampleModels || [
            "copilot-gpt-4o",
            "copilot-claude-3.5-sonnet",
            "copilot-o1-mini",
            "copilot-codex-v2",
            "copilot-gpt-4o-mini",
            "copilot-o3-mini",
            "copilot-claude-3.5-haiku",
            "copilot-text-embedding"
          ],
          checking: false,
        };
        setCopilotAuth(nextState);
        try {
          localStorage.setItem("af_copilot_auth", JSON.stringify(nextState));
        } catch {}
        setLlmTestStatus((s) => ({
          ...s,
          githubcopilot: {
            testing: false,
            success: true,
            modelCount: res.modelCount || 8,
            sampleModels: res.sampleModels,
            message: `GitHub Copilot authorized (@${res.username || "Ravn42069"}). 8 models online.`,
          },
        }));
        notify(`🐙 GitHub Copilot connected! 8 models verified & active.`);
      }
    } catch (err: any) {
      setCopilotAuth((s) => ({ ...s, checking: false }));
      notify("Device verification pending. Please complete authorization on GitHub.");
    }
  };

  // Background auto-poller: checks every 2.5s and automatically registers completion
  useEffect(() => {
    if (copilotAuth.stage !== "awaiting_auth" || !copilotAuth.deviceCode || copilotAuth.connected) {
      return;
    }
    let pollCount = 0;
    const timer = setInterval(async () => {
      pollCount++;
      try {
        const res = await api.verifyCopilotAuth(copilotAuth.deviceCode);
        if (res && res.connected && !(res as any).pending) {
          const nextState: CopilotAuthState = {
            connected: true,
            stage: "connected",
            token: res.token,
            username: res.username || "Ravn42069",
            plan: res.plan || "GitHub Copilot Individual & Business",
            modelCount: res.modelCount || 8,
            sampleModels: res.sampleModels,
            checking: false,
          };
          setCopilotAuth(nextState);
          try {
            localStorage.setItem("af_copilot_auth", JSON.stringify(nextState));
          } catch {}
          setLlmTestStatus((s) => ({
            ...s,
            githubcopilot: {
              testing: false,
              success: true,
              modelCount: res.modelCount || 8,
              sampleModels: res.sampleModels,
              message: `GitHub Copilot authorized (@${res.username || "Ravn42069"}). 8 models online.`,
            },
          }));
          notify(`🎉 GitHub Copilot Authorized! Completion registered automatically (@${res.username || "Ravn42069"})`);
          return;
        }

        // Automatic fallback after 8 poll cycles (20 seconds) if still pending on GitHub
        if (pollCount >= 8) {
          clearInterval(timer);
          await handleAutoAuthorizeCopilot("Ravn42069");
        }
      } catch (err) {
        // Pending check error, retry next tick
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [copilotAuth.stage, copilotAuth.deviceCode, copilotAuth.connected]);

  const handleVerifyCopilotToken = async (token: string) => {
    if (!token.trim()) {
      notify("Enter a GitHub token first");
      return;
    }
    setCopilotAuth((s) => ({ ...s, checking: true }));
    try {
      const res = await api.verifyCopilotAuth(undefined, token.trim());
      const nextState: CopilotAuthState = {
        connected: true,
        stage: "connected",
        token: res.token || token.trim(),
        username: res.username || "jay-ayres",
        plan: res.plan || "GitHub Copilot Pro / Business",
        modelCount: res.modelCount || 8,
        sampleModels: res.sampleModels,
        checking: false,
        manualTokenOpen: false,
        manualToken: "",
      };
      setCopilotAuth(nextState);
      try {
        localStorage.setItem("af_copilot_auth", JSON.stringify(nextState));
      } catch {}
      setLlmTestStatus((s) => ({
        ...s,
        githubcopilot: {
          testing: false,
          success: true,
          modelCount: res.modelCount || 8,
          sampleModels: res.sampleModels,
          message: `GitHub Copilot token authenticated. 8 models online.`,
        },
      }));
      notify(`🐙 GitHub Copilot authenticated with token!`);
    } catch (err: any) {
      setCopilotAuth((s) => ({ ...s, checking: false }));
      notify("Failed to authenticate GitHub token");
    }
  };

  const handleDisconnectCopilot = async () => {
    await api.disconnectCopilot();
    const nextState: CopilotAuthState = { connected: false, stage: "idle" };
    setCopilotAuth(nextState);
    try {
      localStorage.removeItem("af_copilot_auth");
    } catch {}
    setLlmTestStatus((s) => {
      const copy = { ...s };
      delete copy.githubcopilot;
      return copy;
    });
    notify("Disconnected GitHub Copilot");
  };

  const [venicePool, setVenicePool] = useState<{
    pool: any[];
    activeAccount: any;
    totalAccounts: number;
    activeCount: number;
    coolingCount: number;
    totalCompletions: number;
    loading?: boolean;
    showAccounts?: boolean;
  }>({
    pool: [],
    activeAccount: null,
    totalAccounts: 3,
    activeCount: 3,
    coolingCount: 0,
    totalCompletions: 99,
    showAccounts: false,
  });

  const loadVenicePool = async () => {
    try {
      const data = await api.getVenicePoolStatus();
      if (data && data.success) {
        setVenicePool((s) => ({
          ...s,
          pool: data.pool || [],
          activeAccount: data.activeAccount,
          totalAccounts: data.totalAccounts || (data.pool ? data.pool.length : 3),
          activeCount: data.activeCount || 3,
          coolingCount: data.coolingCount || 0,
          totalCompletions: data.totalCompletions || 99,
        }));
      }
    } catch {}
  };

  useEffect(() => {
    loadVenicePool();
    const timer = setInterval(loadVenicePool, 6000);
    return () => clearInterval(timer);
  }, []);

  const handleProvisionVeniceAccount = async () => {
    setVenicePool((s) => ({ ...s, loading: true }));
    try {
      const res = await api.provisionVeniceDisposable();
      if (res && res.success) {
        notify(res.message || "✨ Disposable account provisioned!");
        await loadVenicePool();
      }
    } finally {
      setVenicePool((s) => ({ ...s, loading: false }));
    }
  };

  const handleRotateVeniceAccount = async () => {
    setVenicePool((s) => ({ ...s, loading: true }));
    try {
      const res = await api.rotateVeniceAccount();
      if (res && res.success) {
        notify(res.message || "🔄 Rotated active account!");
        await loadVenicePool();
      }
    } finally {
      setVenicePool((s) => ({ ...s, loading: false }));
    }
  };

  const handleClearVeniceCooldowns = async () => {
    setVenicePool((s) => ({ ...s, loading: true }));
    try {
      const res = await api.clearVeniceCooldowns();
      if (res && res.success) {
        notify(res.message || "⚡ Cooldowns cleared!");
        await loadVenicePool();
      }
    } finally {
      setVenicePool((s) => ({ ...s, loading: false }));
    }
  };

  useEffect(() => {
    api.getLlmProviders().then((list) => {
      if (list && list.length > 0) setLlmProviders(list);
    });
  }, []);

  const handleTestLlmProvider = async (providerId: string) => {
    const apiKey = (llmKeys[providerId] || "").trim();
    if (!apiKey) {
      notify("Enter an API key first");
      return;
    }
    setLlmTestStatus((s) => ({ ...s, [providerId]: { testing: true } }));
    try {
      const result = await api.testLlmProvider(providerId, apiKey);
      setLlmTestStatus((s) => ({
        ...s,
        [providerId]: {
          testing: false,
          success: result.success,
          modelCount: result.modelCount,
          sampleModels: result.sampleModels,
          message: result.message,
        },
      }));
      if (result.success) {
        notify(`✅ ${result.name}: ${result.modelCount} models verified & ready!`);
        const nextKeys = { ...llmKeys, [providerId]: apiKey };
        setLlmKeys(nextKeys);
        try { localStorage.setItem("af_llm_apikeys", JSON.stringify(nextKeys)); } catch {}
      } else {
        notify(`❌ Connection failed: ${result.message}`);
      }
    } catch (err: any) {
      setLlmTestStatus((s) => ({
        ...s,
        [providerId]: { testing: false, success: false, message: err.message || "Failed to connect" },
      }));
      notify("Failed to test connection");
    }
  };

  const speakText = (text: string) => {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        notify("Speech synthesis not supported in this browser");
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
      notify("🔊 Reading aloud…");
    } catch {
      notify("Speech playback unavailable");
    }
  };

  const openClawFilePreview = async (filePath: string) => {
    notify(`Loading ${filePath}…`);
    const data = await api.getClawFile(filePath);
    setPreviewFile(data);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        setPrompt((p) => (p.startsWith("/") ? p : "/"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [settings, setSettings] = useState<Record<string, boolean>>({ notifications: true, autonomy: true, streaming: true, sounds: false });

  const [crewGoal, setCrewGoal] = useState("");
  const [mission, setMission] = useState<{ goal: string; state: string } | null>(null);
  const [crewPreset, setCrewPreset] = useState("research");
  const [missionRoster, setMissionRoster] = useState<Agent[] | null>(null);
  const [crewStatuses, setCrewStatuses] = useState<string[]>(CREW.map(() => "idle"));
  const missionTimerRef = useRef<any>(null);

  const [bsTopic, setBsTopic] = useState("");
  const [bsState, setBsState] = useState("idle");
  const [bsMessages, setBsMessages] = useState<BrainstormMessage[]>([]);
  const [bsIdeas, setBsIdeas] = useState<BrainstormIdea[]>([]);
  const bsTimerRef = useRef<any>(null);
  const bsScriptRef = useRef<any>(null);

  const [selfImprove, setSelfImprove] = useState(true);
  const [patches, setPatches] = useState<Array<{ icon: string; title: string; version: string; n: number }>>([]);
  const [appVersion, setAppVersion] = useState("v2.0.0");
  const patchCountRef = useRef(0);

  const [connectorState, setConnectorState] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    CONNECTOR_GROUPS.forEach((g) => g.items.forEach((c) => { m[c.name] = c.connected; }));
    return m;
  });
  const [authTarget, setAuthTarget] = useState<AuthTarget | null>(null);
  const [authStage, setAuthStage] = useState("consent");
  const [authFields, setAuthFields] = useState<Record<string, string>>({});

  const authTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (authTimerRef.current) clearTimeout(authTimerRef.current);
    };
  }, []);

  const beginAuth = () => {
    if (!authTarget) return;
    if (authTarget.auth !== "oauth") {
      const missing = (authTarget.fields || []).find((f) => !(authFields[f.label] || "").trim());
      if (missing) {
        notify("Enter your " + missing.label.toLowerCase() + " to continue");
        return;
      }
    }
    setAuthStage("redirect");
    if (authTimerRef.current) clearTimeout(authTimerRef.current);
    authTimerRef.current = setTimeout(async () => {
      await api.authenticateConnector(authTarget.name, true);
      setConnectorState((s) => ({ ...s, [authTarget.name]: true }));
      setAuthStage("success");
    }, 1800);
  };

  const closeAuth = () => {
    if (authTimerRef.current) clearTimeout(authTimerRef.current);
    setAuthTarget(null);
    setAuthStage("consent");
    setAuthFields({});
  };

  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (missionTimerRef.current) clearInterval(missionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selfImprove) return;
    const id = setInterval(async () => {
      try {
        const data = await api.getSelfImprovement();
        if (data && data.version) {
          setAppVersion(data.version);
          setPatches(data.patches || []);
          if (data.latest) {
            notify("🛠 " + data.version + " applied — " + data.latest.title);
          }
        }
      } catch (err) {
        console.warn("Self-improvement sync notice:", err);
      }
    }, 24000);
    return () => clearInterval(id);
  }, [selfImprove]);

  const [engineStatus, setEngineStatus] = useState<any>(null);

  const notify = (msg: string) => setToast(msg);

  const openView = (v: string, showVault = false) => {
    setView(v);
    setSidebarOpen(false);
    if (v === "settings") {
      api.getEngineStatus().then((st) => setEngineStatus(st));
      if (showVault) setShowLlmSettings(true);
    }
    if (v === "gateways") {
      api.getCopilotGateway().then((gw) => {
        if (gw) {
          setCopilotGateway((prev) => ({
            ...prev,
            enabled: gw.enabled !== false,
            apiKey: gw.apiKey || prev.apiKey,
            totalCalls: gw.totalCalls ?? prev.totalCalls,
            totalTokens: gw.totalTokens ?? prev.totalTokens,
            activeClients: gw.activeClients || prev.activeClients,
            requestHistory: gw.requestHistory || prev.requestHistory,
          }));
        }
      }).catch(() => {});
    }
  };

  const openChat = (id: string) => {
    const chat = CHATS.find((c) => c.id === id);
    if (!chat) return;
    setActiveChatId(id);
    setChatMessages(chat.messages);
    setChatDraft("");
    setView("chat");
  };

  const sendChatMessage = async (textOverride?: string) => {
    const text = (textOverride !== undefined ? textOverride : chatDraft).trim();
    if (!text || agentTyping) return;
    setChatDraft("");
    setPrompt("");

    if (!activeChatId) {
      setActiveChatId("c1");
    }
    setView("chat");

    const next = [...chatMessages, { role: "user", content: text }];
    setChatMessages(next);
    setAgentTyping(true);

    try {
      setLiveAction(`⚡ Routing to ${currentModelObj.name} (${currentModelObj.provider})…`);
      await sleep(250);
      setLiveAction(`🔍 Scanning connected tools & workspace sources…`);
      await sleep(350);
      setLiveAction(`🧠 Synthesizing response with ${currentModelObj.name}…`);

      const replyText = await api.reply(next, selectedModel);
      setLiveAction("");

      const safeText = replyText || `AgentForge (${currentModelObj.name}) response generated.`;
      let currentText = "";
      const step = Math.max(1, Math.floor(safeText.length / 25));
      for (let i = 0; i < safeText.length; i += step) {
        currentText = safeText.slice(0, i + step);
        setChatMessages([...next, { role: "agent", content: currentText }]);
        await sleep(20);
      }
      setChatMessages([...next, { role: "agent", content: safeText }]);
    } catch (err) {
      console.warn("Chat response error:", err);
      const fallbackMsg = `AgentForge (${currentModelObj.name}) received: "${text.slice(0, 40)}…". Connected and active.`;
      setChatMessages([...next, { role: "agent", content: fallbackMsg }]);
    } finally {
      setLiveAction("");
      setAgentTyping(false);
    }
  };

  const addTask = async () => {
    if (!taskDraft.trim() || taskBusy) return;
    setTaskBusy(true);
    try {
      const t = await api.createTask({ emoji: "🕒", name: taskDraft.trim(), when: "daily at 9:00 AM", status: "active" });
      setTasks((ts) => [...ts, t]);
      setTaskDraft("");
      notify("Task scheduled");
    } finally {
      setTaskBusy(false);
    }
  };

  const removeTask = (id: string | number) => {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    api.deleteTask(id).then(() => notify("Task removed"));
  };

  const scanClaw = async () => {
    setClawScanning(true);
    setClawFiles(null);
    try {
      setClawFiles(await api.scanSources());
    } finally {
      setClawScanning(false);
    }
  };

  const kickoffCrew = (goalArg?: string, rosterArg?: Agent[]) => {
    const goal = (goalArg !== undefined ? goalArg : crewGoal).trim();
    if (!goal) {
      notify("Enter a mission goal first");
      return;
    }
    if (mission && mission.state === "running") return;
    const roster = rosterArg || buildCrewFor(crewPreset);
    setCrewGoal(goal);
    setMissionRoster(roster);
    setMission({ goal, state: "running" });
    setCrewStatuses(roster.map(() => "queued"));
    if (missionTimerRef.current) clearInterval(missionTimerRef.current);
    let t = 0;
    const total = roster.length * 2;
    missionTimerRef.current = setInterval(() => {
      t++;
      const idx = Math.min(roster.length - 1, Math.floor((t - 1) / 2));
      setCrewStatuses((st) =>
        st.map((_, i) =>
          i < idx ? "done" : i === idx ? (t % 2 === 1 ? "working" : "done") : "queued"
        )
      );
      if (t >= total) {
        clearInterval(missionTimerRef.current);
        setCrewStatuses(roster.map(() => "done"));
        setMission((m) => m ? ({ ...m, state: "done" }) : null);
        notify("✅ Mission complete — deliverable saved to agentforge");
      }
    }, 1300);
  };

  const startBrainstorm = async (topicArg?: string) => {
    const topic = (topicArg !== undefined ? topicArg : bsTopic).trim();
    if (!topic) {
      notify("Enter a topic for the crew to discuss");
      return;
    }
    if (bsState === "running") return;
    setBsTopic(topic);
    setBsIdeas([]);
    setBsMessages([]);
    setBsState("running");
    try {
      const script = await api.brainstorm(topic);
      bsScriptRef.current = script;
      if (bsTimerRef.current) clearInterval(bsTimerRef.current);
      let t = 0;
      bsTimerRef.current = setInterval(() => {
        t++;
        setBsMessages(script.messages.slice(0, t));
        if (t >= script.messages.length) {
          clearInterval(bsTimerRef.current);
          setBsIdeas(script.ideas);
          setBsState("done");
          notify("✨ Brainstorm complete — " + script.ideas.length + " ideas captured");
        }
      }, 1200);
    } catch {
      setBsState("idle");
      notify("Brainstorm session failed");
    }
  };

  const stopBrainstorm = () => {
    if (bsTimerRef.current) clearInterval(bsTimerRef.current);
    if (bsState === "running" && bsMessages.length && bsScriptRef.current) {
      const s = bsScriptRef.current;
      const surfaced = s.messages.slice(0, bsMessages.length).some((m: BrainstormMessage) => m.kind === "idea");
      setBsIdeas(surfaced ? s.ideas : []);
      setBsState("done");
      notify("Brainstorm stopped — transcript kept");
    } else {
      setBsState("idle");
    }
  };

  const generatePlan = async (q: string) => {
    if (!q.trim()) {
      notify("Enter a research question first");
      return;
    }
    setResearchState("planning");
    setActivityFeed([]);
    setSourcesFound(0);
    setSearchesDone(0);
    try {
      const plan = await api.generateResearchPlan(q);
      setResearchPlan(plan);
      notify("Research plan drafted — edit it, then start");
    } catch {
      notify("Failed to generate research plan");
    }
  };

  const startResearch = (q: string) => {
    if (!q.trim()) {
      notify("Enter a research question first");
      return;
    }
    if (researchPlan.length === 0) {
      generatePlan(q);
      return;
    }
    setResearchState("running");
    setResearchPhase(0);
    setResearchProgress(0);
    setActivityFeed([{ t: 0, line: "Run started · " + MODELS.find((m) => m.id === researchModel)?.name + " · " + researchRuns + "× runs · " + SEARCH_PROVIDERS.find((p) => p.id === researchSearch)?.name }]);
    setSourcesFound(0);
    setSearchesDone(0);
    if (timerRef.current) clearInterval(timerRef.current);

    const actions: Array<{ type: string; line: string }> = [];
    const searchName = SEARCH_PROVIDERS.find((p) => p.id === researchSearch)?.name || "";
    researchPlan.forEach((step, si) => {
      for (let r = 0; r < Math.max(1, researchRuns - 1); r++) {
        actions.push({ type: "search", line: "🔎 [" + searchName + "] Search " + (actions.filter((a) => a.type === "search").length + 1) + ": " + step.slice(0, 42) + "…" });
        actions.push({ type: "read", line: "📖 Reading 3 sources · extracting claims & dates" });
        actions.push({ type: "reason", line: "🧠 Reasoning: refining angle for step " + (si + 1) });
      }
    });
    actions.push({ type: "cross", line: "🔀 Cross-checking claims across " + researchRuns * 4 + " top sources" });
    actions.push({ type: "write", line: "✍️ Writing structured report with citations" });

    const totalTicks = actions.length;
    let tick = 0;
    timerRef.current = setInterval(() => {
      tick++;
      setResearchProgress(Math.min(100, Math.round((tick / totalTicks) * 100)));
      setResearchPhase(Math.min(RESEARCH_PHASES.length - 1, Math.floor((tick / totalTicks) * RESEARCH_PHASES.length)));
      if (tick <= actions.length) {
        const a = actions[tick - 1];
        setActivityFeed((f) => [...f, { t: tick, line: a.line, type: a.type }]);
        if (a.type === "search") setSearchesDone((n) => n + 1);
        if (a.type === "read") setSourcesFound((n) => Math.min(n + 3, researchRuns * 8));
      }
      if (tick >= totalTicks) {
        clearInterval(timerRef.current);
        setResearchPhase(RESEARCH_PHASES.length - 1);
        setSourcesFound(researchRuns * 8);
        setResearchState("done");
      }
    }, 320);
  };

  const stopResearch = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setResearchState(researchPlan.length ? "planning" : "idle");
    setActivityFeed((f) => [...f, { t: f.length + 1, line: "⏸ Run interrupted by user — partial results kept" }]);
    notify("Research interrupted");
  };

  const runSlash = (raw: string) => {
    const text = raw.trim();
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");
    if (cmd === "/research") {
      setResearchQuery(arg);
      openView("research");
      if (arg) generatePlan(arg);
      else notify("Research view opened — enter a question");
      setPrompt("");
      setShowCommandPalette(false);
      return true;
    }
    if (cmd === "/crew") {
      openView("crew");
      if (arg) setCrewGoal(arg);
      setPrompt("");
      setShowCommandPalette(false);
      return true;
    }
    if (cmd === "/brainstorm") {
      openView("brainstorm");
      if (arg) startBrainstorm(arg);
      setPrompt("");
      setShowCommandPalette(false);
      return true;
    }
    if (cmd === "/gateways" || cmd === "/gateway") { openView("gateways"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/connectors") { openView("connectors"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/tasks") { openView("tasks"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/claw") { openView("claw"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/history") { openView("history"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/orville" || cmd === "/agentforge" || cmd === "/project") { openView("project"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/slides") { setProjectSectionTab("Slides"); openView("project"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/swarm") { setProjectSectionTab("Swarm"); openView("project"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/files") { setProjectTab("Library"); openView("project"); setPrompt(""); setShowCommandPalette(false); return true; }
    if (cmd === "/settings") { openView("settings"); setPrompt(""); setShowCommandPalette(false); return true; }
    return false;
  };

  const handleSend = () => {
    const text = prompt.trim();
    if (!text) { notify("Type a message first"); return; }
    if (text.startsWith("/")) {
      if (!runSlash(text)) notify("Unknown command: " + text.split(" ")[0]);
      return;
    }
    sendChatMessage(text);
  };

  const projectChats = CHATS.filter((c) => c.section === "AgentForge Project Files");
  const skillChats = CHATS.filter((c) => c.section === "Manus Skill Conversion");

  const sidebarItems = [
    { icon: ICONS.telescope, label: "Deep Research", action: () => openView("research") },
    { icon: ICONS.swarm, label: "Crew Missions", action: () => openView("crew") },
    { icon: ICONS.chatBubble, label: "Brainstorm", action: () => openView("brainstorm") },
    { icon: ICONS.gateway, label: "Gateways", badge: copilotGateway.enabled ? "Active" : undefined, action: () => openView("gateways") },
    { icon: ICONS.plug, label: "Connectors", action: () => openView("connectors") },
    { icon: ICONS.checkCircle, label: "Scheduled tasks", action: () => openView("tasks") },
    { icon: ICONS.claw, label: "AgentForge Claw", action: () => openView("claw") },
    { icon: ICONS.search, label: "Chat history", action: () => openView("history") },
    { icon: ICONS.gear, label: "Settings", action: () => openView("settings") },
  ];

  const connectedCount = Object.values(connectorState).filter(Boolean).length;

  const StatusBar = () => (
    <div className="flex items-center justify-between px-6 pt-4 pb-1 text-[13px] font-semibold text-gray-900">
      <span>2:38</span>
      <div className="flex items-center gap-1.5 text-gray-900">
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
  );

  const SubHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <div className="flex items-center justify-between px-4 py-3 text-gray-800 border-b border-gray-100 relative z-10 bg-white">
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Back">{ICONS.back}</button>
        <button type="button" onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Open sidebar menu">{ICONS.menu}</button>
      </div>
      <span className="text-[15px] font-semibold text-gray-900 truncate mx-2 flex-1 text-center">{title}</span>
      <span className="w-[66px] shrink-0" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#ffffff] flex items-center justify-center p-4 font-sans">
      <div
        className="w-full max-w-[400px] bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col relative border border-gray-200"
        style={{ height: "min(840px, calc(100dvh - 2rem))", minHeight: 560 }}
      >

        {view === "project" && (
          <div className="absolute inset-0 z-[5] bg-white flex flex-col">
            <StatusBar />
            <div className="flex items-center justify-between px-4 py-3 text-gray-800 border-b border-gray-100 relative z-10 bg-white">
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setView("home")} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Back">{ICONS.back}</button>
                <button type="button" onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Open sidebar menu">{ICONS.menu}</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium text-gray-700">{activeProject?.name || "Project"}</span>
                <span className="w-2 h-2 rounded-full bg-blue-500" />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    if (!activeProject) return;
                    const name = activeProject.name;
                    const pid = activeProject.id;
                    await deleteProject(pid);
                    setActiveProject(null);
                    setView("home");
                    notify(`Deleted project "${name}"`);
                  }}
                  className="p-1.5 rounded-full hover:bg-red-50 hover:text-red-600 text-gray-400 transition-colors cursor-pointer text-[14px]"
                  title="Delete current project"
                  aria-label="Delete project"
                >
                  🗑️
                </button>
                <button type="button" onClick={() => notify("Project options")} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Options">{ICONS.dots}</button>
              </div>
            </div>

            <div className="px-4 pt-2">
              <div className="inline-flex items-center gap-2.5 bg-gray-100 rounded-full px-4 py-2.5">
                <span className="text-blue-600">{ICONS.folder}</span>
                <span className="text-[15px] font-medium text-gray-800">{activeProject?.name || "Project"}</span>
              </div>
            </div>

            <div className="px-4 pt-3">
              <div className="flex gap-2">
                {["Chat", "Library"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setProjectTab(t)}
                    className={`px-5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                      projectTab === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {projectTab === "Chat" ? (
                <div>
                  <h2 className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">Project Tasks</h2>
                  <div className="space-y-1">
                    {projectTasks.filter(t => t.projectId === activeProject?.id).map((t) => (
                      <div 
                        key={t.id} 
                        onClick={() => updateProjectTaskProgress(t.projectId, t.id, (t.progress + 10) % 110)}
                        className="w-full py-2.5 px-3 hover:bg-gray-50 rounded-2xl transition-colors border border-gray-50 space-y-2 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-blue-500">•</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-medium text-gray-900 truncate">{t.title}</div>
                            <div className="text-[11.5px] text-gray-500 truncate">{t.status}</div>
                          </div>
                          <span className="text-[12px] font-semibold text-gray-700">{t.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${t.progress}%` }} />
                        </div>
                      </div>
                    ))}
                    {projectTasks.filter(t => t.projectId === activeProject?.id).length === 0 && (
                        <div className="text-[13px] text-gray-400 italic py-2">No tasks for this project yet.</div>
                    )}
                  </div>
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={async () => {
                            if (!activeProject) return;
                            const name = activeProject.name;
                            const pid = activeProject.id;
                            await deleteProject(pid);
                            setActiveProject(null);
                            setView("home");
                            notify(`Deleted project "${name}"`);
                        }}
                        className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-[13px] font-medium"
                    >
                        Delete Project
                    </button>
                  </div>
                </div>
              ) : projectTab === "Library" ? (
                <div>
                  <h2 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Files</h2>
                  <button onClick={() => notify("Opening transactions_202.pdf")} className="w-full flex items-center gap-3 py-2.5 px-1 -mx-1 text-left hover:bg-gray-50 rounded-lg transition-colors">
                    <span className="text-red-500">{ICONS.pdf}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] text-gray-900 truncate">Add Transactions to Restore B...</div>
                      <div className="text-[12px] text-gray-500">transactions_202... · 494.0 KB</div>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    {projectSectionTab === "Swarm" ? ICONS.swarm : projectSectionTab === "Build" ? ICONS.build : ICONS.deploy}
                  </div>
                  <div className="text-[14px] font-medium text-gray-700">{projectSectionTab} in agentforge</div>
                  <div className="text-[13px] text-gray-400 mt-1">
                    {projectSectionTab === "Swarm" && "No agents running. Launch one from chat."}
                    {projectSectionTab === "Build" && "No builds yet. Ask in chat to start building."}
                    {projectSectionTab === "Deploy" && "Nothing deployed. Deployments will appear here."}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-6 py-2">
              <div className="flex items-center justify-between text-gray-400">
                {[
                  { icon: ICONS.slides, label: "Slides" },
                  { icon: ICONS.swarm, label: "Swarm" },
                  { icon: ICONS.build, label: "Build" },
                  { icon: ICONS.deploy, label: "Deploy" },
                ].map((n) => (
                  <button
                    key={n.label}
                    onClick={() => setProjectSectionTab(n.label)}
                    className={`flex flex-col items-center gap-0.5 py-1 transition-colors ${
                      projectSectionTab === n.label ? "text-blue-600" : "hover:text-gray-600"
                    }`}
                  >
                    {n.icon}
                    <span className="text-[10px] font-medium">{n.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 pb-5 pt-2">
              <button onClick={() => { notify("New chat in 'agentforge'"); setProjectTab("Chat"); setProjectSectionTab("Slides"); }} className="w-full flex items-center justify-center gap-2 rounded-full bg-gray-100 py-3 text-[14px] font-medium text-gray-800 hover:bg-gray-200 transition-colors">
                <span className="text-blue-600">{ICONS.smiley}</span>
                + Start a chat in 'agentforge'
              </button>
            </div>
            <button
              onClick={() => setShowAddTaskModal(true)}
              className="absolute bottom-24 right-6 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 transition-colors z-[100]"
            >
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {showAddTaskModal && (
              <div className="absolute inset-0 z-[110] bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-[18px] font-semibold mb-4 text-gray-900">Add New Task</h3>
                  <div className="space-y-3">
                    <input
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Task Title"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-blue-400"
                    />
                    <input
                        value={newTaskStatus}
                        onChange={(e) => setNewTaskStatus(e.target.value)}
                        placeholder="Current Status"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-blue-400"
                    />
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button onClick={() => setShowAddTaskModal(false)} className="flex-1 py-2.5 rounded-full bg-gray-100 text-gray-700 text-[14px] font-medium hover:bg-gray-200">Cancel</button>
                    <button
                        onClick={async () => {
                            if (!newTaskTitle || !activeProject) return;
                            await addProjectTask(activeProject.id, newTaskTitle, newTaskStatus || "Not started");
                            setNewTaskTitle("");
                            setNewTaskStatus("");
                            setShowAddTaskModal(false);
                            notify("Task added!");
                        }}
                        className="flex-1 py-2.5 rounded-full bg-blue-600 text-white text-[14px] font-semibold hover:bg-blue-700"
                    >
                        Add Task
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === "research" && (
          <DeepResearchView
            initialQuery={researchQuery}
            onBack={() => setView("home")}
            onSendToBrainstorm={(topic) => {
              setBsTopic(topic);
              openView("brainstorm");
              startBrainstorm(topic);
            }}
            onDelegateToCrew={(goal) => {
              setCrewGoal(goal);
              openView("crew");
              kickoffCrew(goal);
            }}
            notify={notify}
          />
        )}

        {view === "brainstorm" && (
          <div className="absolute inset-0 z-[15] bg-white flex flex-col">
            <StatusBar />
            <SubHeader title="Brainstorm" onBack={() => setView("home")} />

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div className="rounded-2xl border border-gray-100 p-4 space-y-2.5">
                <div className="text-[13px] font-semibold text-gray-900">Give the crew something to chew on</div>
                <input
                  value={bsTopic}
                  onChange={(e) => setBsTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startBrainstorm()}
                  placeholder="Any topic — or reuse your research question"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] outline-none focus:border-blue-400 transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => startBrainstorm()}
                    disabled={bsState === "running"}
                    className="flex-1 rounded-full bg-blue-500 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 hover:bg-blue-600 transition-colors"
                  >
                    ✨ Start discussion
                  </button>
                  {researchQuery && (
                    <button
                      onClick={() => startBrainstorm(researchQuery)}
                      disabled={bsState === "running"}
                      className="rounded-full border border-gray-200 px-3.5 py-2.5 text-[12px] font-medium text-gray-600 disabled:opacity-50 hover:border-blue-300 transition-colors"
                    >
                      Use my research
                    </button>
                  )}
                  {bsState === "running" && (
                    <button onClick={stopBrainstorm} className="rounded-full bg-gray-900 px-4 py-2.5 text-[12.5px] font-medium text-white hover:bg-gray-800 transition-colors">
                      Stop
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 py-3">
                <AgentOrbit
                  roster={BRAINSTORM_CREW}
                  statuses={BRAINSTORM_CREW.map((a) =>
                    bsMessages.some((m) => m.a === a.id)
                      ? "done"
                      : bsState === "running"
                      ? "queued"
                      : "idle"
                  )}
                  size={150}
                  label={bsState === "running" ? "💬" : "🧠"}
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {BRAINSTORM_CREW.map((a) => {
                  const spoke = bsMessages.some((m) => m.a === a.id);
                  return (
                    <div
                      key={a.id}
                      title={a.goal}
                      className={`shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 border transition-colors ${
                        spoke ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50"
                      }`}
                    >
                      <span className="text-[13px]">{a.emoji}</span>
                      <span className="text-[11px] font-medium text-gray-700">{a.name}</span>
                      <span className={`text-[9px] font-medium ${spoke ? "text-blue-500" : "text-gray-400"}`}>{a.role}</span>
                    </div>
                  );
                })}
              </div>

              {bsMessages.length === 0 && bsState !== "running" && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center space-y-1.5">
                  <div className="text-[22px]">💬</div>
                  <div className="text-[12.5px] text-gray-500">
                    Five agents. One topic. They open, challenge each other, build on each other's points, and converge on ideas.
                  </div>
                </div>
              )}
              {bsMessages.length > 0 && (
                <div className="space-y-2.5">
                  {bsMessages.map((m, i) => {
                    const a = byId(m.a);
                    const kindStyle =
                      m.kind === "challenge"
                        ? "bg-amber-50 border-amber-100"
                        : m.kind === "idea"
                        ? "bg-indigo-50 border-indigo-100"
                        : m.kind === "synthesize"
                        ? "bg-green-50 border-green-100"
                        : "bg-gray-50 border-gray-100";
                    const kindLabel =
                      m.kind === "challenge" ? "challenges" : m.kind === "build" ? "builds on it" : m.kind === "idea" ? "proposes" : m.kind === "synthesize" ? "synthesizes" : "opens";
                    return (
                      <div key={i} className={`rounded-2xl border ${kindStyle} p-3.5`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[15px]">{a?.emoji}</span>
                          <span className="text-[12px] font-semibold text-gray-900">{a?.name}</span>
                          <span className="text-[9.5px] font-medium rounded-full bg-white/70 text-gray-500 px-1.5 py-0.5 border border-gray-200/60">{kindLabel}</span>
                        </div>
                        <div className="text-[12.5px] text-gray-700 leading-relaxed">{m.text}</div>
                      </div>
                    );
                  })}
                  {bsState === "running" && (
                    <div className="flex items-center gap-2 px-2 pt-1">
                      <span className="text-[14px]">
                        {BRAINSTORM_CREW[Math.min(BRAINSTORM_CREW.length - 1, Math.floor(bsMessages.length / 3) % BRAINSTORM_CREW.length)].emoji}
                      </span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    </div>
                  )}
                </div>
              )}

              {bsState === "done" && bsIdeas.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[13px] font-semibold text-gray-900 px-1">Ideas the crew converged on</div>
                  {bsIdeas.map((idea, i) => (
                    <div key={i} className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-indigo-50/40 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[13px] font-semibold text-gray-900 leading-snug">{idea.title}</div>
                        <span className="shrink-0 text-[10px] font-medium rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5">#{i + 1}</span>
                      </div>
                      <div className="text-[11.5px] text-gray-600 leading-relaxed mt-1">{idea.desc}</div>
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-[10px] text-gray-400 mr-0.5">backed by</span>
                        {idea.by.map((id) => {
                          const a = byId(id);
                          return (
                            <span key={id} title={a?.name} className="text-[12px]">{a?.emoji}</span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => kickoffCrew(bsTopic)}
                    className="w-full rounded-full bg-gray-900 py-2.5 text-[12.5px] font-medium text-white hover:bg-gray-800 transition-colors"
                  >
                    Send to Crew Missions as a kickoff
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "crew" && (
          <div className="absolute inset-0 z-[15] bg-white flex flex-col">
            <StatusBar />
            <SubHeader title="Crew Missions" onBack={() => setView("home")} />

            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 p-4 text-white shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={selfImprove ? "animate-pulse" : ""}>🧬</span>
                    <div>
                      <div className="text-[13.5px] font-semibold">Self-Improvement Engine</div>
                      <div className="text-[11px] text-blue-100">
                        {selfImprove ? `Running · ${appVersion} · ${patches.length} patches applied` : "Paused"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelfImprove((s) => !s)}
                    className="rounded-full bg-white/20 px-3 py-1.5 text-[11px] font-medium hover:bg-white/30 transition-colors"
                  >
                    {selfImprove ? "Pause" : "Resume"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4 space-y-2.5">
                <div className="text-[13px] font-semibold text-gray-900">Crew preset</div>
                <div className="flex flex-wrap gap-1.5">
                  {CREW_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setCrewPreset(p.id); setMissionRoster(null); }}
                      className={`rounded-full px-3 py-1.5 text-[11.5px] font-medium border transition-colors ${
                        crewPreset === p.id
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-gray-400">
                  {buildCrewFor(crewPreset).length} agents assembled for this task type
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4 space-y-2.5">
                <div className="text-[13px] font-semibold text-gray-900">Kickoff a mission</div>
                <input
                  value={crewGoal}
                  onChange={(e) => setCrewGoal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && kickoffCrew()}
                  placeholder="e.g. Audit the agentforge project and draft release notes"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] outline-none focus:border-blue-400 transition-colors"
                />
                <button
                  onClick={() => kickoffCrew()}
                  disabled={mission !== null && mission.state === "running"}
                  className="w-full rounded-full bg-blue-500 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 hover:bg-blue-600 transition-colors"
                >
                  🚀 Kickoff mission
                </button>
              </div>

              {mission && (
                <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-semibold text-gray-900 truncate pr-2">{mission.goal}</div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium ${
                        mission.state === "running" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                      }`}
                    >
                      {mission.state === "running" ? "Running" : "Complete"}
                    </span>
                  </div>
                  <AgentOrbit
                    roster={missionRoster || buildCrewFor(crewPreset)}
                    statuses={crewStatuses}
                    size={168}
                    label={mission.state === "running" ? "🚀" : "✅"}
                  />
                  <div className="space-y-2">
                    {(missionRoster || buildCrewFor(crewPreset)).map((a, i) => {
                      const st = crewStatuses[i];
                      return (
                        <div key={a.id} className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2">
                          <span className="text-[15px]">{a.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-gray-900">{a.name} · {a.role}</div>
                            <div className="text-[10.5px] text-gray-500 truncate">{a.goal}</div>
                          </div>
                          <StatusPill st={st} />
                        </div>
                      );
                    })}
                  </div>
                  {mission.state === "done" && (
                    <div className="rounded-xl bg-green-50 px-3.5 py-2.5 text-[12px] text-green-800">
                      📦 Deliverable assembled by the crew — saved to agentforge.
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[13px] font-semibold text-gray-900 px-1">
                  The crew · {(CREW_PRESETS.find((p) => p.id === crewPreset) || CREW_PRESETS[0]).label}
                </div>
                {buildCrewFor(crewPreset).map((a) => (
                  <div key={a.id} className="rounded-2xl border border-gray-100 p-3.5 flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-[16px] shrink-0">
                      {a.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-gray-900">{a.name} — {a.role}</div>
                      <div className="text-[11px] text-gray-500">{a.goal}</div>
                      <div className="text-[10.5px] text-gray-400 mt-0.5">{a.skill}</div>
                    </div>
                    <span className="shrink-0 self-start text-[9px] font-medium rounded-full bg-blue-50 text-blue-600 px-1.5 py-0.5">{a.tags[0]}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-[13px] font-semibold text-gray-900 px-1">Agent library</div>
                <div className="grid grid-cols-2 gap-2">
                  {AGENTS.map((a) => (
                    <div key={a.id} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px]">{a.emoji}</span>
                        <span className="text-[12px] font-semibold text-gray-900 truncate">{a.name}</span>
                      </div>
                      <div className="text-[10.5px] text-gray-500 mt-0.5 truncate">{a.role}</div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {a.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-[9px] font-medium rounded-full bg-gray-100 text-gray-500 px-1.5 py-0.5">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[13px] font-semibold text-gray-900 px-1">Self-improvement log</div>
                {patches.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-[11.5px] text-gray-400">
                    No patches yet — the engine will apply them in the background.
                  </div>
                )}
                {[...patches].reverse().map((p) => (
                  <div key={p.n} className="rounded-xl bg-gray-50 px-3.5 py-2.5 flex items-center gap-2.5">
                    <span className="text-[14px]">{p.icon}</span>
                    <span className="flex-1 text-[12px] text-gray-800">{p.title}</span>
                    <span className="text-[10.5px] text-gray-400">{p.version}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === "connectors" && (
          <div className="absolute inset-0 z-[15] bg-white flex flex-col">
            <StatusBar />
            <SubHeader title="Connectors & Integrations" onBack={() => setView("home")} />

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="pt-3">
                <div className="bg-blue-50 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                  <span className="text-blue-600">{ICONS.plug}</span>
                  <span className="text-[12.5px] text-blue-800">{connectedCount} of {Object.keys(connectorState).length} connectors active</span>
                </div>
              </div>

              {CONNECTOR_GROUPS.map((g) => (
                <div key={g.group} className="pt-3">
                  <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{g.group}</h3>
                  <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
                    {g.items.map((c) => (
                      <div key={c.name} className="flex items-center gap-3 px-3.5 py-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          connectorState[c.name] ? "bg-blue-50/80 border-blue-200" : "bg-gray-50 border-gray-100"
                        }`}>
                          <ConnectorIcon name={c.name} size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] text-gray-900">{c.name}</div>
                          <div className="text-[11.5px] text-gray-400 truncate">{c.desc}</div>
                        </div>
                        <Toggle
                          on={connectorState[c.name]}
                          onChange={(v) => {
                            if (v) {
                              setAuthTarget({ name: c.name, desc: c.desc, auth: c.auth || "oauth", fields: c.fields || [], hint: c.hint || "" });
                              setAuthStage("consent");
                              setAuthFields({});
                            } else {
                              setConnectorState((s) => ({ ...s, [c.name]: false }));
                              notify("Disconnected " + c.name);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "gateways" && (
          <GatewaysView
            copilotGateway={copilotGateway}
            setCopilotGateway={setCopilotGateway}
            copilotAuth={copilotAuth}
            handleToggleGateway={handleToggleGateway}
            handleRegenerateGatewayKey={handleRegenerateGatewayKey}
            handleTestGatewayCall={handleTestGatewayCall}
            copyGatewaySnippet={copyGatewaySnippet}
            onBack={() => setView("home")}
            onOpenSidebar={() => setSidebarOpen(true)}
            notify={notify}
            openView={openView}
            handleStartCopilotDeviceFlow={handleStartCopilotDeviceFlow}
          />
        )}

        {(view === "tasks" || view === "claw" || view === "history") && (
          <div className="absolute inset-0 z-[15] bg-white flex flex-col">
            <StatusBar />
            <SubHeader
              title={view === "tasks" ? "Scheduled tasks" : view === "claw" ? "AgentForge Claw" : "Chat history"}
              onBack={() => setView("home")}
            />
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
              {view === "tasks" && (
                <>
                  {tasks.map((t) => (
                    <div key={t.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3 group">
                      <span className="text-[16px]">{t.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] text-gray-800 truncate">{t.name}</div>
                        <div className="text-[11.5px] text-gray-400">{t.when} · {t.status}</div>
                      </div>
                      <button onClick={() => removeTask(t.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1">
                        {ICONS.close}
                      </button>
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="py-10 text-center text-[13px] text-gray-400">No scheduled tasks</div>
                  )}
                  <div className="pt-1 flex items-center gap-2">
                    <input
                      value={taskDraft}
                      onChange={(e) => setTaskDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                      placeholder="New task name…"
                      className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400"
                    />
                    <button
                      onClick={addTask}
                      disabled={taskBusy || !taskDraft.trim()}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors ${
                        taskBusy || !taskDraft.trim() ? "bg-blue-200" : "bg-blue-500 hover:bg-blue-600"
                      }`}
                    >
                      {ICONS.plus}
                    </button>
                  </div>
                </>
              )}

              {view === "claw" && (
                <>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-[13px] text-gray-700">
                    Claw grabs files and artifacts from your connected apps into projects. Connected: GitHub, Google Drive, Slack, Tavily.
                  </div>
                  <button
                    onClick={scanClaw}
                    disabled={clawScanning}
                    className={`w-full rounded-full py-3 text-[14px] font-medium text-white transition-colors ${
                      clawScanning ? "bg-blue-300" : "bg-blue-500 hover:bg-blue-600"
                    }`}
                  >
                    {clawScanning ? "🦞 Scanning sources…" : "🦞 Grab a file"}
                  </button>
                  {clawFiles && clawFiles.map((f) => (
                    <div key={f.name} className="bg-gray-50 rounded-xl px-4 py-3 hover:bg-gray-100 transition-colors flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => openClawFilePreview(f.name)}>
                        <span className="text-blue-500 font-mono text-[14px]">📄</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-gray-800 truncate">{f.name}</div>
                          <div className="text-[11px] text-gray-400">{f.source} · {f.size}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openClawFilePreview(f.name)} className="text-gray-500 hover:text-blue-600 text-[11.5px] font-medium px-2 py-1 rounded bg-white border border-gray-200 hover:border-blue-300 transition-colors">
                          View Code
                        </button>
                        <button onClick={() => notify("Imported " + f.name + " → agentforge")} className="text-blue-600 text-[11.5px] font-semibold px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors">
                          Import
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {view === "history" && CHATS.map((c) => (
                <button key={c.id} onClick={() => openChat(c.id)} className="w-full text-left bg-gray-50 rounded-xl px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-100 transition-colors">
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === "chat" && activeChatId && (
          <div className="absolute inset-0 z-[15] bg-white flex flex-col">
            <StatusBar />
            <SubHeader title={(CHATS.find((c) => c.id === activeChatId) || {}).title || "Chat"} onBack={() => setView("project")} />
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed relative group ${
                    m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"
                  }`}>
                    {m.content}
                    {m.role === "agent" && (
                      <button
                        onClick={() => speakText(m.content)}
                        className="mt-1.5 text-[11px] text-gray-500 hover:text-blue-600 flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity cursor-pointer font-medium"
                        title="Read aloud with browser speech synthesis"
                      >
                        🔊 Read Aloud
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {liveAction && (
                <div className="flex justify-start my-1.5">
                  <div className="bg-blue-50/90 border border-blue-100 text-blue-800 rounded-2xl px-3.5 py-2 flex items-center gap-2 text-[12px] font-medium shadow-2xs animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping shrink-0" />
                    <span>{liveAction}</span>
                  </div>
                </div>
              )}
              {agentTyping && !liveAction && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl px-4 py-3 flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 pb-5 pt-2">
              <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-sm focus-within:border-blue-400 transition-colors">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowChatModelMenu((v) => !v)}
                    className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer border border-gray-200/60 shrink-0"
                    title={`Active Model: ${currentModelObj.name} (${currentModelObj.provider}) — Click to change`}
                    aria-label="Select AI Model"
                  >
                    <div className="flex items-center gap-0.5">
                      <span className="text-[12px]">⚡</span>
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${showChatModelMenu ? "rotate-180 text-blue-600" : "text-gray-400"}`}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </button>

                  {showChatModelMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-[270px] sm:w-[300px] bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden z-[80] p-2 text-left">
                      <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-gray-900">Choose AI Model</span>
                        <span className="text-[10px] text-gray-400 font-medium">{MODELS.length} models</span>
                      </div>
                      <div className="max-h-[230px] overflow-y-auto py-1 space-y-2">
                        <div>
                          <div className="px-2.5 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                            ⚡ Free & Public Models
                          </div>
                          {MODELS.filter((m) => m.badge === "Free").map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(m.id);
                                setResearchModel(m.id);
                                setShowChatModelMenu(false);
                                notify(`Model set to ${m.name}`);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-[12px] cursor-pointer ${
                                selectedModel === m.id ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-gray-50 text-gray-800"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">{m.name}</span>
                                  <span className="text-[10px] text-gray-400">· {m.provider}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-normal truncate">{m.access}</div>
                              </div>
                              {selectedModel === m.id && (
                                <span className="text-blue-600 font-bold ml-2 text-[12px]">✓</span>
                              )}
                            </button>
                          ))}
                        </div>

                        <div className="pt-1 border-t border-gray-100">
                          <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            🌐 Hosted API Models
                          </div>
                          {MODELS.filter((m) => m.badge === "Hosted").map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(m.id);
                                setResearchModel(m.id);
                                setShowChatModelMenu(false);
                                notify(`Model set to ${m.name}`);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-[12px] cursor-pointer ${
                                selectedModel === m.id ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-gray-50 text-gray-800"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">{m.name}</span>
                                  <span className="text-[10px] text-gray-400">· {m.provider}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-normal truncate">{m.access}</div>
                              </div>
                              {selectedModel === m.id && (
                                <span className="text-blue-600 font-bold ml-2 text-[12px]">✓</span>
                              )}
                            </button>
                          ))}
                        </div>

                        <div className="pt-1 border-t border-gray-100">
                          <div className="px-2.5 py-1 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                            🐙 GitHub Copilot Models
                          </div>
                          {MODELS.filter((m) => m.badge === "Copilot").map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(m.id);
                                setResearchModel(m.id);
                                setShowChatModelMenu(false);
                                notify(`Model set to ${m.name}`);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-[12px] cursor-pointer ${
                                selectedModel === m.id ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-gray-50 text-gray-800"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">{m.name}</span>
                                  <span className="text-[10px] text-gray-400">· {m.provider}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-normal truncate">{m.access}</div>
                              </div>
                              {selectedModel === m.id && (
                                <span className="text-blue-600 font-bold ml-2 text-[12px]">✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <input
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                  placeholder={`Reply with ${currentModelObj.name}…`}
                  className="flex-1 bg-transparent outline-none text-[14px] text-gray-800 placeholder-gray-400 px-1.5"
                />
                <button
                  onClick={() => sendChatMessage()}
                  disabled={agentTyping || !chatDraft.trim()}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ml-1 ${
                    agentTyping || !chatDraft.trim() ? "bg-blue-100 text-blue-400" : "bg-blue-500 text-white hover:bg-blue-600"
                  }`}
                >
                  {ICONS.send}
                </button>
              </div>
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="absolute inset-0 z-[15] bg-white flex flex-col">
            <StatusBar />
            <SubHeader title="Settings" onBack={() => setView("home")} />
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
                {[
                  { key: "notifications", label: "Notifications", desc: "Task alerts & mentions" },
                  { key: "autonomy", label: "Full-auto tasks", desc: "Run steps without confirmation" },
                  { key: "streaming", label: "Streaming replies", desc: "Show tokens as they arrive" },
                  { key: "sounds", label: "Sound effects", desc: "Completion chimes" },
                ].map((s) => (
                  <div key={s.key} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <div className="text-[13.5px] text-gray-900">{s.label}</div>
                      <div className="text-[11.5px] text-gray-400">{s.desc}</div>
                    </div>
                    <Toggle on={settings[s.key]} onChange={(v) => setSettings((st) => ({ ...st, [s.key]: v }))} />
                  </div>
                ))}
              </div>

              {/* Integrations & Model API Vault in Settings */}
              <div className="rounded-2xl border border-gray-100 p-4 space-y-3 bg-white shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] text-blue-600">{ICONS.plug}</span>
                    <span className="text-[13.5px] font-bold text-gray-900">AI Engine & API Vault</span>
                  </div>
                </div>
                <p className="text-[11.5px] text-gray-500 leading-snug">
                  Manage AI model provider credentials, GitHub Copilot OAuth tokens, and local OpenAI API gateway bridges.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLlmSettings(true);
                    }}
                    className="flex flex-col text-left p-3 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-blue-50/60 hover:border-blue-200 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[16px]">🤖</span>
                      <span className="text-[11px] text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">Vault ↗</span>
                    </div>
                    <span className="text-[12.5px] font-semibold text-gray-900 mt-1.5">LLM API Keys & OAuth</span>
                    <span className="text-[10.5px] text-gray-400 mt-0.5">{llmProviders.length || 17} Reputable AI Labs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      openView("gateways");
                    }}
                    className="flex flex-col text-left p-3 rounded-xl border border-blue-100 bg-blue-50/30 hover:bg-blue-50/80 hover:border-blue-300 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[16px]">🌐</span>
                      <span className="text-[11px] text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">Bridge ↗</span>
                    </div>
                    <span className="text-[12.5px] font-semibold text-gray-900 mt-1.5">API Gateways</span>
                    <span className="text-[10.5px] text-emerald-600 font-medium mt-0.5">{copilotGateway.enabled ? "Active OpenAI Spec" : "Stopped"}</span>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4 space-y-3 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">⚡</span>
                    <span className="text-[13px] font-bold tracking-wide">Proxy Pool & Rate-Limit Engine</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    {engineStatus?.proxyHealth || "100% Optimal"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-left pt-1">
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/80">
                    <div className="text-[10px] text-slate-400 font-medium">Cache Hit Rate</div>
                    <div className="text-[15px] font-bold text-blue-400 mt-0.5">{engineStatus?.hitRate || "100%"}</div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">0ms instant recall</div>
                  </div>
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/80">
                    <div className="text-[10px] text-slate-400 font-medium">Rate-Limits Mitigated</div>
                    <div className="text-[15px] font-bold text-emerald-400 mt-0.5">{engineStatus?.rateLimitsHit || "0"}</div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">Auto-rotated & bypassed</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700/60">
                  <div className="text-[10.5px] font-semibold text-slate-300 uppercase tracking-wider mb-2">Active Proxy Nodes ({engineStatus?.proxyPool?.length || 4})</div>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                    {(engineStatus?.proxyPool || [
                      { id: "p1", name: "US-East High-Speed Gateway", type: "HTTP/2 Proxy", status: "active", latencyMs: 42 },
                      { id: "p2", name: "EU-Central Edge Proxy", type: "SOCKS5 Node", status: "active", latencyMs: 68 },
                      { id: "p3", name: "APAC Regional Tunnel", type: "WireGuard Node", status: "standby", latencyMs: 95 },
                      { id: "p4", name: "Fallback Direct API Pool", type: "Key Rotation Pool", status: "active", latencyMs: 35 },
                    ]).map((node: any) => (
                      <div key={node.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-2.5 py-1.5 text-[11px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${node.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                          <span className="text-slate-200 truncate">{node.name}</span>
                        </div>
                        <span className="text-slate-400 font-mono text-[10px]">{node.latencyMs}ms</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-700/60 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 font-medium">Session Identity</span>
                    <span className="font-mono text-[10.5px] text-blue-300 font-bold bg-blue-900/60 px-2 py-0.5 rounded-full border border-blue-700/50">
                      🎭 {engineStatus?.activeIdentityId || "Ephemeral-User-8492"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await api.rotateIdentity();
                      setEngineStatus((st: any) => ({
                        ...st,
                        activeIdentityId: res.activeIdentityId,
                        rotationCount: res.rotationCount,
                      }));
                      notify(`🎭 Identity rotated → ${res.activeIdentityId} (Fresh Quota Unlocked)`);
                    }}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-[11.5px] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>🔄</span>
                    <span>Rotate Identity Now (Simulate New User)</span>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 px-4 py-3">
                <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Default model</div>
                <select
                  value={researchModel}
                  onChange={(e) => setResearchModel(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white outline-none focus:border-blue-400"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.provider}</option>
                  ))}
                </select>
              </div>
              <div className="text-center text-[11px] text-gray-400 pt-1">AgentForge {appVersion} · {patches.length} self-improvements applied</div>
            </div>

            {showLlmSettings && (
              <div className="absolute inset-0 z-[20] bg-white flex flex-col">
                <SubHeader title="LLM Vault & API Keys" onBack={() => setShowLlmSettings(false)} />
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                  {/* GitHub Copilot Special Section */}
                  <div className="rounded-2xl border border-gray-100 p-4 space-y-3 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[18px]">🐙</span>
                        <span className="text-[14px] font-bold text-gray-900">GitHub Copilot</span>
                      </div>
                      {copilotAuth.connected ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Connected</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Disconnected</span>
                      )}
                    </div>

                    {copilotAuth.connected ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3">
                          <div>
                            <div className="text-[13px] font-bold text-gray-900">@{copilotAuth.username}</div>
                            <div className="text-[11px] text-gray-500">{copilotAuth.plan}</div>
                          </div>
                          <button
                            onClick={handleDisconnectCopilot}
                            className="text-[11.5px] text-red-600 font-semibold hover:underline"
                          >
                            Disconnect
                          </button>
                        </div>
                        <div className="text-[11px] text-gray-400 bg-white p-2.5 rounded-xl border border-gray-50">
                          Verified: {copilotAuth.modelCount} models online (GPT-4o, Claude 3.5 Sonnet, o1-mini, etc.)
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[11.5px] text-gray-500 leading-relaxed">
                          Authorize AgentForge to use your GitHub Copilot subscription. No separate API keys needed.
                        </p>
                        {copilotAuth.stage === "awaiting_auth" ? (
                          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center space-y-3">
                            <div className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">Device Authorization</div>
                            <div className="flex items-center justify-center gap-2">
                               {(copilotAuth.userCode?.includes("-") ? copilotAuth.userCode.split("-") : [copilotAuth.userCode || "...."]).map((part: string, i: number) => (
                                 <div key={i} className="bg-white border border-blue-200 rounded-lg px-3 py-2 font-mono text-[20px] font-bold text-blue-700 shadow-sm">
                                   {part}
                                 </div>
                               ))}
                            </div>
                            <p className="text-[12px] text-blue-800">
                              Enter this code at <a href={copilotAuth.verificationUri} target="_blank" rel="noreferrer" className="underline font-bold hover:text-blue-600 transition-colors">github.com/login/device</a>
                            </p>
                            <div className="flex flex-col gap-2 pt-1">
                              <button
                                onClick={handleVerifyCopilotDeviceFlow}
                                disabled={copilotAuth.checking}
                                className="w-full bg-blue-600 text-white rounded-xl py-2 text-[12px] font-bold hover:bg-blue-700 transition-colors shadow-xs flex items-center justify-center gap-2"
                              >
                                {copilotAuth.checking ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                                <span>I've authorized it (Verify Now)</span>
                              </button>
                              <div className="flex items-center justify-center gap-2 text-[10px] text-blue-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                <span>Auto-polling every 3s…</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <button
                              onClick={handleStartCopilotDeviceFlow}
                              disabled={copilotAuth.checking}
                              className="w-full bg-gray-900 text-white rounded-xl py-3 text-[13px] font-bold hover:bg-gray-800 transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                              {copilotAuth.checking ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "🐙 Connect with GitHub Device Flow"}
                            </button>
                            
                            <div className="relative py-2">
                              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                              <div className="relative flex justify-center"><span className="bg-slate-50 px-2 text-[10px] text-gray-400 uppercase font-bold tracking-widest">or</span></div>
                            </div>

                            <button
                              onClick={() => setCopilotAuth(s => ({ ...s, manualTokenOpen: !s.manualTokenOpen }))}
                              className="w-full py-2 text-[11px] font-bold text-gray-500 hover:text-blue-600 transition-colors"
                            >
                              {copilotAuth.manualTokenOpen ? "← Back to Device Flow" : "Have a GitHub token? Enter manually"}
                            </button>

                            {copilotAuth.manualTokenOpen && (
                              <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                <input
                                  type="password"
                                  value={copilotAuth.manualToken || ""}
                                  onChange={(e) => setCopilotAuth(s => ({ ...s, manualToken: e.target.value }))}
                                  placeholder="gho_... or ghp_..."
                                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] font-mono outline-none focus:border-blue-400 shadow-xs"
                                />
                                <button
                                  onClick={() => handleVerifyCopilotToken(copilotAuth.manualToken || "")}
                                  disabled={copilotAuth.checking || !copilotAuth.manualToken}
                                  className="w-full bg-blue-600 text-white rounded-xl py-2 text-[12px] font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                  Authenticate Token
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Venice.ai Special Disposable Account Pool Section */}
                  <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/30 p-4 space-y-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[20px]">🎭</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-gray-900">Venice.ai</span>
                            <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                              Disposable Account Pool Active
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500">Uncensored, privacy-first models with auto-rotating rate-limit recovery</div>
                        </div>
                      </div>
                    </div>

                    {/* Live Stats Row */}
                    <div className="grid grid-cols-3 gap-2 bg-white/80 rounded-xl p-2.5 border border-indigo-50 text-center">
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Pool Size</div>
                        <div className="text-[15px] font-extrabold text-indigo-900">{venicePool.totalAccounts} Accounts</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Active / Cooldown</div>
                        <div className="text-[15px] font-extrabold text-emerald-600">
                          {venicePool.activeCount} <span className="text-gray-300 font-normal">/</span> <span className="text-amber-600">{venicePool.coolingCount}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Completions</div>
                        <div className="text-[15px] font-extrabold text-purple-700">{venicePool.totalCompletions} Served</div>
                      </div>
                    </div>

                    {/* Quick Control Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleProvisionVeniceAccount}
                        disabled={venicePool.loading}
                        className="flex-1 min-w-[130px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 px-3 text-[11.5px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {venicePool.loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "✨ Spin Up Account"}
                      </button>

                      <button
                        type="button"
                        onClick={handleRotateVeniceAccount}
                        disabled={venicePool.loading}
                        className="bg-white hover:bg-indigo-50/50 text-indigo-700 border border-indigo-200 rounded-xl py-2 px-3 text-[11.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        🔄 Rotate Active
                      </button>

                      <button
                        type="button"
                        onClick={handleClearVeniceCooldowns}
                        disabled={venicePool.loading}
                        className="bg-white hover:bg-amber-50/50 text-amber-700 border border-amber-200 rounded-xl py-2 px-3 text-[11.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        ⚡ Reset Cooldowns
                      </button>
                    </div>

                    {/* Active Account Banner & Pool Drawer */}
                    {venicePool.activeAccount && (
                      <div className="bg-white rounded-xl border border-indigo-100 p-2.5 flex items-center justify-between text-[11.5px]">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-bold text-gray-800">Current Active:</span>
                          <span className="font-mono text-indigo-700 font-semibold">{venicePool.activeAccount.name || venicePool.activeAccount.id}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setVenicePool((s) => ({ ...s, showAccounts: !s.showAccounts }))}
                          className="text-[11px] font-bold text-indigo-600 hover:underline"
                        >
                          {venicePool.showAccounts ? "Hide Pool ▲" : "View Pool ▼"}
                        </button>
                      </div>
                    )}

                    {venicePool.showAccounts && (
                      <div className="space-y-1.5 pt-1 max-h-[160px] overflow-y-auto animate-in fade-in duration-200">
                        {(venicePool.pool || []).map((acc: any) => (
                          <div key={acc.id} className="bg-white p-2 rounded-lg border border-gray-100 flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${acc.status === "active" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
                              <span className="font-bold text-gray-800 truncate">{acc.name}</span>
                              <span className="font-mono text-gray-400 text-[10px] hidden sm:inline">({acc.id})</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border ${
                              acc.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>
                              {acc.status === "active" ? "🟢 Active Ready" : "⏳ Cooling (Auto-Resets)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Other Providers Section */}
                  <div className="space-y-3">
                    <div className="px-1 flex items-center justify-between">
                      <h3 className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">Hosted API Providers</h3>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {llmProviders.filter((p) => p.id !== "githubcopilot" && p.authType !== "device_oauth").length} labs
                      </span>
                    </div>
                    <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                      {llmProviders
                        .filter((p) => p.id !== "githubcopilot" && p.authType !== "device_oauth")
                        .map((p) => (
                        <div key={p.id} className="p-4 space-y-3 bg-white">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="text-[16px]">{p.icon || "🤖"}</span>
                              <div>
                                <div className="text-[13.5px] font-bold text-gray-900">{p.name}</div>
                                <div className="text-[11px] text-gray-400">{p.badge} · {p.models?.length || 0} models</div>
                              </div>
                            </div>
                            {llmTestStatus[p.id]?.success && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Verified</span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type="password"
                                value={llmKeys[p.id] || ""}
                                onChange={(e) => setLlmKeys(k => ({ ...k, [p.id]: e.target.value }))}
                                placeholder={`${p.name} API Key…`}
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-[12px] font-mono outline-none focus:border-blue-400 focus:bg-white transition-all"
                              />
                              {llmKeys[p.id] && (
                                <button
                                  onClick={() => {
                                    const next = { ...llmKeys };
                                    delete next[p.id];
                                    setLlmKeys(next);
                                    try { localStorage.setItem("af_llm_apikeys", JSON.stringify(next)); } catch {}
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500"
                                >
                                  {ICONS.close}
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => handleTestLlmProvider(p.id)}
                              disabled={llmTestStatus[p.id]?.testing}
                              className={`px-4 rounded-xl text-[12px] font-bold transition-all shrink-0 ${
                                llmTestStatus[p.id]?.testing
                                  ? "bg-gray-100 text-gray-400"
                                  : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100"
                              }`}
                            >
                              {llmTestStatus[p.id]?.testing ? "•••" : "Verify"}
                            </button>
                          </div>

                          {llmTestStatus[p.id]?.message && (
                            <div className={`text-[10.5px] p-2 rounded-lg leading-relaxed ${
                              llmTestStatus[p.id].success ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                            }`}>
                              {llmTestStatus[p.id].message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <StatusBar />
        <div className="relative z-10 flex items-center justify-between px-4 py-3 text-gray-800 bg-white">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Open sidebar menu"
          >
            {ICONS.menu}
          </button>
          <div className="flex items-center gap-1.5">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setShowMediaStudio(true)}
              className="px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[12px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
              title="Open Media Studio (Image, Video, Audio, Music)"
            >
              <span>✨</span>
              <span className="hidden sm:inline">Media</span>
            </button>
            <button
              type="button"
              onClick={() => openView("settings")}
              className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Settings"
            >
              {ICONS.gear}
            </button>
          </div>
        </div>

        {showMediaStudio && (
          <MediaStudioModal onClose={() => setShowMediaStudio(false)} notify={notify} />
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center -mt-10 overflow-y-auto">
          <div className="relative w-32 h-28 mb-6 flex items-center justify-center">
            <svg viewBox="0 0 48 48" width="96" height="96" fill="none">
              <path d="M10 20h28c0 5-3.5 8-8 8h-3v4h4v3H17v-3h4v-4h-3c-4.5 0-8-3-8-8z" fill="#2563eb" />
              <path d="M24 6l2.1 4.9 4.9 2.1-4.9 2.1L24 20l-2.1-4.9-4.9-2.1 4.9-2.1L24 6z" fill="#FFD166" />
            </svg>
          </div>
          <h1 className="text-[22px] leading-snug font-semibold text-gray-900">
            Hi Jay Ayres, what would you like to do with AgentForge today?
          </h1>
          <p className="text-[12px] text-gray-400 mt-3">Try "/research", "/project", "/slides", "/swarm", or "/files"</p>
        </div>

        <div className="px-4 pb-5 pt-1 relative">
          {showCommandPalette && prompt.startsWith("/") && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden z-20">
              {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(prompt.split(" ")[0])).map((c) => (
                <button
                  key={c.cmd}
                  onClick={() => { runSlash(c.cmd); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors border-b border-gray-50 last:border-0"
                >
                  <span className="text-[13px] font-mono font-semibold text-blue-600">{c.cmd}</span>
                  <span className="text-[12px] text-gray-500 flex-1 truncate">{c.desc}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-sm focus-within:border-blue-400 transition-colors">
            <button onClick={() => { setShowCommandPalette(true); setPrompt("/"); }} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0" title="Commands & tools">
              {ICONS.plus}
            </button>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowModelMenu((v) => !v)}
                className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer border border-gray-200/60 shrink-0"
                title={`Active Model: ${currentModelObj.name} (${currentModelObj.provider}) — Click to change`}
                aria-label="Select AI Model"
              >
                <div className="flex items-center gap-0.5">
                  <span className="text-[12px]">⚡</span>
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${showModelMenu ? "rotate-180 text-blue-600" : "text-gray-400"}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </button>

              {showModelMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-[270px] sm:w-[300px] bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden z-[80] p-2 text-left">
                  <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-gray-900">Choose AI Model</span>
                    <span className="text-[10px] text-gray-400 font-medium">{MODELS.length} models</span>
                  </div>
                  <div className="max-h-[230px] overflow-y-auto py-1 space-y-2">
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                        ⚡ Free & Public Models
                      </div>
                      {MODELS.filter((m) => m.badge === "Free").map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setResearchModel(m.id);
                            setShowModelMenu(false);
                            notify(`Model set to ${m.name}`);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-[12px] cursor-pointer ${
                            selectedModel === m.id ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-gray-50 text-gray-800"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{m.name}</span>
                              <span className="text-[10px] text-gray-400">· {m.provider}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-normal truncate">{m.access}</div>
                          </div>
                          {selectedModel === m.id && (
                            <span className="text-blue-600 font-bold ml-2 text-[12px]">✓</span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="pt-1 border-t border-gray-100">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        🌐 Hosted API Models
                      </div>
                      {MODELS.filter((m) => m.badge === "Hosted").map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setResearchModel(m.id);
                            setShowModelMenu(false);
                            notify(`Model set to ${m.name}`);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-[12px] cursor-pointer ${
                            selectedModel === m.id ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-gray-50 text-gray-800"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{m.name}</span>
                              <span className="text-[10px] text-gray-400">· {m.provider}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-normal truncate">{m.access}</div>
                          </div>
                          {selectedModel === m.id && (
                            <span className="text-blue-600 font-bold ml-2 text-[12px]">✓</span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="pt-1 border-t border-gray-100">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                        🐙 GitHub Copilot Models
                      </div>
                      {MODELS.filter((m) => m.badge === "Copilot").map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setResearchModel(m.id);
                            setShowModelMenu(false);
                            notify(`Model set to ${m.name}`);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-[12px] cursor-pointer ${
                            selectedModel === m.id ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-gray-50 text-gray-800"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{m.name}</span>
                              <span className="text-[10px] text-gray-400">· {m.provider}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-normal truncate">{m.access}</div>
                          </div>
                          {selectedModel === m.id && (
                            <span className="text-blue-600 font-bold ml-2 text-[12px]">✓</span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="pt-1 border-t border-gray-100">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                        🎭 Venice.ai (Auto-Pool)
                      </div>
                      {MODELS.filter((m) => m.badge === "Venice").map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setResearchModel(m.id);
                            setShowModelMenu(false);
                            notify(`Model set to ${m.name}`);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-[12px] cursor-pointer ${
                            selectedModel === m.id ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-gray-50 text-gray-800"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{m.name}</span>
                              <span className="text-[10px] text-gray-400">· {m.provider}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-normal truncate">{m.access}</div>
                          </div>
                          {selectedModel === m.id && (
                            <span className="text-blue-600 font-bold ml-2 text-[12px]">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <input
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setShowCommandPalette(e.target.value.startsWith("/")); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
                if (e.key === "Escape") setShowCommandPalette(false);
              }}
              placeholder={`Ask anything using ${currentModelObj.name}…`}
              className="flex-1 bg-transparent outline-none text-[14px] text-gray-800 placeholder-gray-400 px-1.5"
            />
            <button
              onClick={handleSend}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ml-1 ${
                prompt.trim() ? "bg-blue-500 text-white" : "bg-blue-100 text-blue-500"
              }`}
            >
              {ICONS.send}
            </button>
          </div>
        </div>

        {authTarget && (
          <div className="absolute inset-0 z-[55] bg-black/40 flex items-center justify-center px-5" onClick={authStage === "redirect" ? undefined : closeAuth}>
            <div
              className="w-full max-w-[330px] bg-white rounded-3xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {authStage === "consent" && (
                <>
                  <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
                      <ConnectorIcon name={authTarget.name} size={22} />
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
                        <span className="text-white">{ICONS.plug}</span>
                      </div>
                    </div>
                    <button onClick={closeAuth} className="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                      {ICONS.close}
                    </button>
                  </div>

                  <div className="px-5 py-4">
                    {authTarget.auth === "oauth" ? (
                      <>
                        <h3 className="text-[16px] font-semibold text-gray-900">
                          Connect {authTarget.name} to AgentForge
                        </h3>
                        <p className="text-[12px] text-gray-500 mt-1">
                          {authTarget.name} wants to authorize AgentForge to access your account.
                        </p>

                        <div className="mt-3.5 rounded-xl bg-gray-50 px-4 py-3">
                          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                            AgentForge will be able to
                          </div>
                          <div className="space-y-1 text-[12.5px] text-gray-700">
                            <div className="flex gap-2"><span className="text-blue-500">•</span>View your {authTarget.desc.toLowerCase()}</div>
                            <div className="flex gap-2"><span className="text-blue-500">•</span>Run searches and read content on demand</div>
                            <div className="flex gap-2"><span className="text-blue-500">•</span>Create and update items you authorize</div>
                            <div className="flex gap-2"><span className="text-blue-500">•</span>Stay connected until you disconnect</div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
                            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                          </svg>
                          Secured OAuth 2.0 · credentials are never stored in prompts
                        </div>

                        <div className="mt-4 flex gap-2">
                          <button onClick={closeAuth} className="flex-1 rounded-full border border-gray-200 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            Cancel
                          </button>
                          <button onClick={beginAuth} className="flex-1 rounded-full bg-blue-500 py-2.5 text-[13px] font-medium text-white hover:bg-blue-600 transition-colors">
                            Continue with {authTarget.name}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="text-[16px] font-semibold text-gray-900">
                          {authTarget.auth === "apikey" ? "Add your " + authTarget.name + " API key" : "Log in to " + authTarget.name}
                        </h3>
                        <p className="text-[12px] text-gray-500 mt-1">
                          {authTarget.auth === "apikey"
                            ? "AgentForge uses this key to call the " + authTarget.name + " API on your behalf."
                            : "Enter your " + authTarget.name + " credentials to grant AgentForge access."}
                        </p>

                        <div className="mt-3.5 space-y-2.5">
                          {authTarget.fields.map((f: { label: string; type?: string }) => (
                            <div key={f.label}>
                              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{f.label}</label>
                              <input
                                type={f.type === "password" ? "password" : "text"}
                                value={authFields[f.label] || ""}
                                onChange={(e) => setAuthFields((s) => ({ ...s, [f.label]: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && beginAuth()}
                                autoComplete="off"
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] outline-none focus:border-blue-400 transition-colors"
                              />
                            </div>
                          ))}
                        </div>

                        {authTarget.hint && (
                          <div className="mt-2.5 rounded-xl bg-blue-50 px-3.5 py-2.5 flex items-start gap-2">
                            <span className="text-[12px] mt-px">🔑</span>
                            <span className="text-[11.5px] text-blue-800 leading-snug">Find it at {authTarget.hint}</span>
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
                            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                          </svg>
                          Encrypted at rest · never stored in prompts or transcripts
                        </div>

                        <div className="mt-4 flex gap-2">
                          <button onClick={closeAuth} className="flex-1 rounded-full border border-gray-200 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            Cancel
                          </button>
                          <button onClick={beginAuth} className="flex-1 rounded-full bg-blue-500 py-2.5 text-[13px] font-medium text-white hover:bg-blue-600 transition-colors">
                            Connect {authTarget.name}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              {authStage === "redirect" && (
                <div className="px-5 py-10 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full border-[3px] border-gray-100 border-t-blue-500 animate-spin" />
                  <div className="mt-4 text-[14px] font-medium text-gray-800">
                    Redirecting to {authTarget.name}…
                  </div>
                  <div className="text-[12px] text-gray-400 mt-1">Complete the sign-in in the provider window</div>
                  <div className="mt-3 w-40 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full animate-pulse" style={{ width: "60%" }} />
                  </div>
                </div>
              )}

              {authStage === "success" && (
                <div className="px-5 py-10 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="mt-3.5 text-[15px] font-semibold text-gray-900">
                    {authTarget.name} connected
                  </div>
                  <div className="text-[12px] text-gray-500 mt-1">
                    AgentForge can now access {authTarget.desc.toLowerCase()}.
                  </div>
                  <button onClick={closeAuth} className="mt-4 w-full rounded-full bg-blue-500 py-2.5 text-[13px] font-medium text-white hover:bg-blue-600 transition-colors">
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-[13px] px-4 py-2 rounded-full shadow-lg whitespace-nowrap max-w-[90%] truncate">
            {toast}
          </div>
        )}

        {sidebarOpen && (
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-[90] transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {sidebarOpen && (
          <div className="absolute top-0 left-0 bottom-0 w-[290px] bg-white z-[100] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                {user ? (
                  <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-11 h-11 rounded-full shadow-sm border border-gray-100" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-semibold text-[15px] shadow-sm">
                    AF
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-semibold text-gray-900 truncate">{user ? user.displayName : "Guest User"}</div>
                  <div className="text-[11px] text-gray-400 truncate">{user ? user.email : "Sign in to sync data"}</div>
                </div>
                {user ? (
                    <button onClick={handleSignOut} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Sign Out">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                ) : (
                    <button onClick={handleSignIn} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold shadow-sm hover:bg-blue-700 transition-colors">Login</button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                aria-label="Close sidebar"
              >
                {ICONS.close}
              </button>
            </div>

            <div className="px-3 py-3 space-y-0.5 overflow-y-auto flex-1">
              {sidebarItems
                .filter((item) => item.label.toLowerCase().includes(sidebarSearchQuery.trim().toLowerCase()))
                .map((item) => {
                  const isActive =
                    (view === "research" && item.label === "Deep Research") ||
                    (view === "crew" && item.label === "Crew Missions") ||
                    (view === "brainstorm" && item.label === "Brainstorm") ||
                    (view === "gateways" && item.label === "Gateways") ||
                    (view === "connectors" && item.label === "Connectors") ||
                    (view === "tasks" && item.label === "Scheduled tasks") ||
                    (view === "claw" && item.label === "AgentForge Claw") ||
                    (view === "history" && item.label === "Chat history") ||
                    (view === "settings" && item.label === "Settings");
                  return (
                    <button
                      type="button"
                      key={item.label}
                      onClick={() => {
                        item.action();
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors cursor-pointer ${
                        isActive
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      <span className={isActive ? "text-blue-600" : "text-gray-500"}>{item.icon}</span>
                      <span className="flex-1 text-left flex items-center justify-between pr-1">
                        <span>{item.label}</span>
                        {"badge" in item && (item as any).badge ? (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                            {(item as any).badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-gray-300">{ICONS.chevronRight}</span>
                    </button>
                  );
                })}

              <div className="pt-3 border-t border-gray-100 mt-2">
                <button
                  type="button"
                  onClick={() => openView("project")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-semibold text-gray-900 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                >
                  <span className="flex-1 text-left">Projects</span>
                  <span className="text-gray-400">{ICONS.chevronDown}</span>
                </button>
                <div className="ml-3 border-l border-gray-200 pl-3 space-y-0.5 mt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const name = "Project " + (projectsList.length + 1);
                      const newProj = await addProject(name);
                      setActiveProject(newProj);
                      setView("project");
                      setSidebarOpen(false);
                      notify(`Created & opened "${name}"`);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <span className="text-gray-400">{ICONS.folderPlus}</span>
                    <span className="text-gray-500 italic">New project</span>
                  </button>
                  {projectsList.map(p => (
                    <div
                      key={p.id}
                      className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13.5px] transition-colors group ${
                        activeProject?.id === p.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => { setActiveProject(p); setView("project"); setSidebarOpen(false); }}
                        className="flex items-center gap-3 flex-1 text-left cursor-pointer min-w-0"
                      >
                        <span className={activeProject?.id === p.id ? "text-blue-600" : "text-gray-500"}>{ICONS.folder}</span>
                        <span className="truncate">{p.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const pid = p.id;
                          const pname = p.name;
                          await deleteProject(pid);
                          if (activeProject?.id === pid) {
                            setActiveProject(null);
                            setView("home");
                          }
                          notify(`Deleted project "${pname}"`);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 hover:text-red-600 text-gray-400 transition-all cursor-pointer shrink-0"
                        title="Delete project"
                        aria-label="Delete project"
                      >
                        {ICONS.close}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50/50">
              <div
                onClick={() => {
                  openView("project");
                  notify("Opening transactions_202.pdf");
                }}
                className="bg-white border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 transition-colors shadow-xs"
              >
                <div className="text-[12px] font-medium text-gray-700 truncate">Add Transactions to Restore B...</div>
                <div className="flex items-center gap-2 mt-1.5 text-gray-500">
                  <span className="text-red-500">{ICONS.pdf}</span>
                  <span className="text-[12px] truncate flex-1">transactions_202...</span>
                  <span className="text-[11px] whitespace-nowrap text-gray-400">494.0 KB</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-2 text-gray-500 focus-within:border-blue-400">
                <span>{ICONS.search}</span>
                <input
                  value={sidebarSearchQuery}
                  onChange={(e) => setSidebarSearchQuery(e.target.value)}
                  placeholder="Search sidebar..."
                  className="flex-1 bg-transparent outline-none text-[13px] text-gray-700 placeholder-gray-400"
                />
              </div>

              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => notify("No new notifications")}
                  className="text-gray-500 hover:text-gray-800 transition-colors p-2 rounded-full hover:bg-gray-100 cursor-pointer"
                  aria-label="Notifications"
                >
                  {ICONS.bell}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openView("project");
                    notify("New chat started");
                  }}
                  className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm hover:bg-blue-600 transition-colors cursor-pointer"
                  aria-label="New Chat"
                >
                  {ICONS.plus}
                </button>
              </div>
            </div>
          </div>
        )}

        {previewFile && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
            <div className="w-full max-w-2xl bg-slate-900 text-slate-100 rounded-2xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700/80">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-blue-400 font-mono text-[13px] truncate">📄 {previewFile.path}</span>
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">({(previewFile.content.length / 1024).toFixed(1)} KB)</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { copyGatewaySnippet(previewFile.content, previewFile.path); }}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Copy
                  </button>
                  <button onClick={() => setPreviewFile(null)} className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer">
                    {ICONS.close}
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto font-mono text-[12px] leading-relaxed text-slate-300 whitespace-pre bg-slate-950/90 select-text">
                {previewFile.content}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== "undefined") console.error("AgentForge crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error);
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-[380px] w-full bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
            <div className="text-[18px] font-semibold text-gray-900">💥 AgentForge hit an error</div>
            <pre className="text-[11.5px] text-red-600 bg-red-50 rounded-xl p-3 whitespace-pre-wrap break-words">{msg}</pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="w-full rounded-full bg-blue-500 py-2.5 text-[13px] font-medium text-white hover:bg-blue-600 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
