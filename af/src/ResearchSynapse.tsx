import React, { useEffect, useRef, useState } from "react";

export interface ResearchSynapseProps {
  query: string;
  status: string;
  round: number;
  maxRounds: number;
  sourcesCount: number;
  subQuestions?: string[];
  sources?: Array<{ title: string; url: string; domain?: string }>;
  compact?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  probing: "probing model & engines",
  planning: "formulating strategy",
  searching: "querying search providers",
  reading: "reading webpage sources",
  analyzing: "cross-checking evidence",
  writing: "synthesizing cited report",
  done: "research complete",
  error: "research encountered issue",
  cancelled: "research halted",
};

export const ResearchSynapse: React.FC<ResearchSynapseProps> = ({
  query,
  status,
  round,
  maxRounds,
  sourcesCount,
  subQuestions = [],
  sources = [],
  compact = false,
}) => {
  const [showAscii, setShowAscii] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [animTick, setAnimTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Timer
  useEffect(() => {
    if (status === "done" || status === "cancelled" || status === "error") return;
    const interval = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Animation pulse tick
  useEffect(() => {
    const anim = setInterval(() => {
      setAnimTick((t) => (t + 1) % 1000);
    }, 60);
    return () => clearInterval(anim);
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const W = 520;
  const H = compact ? 200 : 250;
  const cx = W / 2;
  const cy = H / 2;

  // Compute branch sub-nodes
  const subsCount = Math.max(1, subQuestions.length || Math.min(round, 4));
  const subNodes = Array.from({ length: subsCount }).map((_, i) => {
    const angle = (i / subsCount) * Math.PI * 2 - Math.PI / 2;
    const rx = 140;
    const ry = 70;
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;
    const label = subQuestions[i] || `Round ${i + 1}`;
    const active = i + 1 <= round || status === "done";
    return { id: i, x, y, label, active };
  });

  // ASCII canvas renderer (from researchSynapse.js)
  useEffect(() => {
    if (!showAscii || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = 48;
    const rows = 12;
    const scale = 2;
    canvas.width = cols * scale;
    canvas.height = rows * scale;

    ctx.fillStyle = "rgb(15, 23, 42)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;

    const sx = (v: number) => (v / W) * canvas.width;
    const sy = (v: number) => (v / H) * canvas.height;

    // Center to sub nodes
    subNodes.forEach((sub, idx) => {
      ctx.beginPath();
      ctx.moveTo(sx(cx), sy(cy));
      ctx.lineTo(sx(sub.x), sy(sub.y));
      ctx.stroke();

      ctx.fillStyle = sub.active ? "rgb(56, 189, 248)" : "rgb(100, 116, 139)";
      ctx.beginPath();
      ctx.arc(sx(sub.x), sy(sub.y), 2, 0, Math.PI * 2);
      ctx.fill();

      // Traveling packet
      const progress = ((animTick * 0.02 + idx * 0.25) % 1);
      const px = cx + (sub.x - cx) * progress;
      const py = cy + (sub.y - cy) * progress;
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.beginPath();
      ctx.arc(sx(px), sy(py), 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Center node
    ctx.fillStyle = "rgb(56, 189, 248)";
    ctx.beginPath();
    ctx.arc(sx(cx), sy(cy), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }, [showAscii, animTick, subNodes, cx, cy, W, H]);

  return (
    <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-900/95 text-slate-100 overflow-hidden shadow-sm p-3">
      {/* Telemetry Header */}
      <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-800/80 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-xl bg-sky-400 animate-ping" />
          <span className="text-sky-400 font-semibold uppercase tracking-wider text-[11px]">
            {PHASE_LABELS[status] || status}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-300">
            round <b className="text-white">{round}</b>/{maxRounds || 3}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-300">
            <b className="text-emerald-400">{sourcesCount}</b> sources
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-slate-400 font-mono text-[11px]">{formatTimer(elapsed)}</span>
          <button
            type="button"
            onClick={() => setShowAscii(!showAscii)}
            className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            {showAscii ? "Graph" : "ASCII"}
          </button>
        </div>
      </div>

      {/* Visual Canvas / Graph */}
      {showAscii ? (
        <div className="flex flex-col items-center justify-center py-4 bg-slate-950 font-mono text-center">
          <canvas ref={canvasRef} className="w-[380px] h-[150px] image-rendering-pixelated border border-slate-800 rounded-lg shadow-inner" />
          <div className="text-[10px] text-slate-500 mt-2 font-mono">ODYSSEUS NEURAL TELEMETRY MATRIX</div>
        </div>
      ) : (
        <div className="relative w-full overflow-hidden flex items-center justify-center">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto max-h-[240px]">
            <defs>
              <radialGradient id="halo-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Guide orbits */}
            <ellipse cx={cx} cy={cy} rx="140" ry="70" fill="none" stroke="rgba(51, 65, 85, 0.4)" strokeDasharray="3 3" />
            <ellipse cx={cx} cy={cy} rx="70" ry="35" fill="none" stroke="rgba(51, 65, 85, 0.25)" strokeDasharray="2 2" />

            {/* Connecting Edges */}
            <g className="rs-edges">
              {subNodes.map((sub) => (
                <line
                  key={sub.id}
                  x1={cx}
                  y1={cy}
                  x2={sub.x}
                  y2={sub.y}
                  stroke={sub.active ? "rgba(56, 189, 248, 0.6)" : "rgba(71, 85, 105, 0.3)"}
                  strokeWidth={sub.active ? "1.8" : "1"}
                />
              ))}
            </g>

            {/* Moving Packets along active edges */}
            <g className="rs-packets">
              {subNodes.filter((s) => s.active).map((sub, i) => {
                const packetProg = ((animTick * 0.018 + i * 0.25) % 1);
                const px = cx + (sub.x - cx) * packetProg;
                const py = cy + (sub.y - cy) * packetProg;
                return (
                  <circle
                    key={`p-${sub.id}`}
                    cx={px}
                    cy={py}
                    r="2.5"
                    fill="#ffffff"
                    filter="url(#glow)"
                  />
                );
              })}
            </g>

            {/* Source Leaves attached to Sub-nodes */}
            <g className="rs-leaves">
              {subNodes.map((sub, i) => {
                if (!sub.active) return null;
                const leaves = Math.min(3, Math.max(1, Math.floor(sourcesCount / subsCount)));
                return Array.from({ length: leaves }).map((_, lIdx) => {
                  const angle = (lIdx - (leaves - 1) / 2) * 0.45;
                  const lx = sub.x + Math.cos(angle) * (24 + (lIdx % 2) * 6);
                  const ly = sub.y + Math.sin(angle) * (20 + (lIdx % 2) * 6);
                  return (
                    <g key={`l-${i}-${lIdx}`}>
                      <line x1={sub.x} y1={sub.y} x2={lx} y2={ly} stroke="rgba(56, 189, 248, 0.4)" strokeWidth="0.8" />
                      <circle cx={lx} cy={ly} r="3" fill="#10b981" />
                    </g>
                  );
                });
              })}
            </g>

            {/* Sub-question Nodes */}
            <g className="rs-sub-nodes">
              {subNodes.map((sub) => (
                <g key={sub.id}>
                  <circle
                    cx={sub.x}
                    cy={sub.y}
                    r={sub.active ? "9" : "6"}
                    fill={sub.active ? "#0284c7" : "#1e293b"}
                    stroke={sub.active ? "#38bdf8" : "#475569"}
                    strokeWidth="2"
                    className="transition-all duration-300"
                  />
                  <text
                    x={sub.x}
                    y={sub.y + (sub.y > cy ? 18 : -14)}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="sans-serif"
                    className="select-none pointer-events-none"
                  >
                    {sub.label.length > 20 ? sub.label.slice(0, 18) + "…" : sub.label}
                  </text>
                </g>
              ))}
            </g>

            {/* Central Root (Query) Halo & Node */}
            <g className="rs-root">
              <circle cx={cx} cy={cy} r="24" fill="url(#halo-glow)" className="animate-pulse" />
              <circle cx={cx} cy={cy} r="13" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.5" />
              <circle cx={cx} cy={cy} r="5" fill="#38bdf8" />
              <text
                x={cx}
                y={cy + 26}
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="11"
                fontWeight="bold"
                fontFamily="sans-serif"
                className="select-none pointer-events-none drop-shadow"
              >
                {query.length > 28 ? query.slice(0, 26) + "…" : query || "Deep Research"}
              </text>
            </g>
          </svg>
        </div>
      )}

      {/* Discovered Sources live ticker */}
      {sources.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-400 scrollbar-none">
          <span className="text-slate-500 font-semibold shrink-0">Scanned:</span>
          {sources.slice(-5).map((s, idx) => (
            <span
              key={idx}
              className="shrink-0 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 max-w-[140px] truncate"
              title={s.title}
            >
              🌐 {s.domain || "web"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
