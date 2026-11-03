import React, { useState, useEffect, useRef, useMemo } from "react";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  goal: string;
  skill: string;
  tags: string[];
}

export interface MissionStepInfo {
  stepIndex: number; // 0 to 3
  stepName: string;
  stepDetail: string;
  stepPercent: number; // 0 to 100
  updatedAt?: number;
}

export interface CrewMissionOutput {
  agentId: string;
  agentName: string;
  agentRole: string;
  emoji: string;
  modelId?: string;
  modelName?: string;
  output: string;
}

export interface AgentMissionOrbitProps {
  roster: Agent[];
  statuses: string[]; // "idle" | "queued" | "working" | "done"
  agentSteps?: Record<string, MissionStepInfo>;
  missionGoal?: string;
  missionState?: "idle" | "running" | "done" | "stopped";
  missionRound?: number;
  successScore?: number;
  domainName?: string;
  selfHealingActive?: boolean;
  selfHealingEvents?: number;
  agentOutputs?: CrewMissionOutput[];
  getAgentModel?: (agentId: string) => string;
  getModelName?: (modelId: string) => string;
  onSelectAgent?: (agentId: string) => void;
  onOpenModelPicker?: (agentId: string) => void;
  onStopMission?: () => void;
  onResumeMission?: () => void;
  className?: string;
}

export const AGENT_PROCESS_STEPS = [
  {
    id: 0,
    title: "Context & Objective Ingestion",
    short: "Context Ingestion",
    desc: "Deconstructs mission goal, input constraints, and inter-agent dependencies.",
    icon: "🧭",
  },
  {
    id: 1,
    title: "Domain Inference & Synthesis",
    short: "Model Inference",
    desc: "Executes deep reasoning with allocated neural model to generate domain solution.",
    icon: "⚡",
  },
  {
    id: 2,
    title: "Peer Cross-Validation",
    short: "Cross-Validation",
    desc: "Verifies logic, checks edge cases, and aligns with other crew outputs.",
    icon: "🛡️",
  },
  {
    id: 3,
    title: "Deliverable Finalization",
    short: "Final Deliverable",
    desc: "Packages crisp executive recommendations into the consolidated deliverable.",
    icon: "📦",
  },
];

export function AgentMissionOrbit({
  roster,
  statuses = [],
  agentSteps = {},
  missionGoal = "Autonomous Multi-Agent Mission",
  missionState = "idle",
  missionRound = 1,
  successScore = 0,
  domainName,
  selfHealingActive = true,
  selfHealingEvents = 0,
  agentOutputs = [],
  getAgentModel,
  getModelName,
  onSelectAgent,
  onOpenModelPicker,
  onStopMission,
  onResumeMission,
  className = "",
}: AgentMissionOrbitProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const [orbitSpeed, setOrbitSpeed] = useState<number>(1); // 0.5, 1, 2
  const [orbitAngle, setOrbitAngle] = useState(0);
  const [focusActiveAgent, setFocusActiveAgent] = useState(false);
  const [hudView, setHudView] = useState<"timeline" | "output">("timeline");

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  const n = roster.length || 1;
  const anyWorking = statuses.includes("working") || missionState === "running";
  const allDone = missionState === "done" || (statuses.length > 0 && statuses.every((s) => s === "done"));
  const isStopped = missionState === "stopped";
  const workingIndex = statuses.findIndex((s) => s === "working");
  const activeAgent = workingIndex !== -1 ? roster[workingIndex] : null;

  // Auto-select working agent if user hasn't explicitly selected one
  useEffect(() => {
    if (activeAgent && (!selectedAgentId || !roster.some((a) => a.id === selectedAgentId))) {
      setSelectedAgentId(activeAgent.id);
    } else if (!selectedAgentId && roster.length > 0) {
      setSelectedAgentId(roster[0].id);
    }
  }, [activeAgent, selectedAgentId, roster]);

  // Smooth orbital animation loop
  useEffect(() => {
    const updateOrbit = (time: number) => {
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (orbitPlaying && !focusActiveAgent) {
        // Base speed: 360 deg in 28 seconds at 1x
        const degPerSec = (360 / 28) * orbitSpeed;
        setOrbitAngle((prev) => (prev + degPerSec * delta) % 360);
      } else if (focusActiveAgent && activeAgent) {
        // Lock camera so active agent is positioned at the top (-90 degrees)
        const targetAngle = -((360 / n) * workingIndex);
        setOrbitAngle(targetAngle);
      }

      animRef.current = requestAnimationFrame(updateOrbit);
    };

    lastTimeRef.current = performance.now();
    animRef.current = requestAnimationFrame(updateOrbit);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [orbitPlaying, orbitSpeed, focusActiveAgent, activeAgent, workingIndex, n]);

  // Compute overall mission progress (0 - 100%)
  const overallProgress = useMemo(() => {
    if (roster.length === 0) return 0;
    if (allDone) return 100;
    let totalProgress = 0;
    roster.forEach((a, idx) => {
      const st = statuses[idx] || "idle";
      if (st === "done") {
        totalProgress += 100;
      } else if (st === "working") {
        const stepInfo = agentSteps[a.id];
        totalProgress += stepInfo ? Math.max(15, Math.min(95, stepInfo.stepPercent)) : 45;
      }
    });
    return Math.round(totalProgress / roster.length);
  }, [roster, statuses, allDone, missionState, agentSteps]);

  // Selected agent details
  const currentInspectorAgent = roster.find((a) => a.id === selectedAgentId) || roster[0] || null;
  const currentInspectorIndex = currentInspectorAgent ? roster.findIndex((a) => a.id === currentInspectorAgent.id) : -1;
  const currentInspectorStatus = currentInspectorIndex !== -1 ? (statuses[currentInspectorIndex] || "idle") : "idle";
  const currentInspectorStep = currentInspectorAgent ? agentSteps[currentInspectorAgent.id] : null;
  const currentInspectorOutput = currentInspectorAgent ? agentOutputs.find((o) => o.agentId === currentInspectorAgent.id) : null;

  // Geometry dimensions
  const viewSize = 310;
  const center = viewSize / 2;
  const orbitRadius = 106;

  // Active agent coords for laser beam
  const activeAgentCoords = useMemo(() => {
    if (workingIndex === -1) return null;
    const baseAngle = (360 / n) * workingIndex;
    const angleRad = ((baseAngle + orbitAngle - 90) * Math.PI) / 180;
    return {
      x: center + orbitRadius * Math.cos(angleRad),
      y: center + orbitRadius * Math.sin(angleRad),
    };
  }, [workingIndex, n, orbitAngle, center, orbitRadius]);

  return (
    <div className={`w-full rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 text-white p-3.5 border border-slate-800 shadow-xl overflow-hidden font-sans ${className}`}>
      {/* Header bar with mission title, autonomous status & controls */}
      <div className="border-b border-slate-800/80 pb-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center justify-center w-2 h-2 rounded-xl ${
                isStopped ? "bg-amber-400" : anyWorking ? "bg-blue-400 animate-pulse" : "bg-emerald-400"
              }`} />
              <span className="text-[10px] font-bold tracking-tight text-blue-400">
                Autonomous mission
              </span>
              <span className="text-[10px] font-bold text-slate-400 tracking-tight">
                Round {missionRound}
              </span>
              <span className="text-[10px] font-bold text-emerald-500 tracking-tight">
                · Integrity active
              </span>
              {domainName && (
                <span className="text-[9.5px] font-medium text-slate-400 truncate hidden sm:inline">
                  · {domainName}
                </span>
              )}
            </div>
            <div className="text-[13px] font-semibold text-slate-100 truncate mt-0.5">
              {missionGoal}
            </div>
          </div>

          {/* Action Buttons: Stop / Resume & Orbit Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {missionState === "running" && onStopMission && (
              <button
                type="button"
                onClick={onStopMission}
                className="px-2.5 py-1 rounded-md text-[10.5px] font-bold bg-red-600 hover:bg-red-700 text-white border border-red-500 shadow-sm transition-all cursor-pointer flex items-center gap-1 animate-pulse"
                title="Stop the autonomous loop immediately"
              >
                <span>⏹ Stop Mission</span>
              </button>
            )}

            {missionState === "stopped" && onResumeMission && (
              <button
                type="button"
                onClick={onResumeMission}
                className="px-2.5 py-1 rounded-md text-[10.5px] font-bold bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 shadow-sm transition-all cursor-pointer flex items-center gap-1"
                title="Resume the mission"
              >
                <span>▶ Resume</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOrbitPlaying((p) => !p)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors cursor-pointer ${
                orbitPlaying
                  ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
                  : "bg-blue-600 border-blue-500 text-white font-semibold"
              }`}
              title={orbitPlaying ? "Pause orbit rotation" : "Resume orbit rotation"}
            >
              {orbitPlaying ? "⏸" : "▶"}
            </button>

            <button
              type="button"
              onClick={() => {
                const speeds = [0.5, 1, 2];
                const nextIndex = (speeds.indexOf(orbitSpeed) + 1) % speeds.length;
                setOrbitSpeed(speeds[nextIndex]);
              }}
              className="px-1.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-[10px] font-mono text-slate-300 cursor-pointer"
              title="Toggle orbital speed"
            >
              {orbitSpeed}x
            </button>

            {anyWorking && (
              <button
                type="button"
                onClick={() => setFocusActiveAgent((f) => !f)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors cursor-pointer ${
                  focusActiveAgent
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold"
                    : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
                title="Lock focus onto the active agent"
              >
                🎯 Focus
              </button>
            )}
          </div>
        </div>

        {/* Real-time Success & Quality Gate Telemetry Bar */}
        <div className="flex items-center justify-between text-[10px] bg-slate-950/60 rounded-lg px-2.5 py-1.5 border border-slate-800/70">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Quality Gate:</span>
            <div className="w-24 bg-slate-800 rounded-xl h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-xl transition-all duration-500 ${
                  (successScore || 0) >= 100
                    ? "bg-emerald-400"
                    : (successScore || 0) >= 80
                    ? "bg-blue-400"
                    : "bg-amber-400"
                }`}
                style={{ width: `${Math.max(5, Math.min(100, successScore || (overallProgress * 0.95)))}%` }}
              />
            </div>
            <span className="font-mono font-bold text-slate-200">
              {Math.round(successScore || (overallProgress * 0.95))}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Loop Status:</span>
            <span className={`font-semibold ${
              allDone
                ? "text-emerald-400"
                : isStopped
                ? "text-amber-400"
                : "text-blue-400 animate-pulse"
            }`}>
              {allDone ? "100% Certified Complete" : isStopped ? "Stopped by User" : "Autonomous Iteration Active"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Orbital Canvas */}
      <div className="relative mx-auto my-1 flex items-center justify-center select-none" style={{ width: viewSize, height: viewSize }}>
        {/* Radar Background Grids & Rings */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${viewSize} ${viewSize}`}
        >
          <defs>
            <radialGradient id="missionGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="60%" stopColor="#1e3a8a" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="beamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.3" />
            </linearGradient>
            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Ambient Glow Disk */}
          <circle cx={center} cy={center} r={orbitRadius + 28} fill="url(#missionGlow)" />

          {/* Concentric Coordinate Rings */}
          <circle cx={center} cy={center} r={48} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
          <circle cx={center} cy={center} r={78} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="2 6" opacity="0.4" />
          
          {/* Main Trajectory Orbit Track */}
          <circle
            cx={center}
            cy={center}
            r={orbitRadius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="3"
          />
          <circle
            cx={center}
            cy={center}
            r={orbitRadius}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="4 8"
            opacity={anyWorking ? "0.85" : "0.35"}
          />

          {/* Coordinate Crosshairs */}
          <line x1={center} y1={center - orbitRadius - 20} x2={center} y2={center + orbitRadius + 20} stroke="#1e293b" strokeWidth="1" strokeDasharray="2 5" />
          <line x1={center - orbitRadius - 20} y1={center} x2={center + orbitRadius + 20} y2={center} stroke="#1e293b" strokeWidth="1" strokeDasharray="2 5" />

          {/* Active Laser / Energy Stream connecting core to active agent */}
          {activeAgentCoords && (
            <g>
              <line
                x1={center}
                y1={center}
                x2={activeAgentCoords.x}
                y2={activeAgentCoords.y}
                stroke="url(#beamGrad)"
                strokeWidth="2.5"
                filter="url(#glowFilter)"
              />
              <line
                x1={center}
                y1={center}
                x2={activeAgentCoords.x}
                y2={activeAgentCoords.y}
                stroke="#ffffff"
                strokeWidth="1"
                strokeDasharray="3 6"
              />
            </g>
          )}
        </svg>

        {/* Central Mission Reactor Core */}
        <div
          className="absolute z-20 flex flex-col items-center justify-center cursor-pointer group"
          style={{ width: 94, height: 94 }}
          onClick={() => {
            if (activeAgent) setSelectedAgentId(activeAgent.id);
          }}
          title={`Status: ${missionState} · ${overallProgress}% Completed`}
        >
          {/* Pulsating Energy Rings */}
          {anyWorking && (
            <>
              <span className="absolute w-24 h-24 rounded-xl bg-blue-500/20 animate-ping pointer-events-none" />
              <span className="absolute w-28 h-28 rounded-xl border border-blue-400/30 animate-pulse pointer-events-none" />
            </>
          )}

          {allDone && (
            <span className="absolute w-24 h-24 rounded-xl bg-emerald-500/20 pointer-events-none" />
          )}

          {/* Inner Reactor Sphere */}
          <div
            className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center p-1.5 shadow-2xl transition-all duration-300 border ${
              allDone
                ? "bg-gradient-to-br from-emerald-900/90 to-slate-900 border-emerald-500/60 shadow-emerald-500/20"
                : isStopped
                ? "bg-gradient-to-br from-amber-950/90 to-slate-900 border-amber-500/60 shadow-amber-500/20"
                : anyWorking
                ? "bg-gradient-to-br from-blue-900/90 via-indigo-950 to-slate-900 border-blue-400/80 shadow-blue-500/30"
                : "bg-slate-900/90 border-slate-700 shadow-slate-900"
            }`}
          >
            <span className="text-[19px] leading-none mb-0.5">
              {allDone ? "✅" : isStopped ? "⏸" : anyWorking ? "🚀" : "🧭"}
            </span>

            {/* Overall Percentage Gauge */}
            <span className={`text-[12px] font-black tracking-tight ${allDone ? "text-emerald-400" : isStopped ? "text-amber-400" : "text-blue-400"}`}>
              {isStopped ? "PAUSED" : `${overallProgress}%`}
            </span>

            <span className="text-[8px] font-bold tracking-tight text-slate-300 scale-90">
              {allDone ? "Certified" : isStopped ? "Stopped" : anyWorking ? `Round ${missionRound}` : "Ready"}
            </span>
          </div>
        </div>

        {/* Orbiting Agent Nodes */}
        {roster.map((agent, i) => {
          const st = statuses[i] || "idle";
          const baseAngle = (360 / n) * i;
          const currentTotalAngle = (baseAngle + orbitAngle) % 360;
          const angleRad = ((currentTotalAngle - 90) * Math.PI) / 180;
          const x = center + orbitRadius * Math.cos(angleRad);
          const y = center + orbitRadius * Math.sin(angleRad);

          const isSelected = selectedAgentId === agent.id;
          const isWorking = st === "working";
          const isDone = st === "done";

          // Calculate agent's individual progress & active step index
          const stepInfo = agentSteps[agent.id];
          let progressVal = 0;
          let currentStepIdx = 0;
          let stepLabel = "Queued";

          if (isDone) {
            progressVal = 100;
            currentStepIdx = 3;
            stepLabel = "✓ Verified";
          } else if (isWorking) {
            progressVal = stepInfo ? Math.max(15, Math.min(95, stepInfo.stepPercent)) : 45;
            currentStepIdx = stepInfo ? stepInfo.stepIndex : 1;
            stepLabel = AGENT_PROCESS_STEPS[currentStepIdx]?.short || "Inference";
          }

          // Progress circle geometry (radius = 19)
          const nodeRadius = 19;
          const circumference = 2 * Math.PI * nodeRadius;
          const strokeDashoffset = circumference - (progressVal / 100) * circumference;

          return (
            <div
              key={agent.id}
              className="absolute z-30 transition-transform duration-75 cursor-pointer"
              style={{
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
              }}
              onClick={() => {
                setSelectedAgentId(agent.id);
                if (onSelectAgent) onSelectAgent(agent.id);
              }}
              title={`${agent.name} (${agent.role}) · Status: ${st} · Progress: ${progressVal}%`}
            >
              {/* Outer Glow Halo for Active Working Agent */}
              {isWorking && (
                <span className="absolute inset-0 -m-1.5 rounded-xl bg-blue-500/40 animate-ping pointer-events-none" />
              )}

              {/* Node Card Shell */}
              <div
                className={`relative flex items-center justify-center rounded-xl transition-all duration-200 ${
                  isSelected
                    ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 scale-110 shadow-lg shadow-blue-500/30"
                    : "hover:scale-105"
                }`}
                style={{ width: 44, height: 44 }}
              >
                {/* SVG Circular Step Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 44 44">
                  {/* Track */}
                  <circle
                    cx="22"
                    cy="22"
                    r={nodeRadius}
                    fill="none"
                    stroke={isDone ? "#065f46" : isWorking ? "#1e3a8a" : "#334155"}
                    strokeWidth="3"
                    opacity="0.8"
                  />
                  {/* Dynamic Progress Meter */}
                  <circle
                    cx="22"
                    cy="22"
                    r={nodeRadius}
                    fill="none"
                    stroke={isDone ? "#10b981" : isWorking ? "#38bdf8" : "#64748b"}
                    strokeWidth="3.2"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                </svg>

                {/* Node Center Face */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-[15px] shadow-sm z-10 transition-colors ${
                    isDone
                      ? "bg-slate-900 text-emerald-300"
                      : isWorking
                      ? "bg-blue-600 text-white shadow-blue-500/50"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {agent.emoji}
                </div>

                {/* Step Indicators: 4 tiny quadrant dots */}
                <div className="absolute inset-0 pointer-events-none">
                  {[0, 1, 2, 3].map((stepIdx) => {
                    const dotAngle = (stepIdx * 90 - 45) * (Math.PI / 180);
                    const dx = 22 + 20.5 * Math.cos(dotAngle);
                    const dy = 22 + 20.5 * Math.sin(dotAngle);
                    const isStepComplete = isDone || (isWorking && currentStepIdx > stepIdx);
                    const isStepActive = isWorking && currentStepIdx === stepIdx;

                    return (
                      <span
                        key={stepIdx}
                        className={`absolute w-1.5 h-1.5 rounded-xl transition-colors ${
                          isStepComplete
                            ? "bg-emerald-400"
                            : isStepActive
                            ? "bg-blue-400 animate-pulse"
                            : "bg-slate-600/60"
                        }`}
                        style={{
                          left: dx,
                          top: dy,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    );
                  })}
                </div>

                {/* Mini Status Badge Below Node */}
                <div
                  className={`absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
                    isDone
                      ? "text-emerald-400"
                      : isWorking
                      ? "text-blue-300 font-mono"
                      : "text-slate-500"
                  }`}
                >
                  {isWorking ? `${progressVal}%` : stepLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Real-Time Step Inspector HUD Drawer */}
      {currentInspectorAgent && (
        <div className="mt-3 rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-2.5 transition-all">
          {/* Agent Meta & Model Attribution */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[17px] p-1 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                {currentInspectorAgent.emoji}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-bold text-white truncate">
                    {currentInspectorAgent.name}
                  </span>
                  <span className="text-[10.5px] text-slate-400 font-medium truncate">
                    · {currentInspectorAgent.role}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {currentInspectorAgent.goal}
                </div>
              </div>
            </div>

            {/* Model Pill & Action */}
            <div className="flex items-center gap-1.5 shrink-0">
              {getAgentModel && (
                <button
                  type="button"
                  onClick={() => onOpenModelPicker && onOpenModelPicker(currentInspectorAgent.id)}
                  className="flex items-center gap-1 cursor-pointer transition-colors"
                  title="Click to reassign LLM engine"
                >
                  <span className="text-[10px] font-bold text-blue-400 tracking-tight">
                    {getModelName
                      ? getModelName(getAgentModel(currentInspectorAgent.id))
                      : getAgentModel(currentInspectorAgent.id)}
                  </span>
                  <span className="text-[8px] text-slate-500">▼</span>
                </button>
              )}

              {/* Status Pill */}
              <span
                className={`text-[10px] font-bold tracking-tight ${
                  currentInspectorStatus === "done"
                    ? "text-emerald-500"
                    : currentInspectorStatus === "working"
                    ? "text-blue-400 animate-pulse"
                    : "text-slate-500"
                }`}
              >
                {currentInspectorStatus === "done"
                  ? "✓ Done"
                  : currentInspectorStatus === "working"
                  ? "⚡ Working"
                  : "Queued"}
              </span>
            </div>
          </div>

          {/* Tab Selector: Step Timeline vs Final Output */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 text-[11px]">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHudView("timeline")}
                className={`font-semibold transition-colors cursor-pointer pb-0.5 border-b-2 ${
                  hudView === "timeline"
                    ? "text-blue-400 border-blue-400"
                    : "text-slate-400 border-transparent hover:text-slate-200"
                }`}
              >
                Process Step Pipeline
              </button>
              {currentInspectorOutput && (
                <button
                  type="button"
                  onClick={() => setHudView("output")}
                  className={`font-semibold transition-colors cursor-pointer pb-0.5 border-b-2 ${
                    hudView === "output"
                      ? "text-emerald-400 border-emerald-400"
                      : "text-slate-400 border-transparent hover:text-slate-200"
                  }`}
                >
                  Synthesized Deliverable
                </button>
              )}
            </div>

            <div className="text-[10px] font-mono text-slate-400">
              {currentInspectorStatus === "done"
                ? "100% Complete"
                : currentInspectorStatus === "working"
                ? `${currentInspectorStep?.stepPercent || 45}% Real-Time`
                : "Standby"}
            </div>
          </div>

          {/* 4-Step Process Pipeline View */}
          {hudView === "timeline" && (
            <div className="space-y-1.5 pt-0.5">
              {AGENT_PROCESS_STEPS.map((step) => {
                const isAgentDone = currentInspectorStatus === "done";
                const isAgentWorking = currentInspectorStatus === "working";
                const activeStepIdx = currentInspectorStep ? currentInspectorStep.stepIndex : 1;

                const isStepPassed = isAgentDone || (isAgentWorking && activeStepIdx > step.id);
                const isStepCurrent = isAgentWorking && activeStepIdx === step.id;
                const isStepPending = !isAgentDone && (!isAgentWorking || activeStepIdx < step.id);

                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-2.5 rounded-lg p-2 border transition-colors ${
                      isStepCurrent
                        ? "bg-blue-950/40 border-blue-500/50"
                        : isStepPassed
                        ? "bg-slate-900/60 border-emerald-900/40 text-slate-300"
                        : "bg-slate-900/30 border-slate-900 text-slate-500"
                    }`}
                  >
                    {/* Step Icon / Status glyph */}
                    <div className="mt-0.5 shrink-0">
                      {isStepPassed ? (
                        <span className="w-4 h-4 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </span>
                      ) : isStepCurrent ? (
                        <span className="w-4 h-4 rounded-xl bg-blue-500/30 text-blue-300 flex items-center justify-center text-[10px] font-bold animate-pulse">
                          ●
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-xl bg-slate-800 text-slate-500 flex items-center justify-center text-[9px]">
                          {step.id + 1}
                        </span>
                      )}
                    </div>

                    {/* Step Text & Progress Bar */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-semibold ${isStepCurrent ? "text-blue-300" : isStepPassed ? "text-slate-200" : "text-slate-400"}`}>
                          {step.title}
                        </span>
                        <span className="text-[9.5px] font-mono">
                          {isStepPassed
                            ? "Completed"
                            : isStepCurrent
                            ? `${currentInspectorStep?.stepPercent || 50}%`
                            : "Queued"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                        {step.desc}
                      </div>

                      {/* Active Step Real-Time Progress Bar */}
                      {isStepCurrent && (
                        <div className="w-full bg-slate-800/80 rounded-xl h-1 mt-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-xl transition-all duration-300"
                            style={{ width: `${currentInspectorStep?.stepPercent || 50}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Synthesized Deliverable View */}
          {hudView === "output" && currentInspectorOutput && (
            <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5 space-y-2 text-[11px] leading-relaxed">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400 text-[10px]">
                <span>Generated via {currentInspectorOutput.modelName || currentInspectorOutput.modelId}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentInspectorOutput.output);
                  }}
                  className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                >
                  Copy Snippet
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto text-slate-200 whitespace-pre-wrap font-sans pr-1">
                {currentInspectorOutput.output}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default AgentMissionOrbit;
