import React, { useState, useMemo, useEffect } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid, ReferenceDot,
} from "recharts";

// ------------------------------------------------------------------
// This page keeps its own independent chart-window state (zoom level,
// custom window value/unit) rather than sharing the Dashboard page's —
// so switching windows here never affects, and is never affected by,
// whatever window is selected on the Dashboard tab. The constants and
// small pure helpers below are intentionally duplicated from App.jsx
// (same values) to keep this file self-contained.
// ------------------------------------------------------------------
const HOURS = 8760;
const DEFAULT_WINDOW_HOURS = 48;
const MIN_WINDOW_HOURS = 1 / 3600; // 1 second — the finest the zoom goes
const MAX_WINDOW_HOURS = HOURS - 2;
const ZOOM_FACTOR = 1.6;
const WINDOW_PRESETS = [
  { label: "1s", hours: 1 / 3600 },
  { label: "10s", hours: 10 / 3600 },
  { label: "1m", hours: 1 / 60 },
  { label: "10m", hours: 10 / 60 },
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "1 week", hours: 168 },
  { label: "1 month", hours: 730 },
  { label: "2 months", hours: 1460 },
  { label: "3 months", hours: 2190 },
  { label: "6 months", hours: 4380 },
  { label: "1 year", hours: MAX_WINDOW_HOURS },
];
const WINDOW_UNIT_HOURS = { seconds: 1 / 3600, minutes: 1 / 60, hours: 1, days: 24, weeks: 168, months: 730 };
const MAX_CHART_POINTS = 480; // cap on plotted points per chart, at any zoom level
const MIN_SAMPLE_SECONDS = 1; // finest gap between plotted points — at most 1/sec

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// Rounds a window size to something clean at its own scale — same logic as App.jsx.
function roundWindowHours(hours) {
  if (hours >= 2) return Math.round(hours);
  if (hours >= 1 / 60) return Math.round(hours * 60) / 60;
  return Math.round(hours * 3600) / 3600;
}
function interp(arr, idx, frac) { return arr[idx] + (arr[idx + 1] - arr[idx]) * frac; }
function timeToStepIndex(hourFloat, stepHours, n) {
  const raw = hourFloat / stepHours;
  const i = Math.max(0, Math.min(Math.floor(raw), n - 2));
  const f = raw - i;
  return { i, f };
}
function interpAtHour(arr, hourFloat, stepHours) {
  const { i, f } = timeToStepIndex(hourFloat, stepHours, arr.length);
  return interp(arr, i, f);
}

function Kpi({ label, value, unit, accent, big }) {
  return (
    <div style={{
      background: "#10151C", border: "1px solid #1F2A35", borderRadius: 12,
      padding: "16px 18px", flex: 1, minWidth: 140,
    }}>
      <div style={{ color: "#8B9AA8", fontSize: 11, letterSpacing: 0.3, marginBottom: 8 }}>{label}</div>
      <div style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: big ? 32 : 24, fontWeight: 600, color: accent || "#E8EEF2", lineHeight: 1,
      }}>
        {value}<span style={{ fontSize: 14, color: "#8B9AA8", marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

function Panel({ title, flex, minWidth, children }) {
  return (
    <div style={{ flex: flex ?? 1, minWidth: minWidth ?? 280, background: "#10151C", border: "1px solid #1F2A35", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#8B9AA8", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function SmallButton({ onClick, active, disabled, title, children }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      padding: "6px 10px", borderRadius: 6, cursor: disabled ? "default" : "pointer", fontSize: 11, fontWeight: 600,
      border: `1px solid ${active ? "#5EC8E8" : "#1F2A35"}`,
      background: active ? "#132530" : "#0A0E14",
      color: active ? "#5EC8E8" : disabled ? "#3A4550" : "#8B9AA8",
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

export default function RenewablesPage({
  config,
  stationName,
  snapshot,
  env,
  dispatch,
  windCurveData,
  solarCurveData,
  fmtWindowLabel,
  fmtAxisTick,
  fmtIntervalLabel,
  simIndexFloat,
  windCurveParams,
}) {
  const capacityFactorPct = config.windCapacity > 0 ? (snapshot.wind / config.windCapacity) * 100 : 0;
  const solarCapacityFactorPct = config.pvCapacity > 0 ? (snapshot.pv / config.pvCapacity) * 100 : 0;

  // Independent chart-window state — separate from the Dashboard page's.
  const [historyWindowHours, setHistoryWindowHours] = useState(DEFAULT_WINDOW_HOURS);
  const [customWindowValue, setCustomWindowValue] = useState(2);
  const [customWindowUnit, setCustomWindowUnit] = useState("days");

  const zoomIn = () => setHistoryWindowHours((w) => clamp(roundWindowHours(w / ZOOM_FACTOR), MIN_WINDOW_HOURS, MAX_WINDOW_HOURS));
  const zoomOut = () => setHistoryWindowHours((w) => clamp(roundWindowHours(w * ZOOM_FACTOR), MIN_WINDOW_HOURS, MAX_WINDOW_HOURS));
  const resetZoom = () => setHistoryWindowHours(DEFAULT_WINDOW_HOURS);
  const applyCustomWindow = () => {
    const hrs = clamp(roundWindowHours((Number(customWindowValue) || 0) * WINDOW_UNIT_HOURS[customWindowUnit]), MIN_WINDOW_HOURS, MAX_WINDOW_HOURS);
    setHistoryWindowHours(hrs);
  };

  // LIVE custom window: typing a value/unit (e.g. "5 days") updates the
  // chart window on its own, debounced briefly so typing "10" doesn't
  // flash through "1" first. The Apply button / Enter key still work for
  // an immediate, un-debounced update. This state is local to this page,
  // so it never touches or is touched by the Dashboard page's own window.
  useEffect(() => {
    const id = setTimeout(() => { applyCustomWindow(); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customWindowValue, customWindowUnit]);

  // This page's own windowed series — built straight from the raw env/
  // dispatch arrays at this page's own historyWindowHours, so it never
  // depends on (or affects) the Dashboard page's chart window.
  const { chartData, tickInterval, sampleIntervalSec } = useMemo(() => {
    const nowFloat = simIndexFloat;
    const windowStart = Math.max(0, nowFloat - historyWindowHours);
    const span = Math.max(nowFloat - windowStart, 1 / 3600000);
    const pointsForResolution = Math.ceil((span * 3600) / MIN_SAMPLE_SECONDS) + 1;
    const numPoints = Math.max(2, Math.min(MAX_CHART_POINTS, pointsForResolution));
    const data = [];
    for (let k = 0; k < numPoints; k++) {
      const t = k === numPoints - 1 ? nowFloat : windowStart + (span * k) / (numPoints - 1);
      data.push({
        h: t,
        windSpeed: Math.round(interpAtHour(env.windSpeed, t, env.stepHours) * 10) / 10,
        windOutput: Math.round(interpAtHour(dispatch.wind, t, env.stepHours)),
        irradiance: Math.round(interpAtHour(env.irradiance, t, env.stepHours)),
        pvOutput: Math.round(interpAtHour(dispatch.pv, t, env.stepHours)),
      });
    }
    const tick = Math.max(0, Math.floor(data.length / 7) - 1);
    const interval = numPoints > 1 ? (span * 3600) / (numPoints - 1) : 0;
    return { chartData: data, tickInterval: tick, sampleIntervalSec: interval };
  }, [env, dispatch, simIndexFloat, historyWindowHours]);

  // Fall back to the historical defaults if the prop isn't supplied (e.g.
  // a test harness mounting this page standalone).
  const cutIn  = windCurveParams?.cutIn  ?? 3.5;
  const rated  = windCurveParams?.rated  ?? 13.0;
  const cutOut = windCurveParams?.cutOut ?? 25.0;

  // S-curve X-axis: keep a sensible minimum span (30 m/s) but extend past
  // whatever cut-out the user has set, so the whole curve stays visible.
  const xMax = Math.max(30, Math.ceil(cutOut + 5));

  return (
    <div>
      <div style={{ color: "#8B9AA8", fontSize: 13, marginBottom: 16 }}>
        Renewable generation detail — {stationName} Station
      </div>

      {/* Chart window control — independent of the Dashboard page's window */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20,
        background: "#10151C", border: "1px solid #1F2A35", borderRadius: 10, padding: "10px 14px",
      }}>
        <span style={{ fontSize: 11, color: "#8B9AA8", marginRight: 2 }}>Chart window:</span>
        <div style={{ display: "flex", gap: 4 }}>
          <SmallButton onClick={zoomIn} disabled={historyWindowHours <= MIN_WINDOW_HOURS} title="Zoom in">− zoom in</SmallButton>
          <SmallButton onClick={zoomOut} disabled={historyWindowHours >= MAX_WINDOW_HOURS} title="Zoom out">+ zoom out</SmallButton>
          <SmallButton onClick={resetZoom} active={historyWindowHours === DEFAULT_WINDOW_HOURS} title="Back to default 48h">⟲ reset</SmallButton>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "#1F2A35" }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {WINDOW_PRESETS.map((p) => (
            <SmallButton key={p.label} onClick={() => setHistoryWindowHours(p.hours)} active={historyWindowHours === p.hours}>
              {p.label}
            </SmallButton>
          ))}
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "#1F2A35" }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="number" min={0.1} step={0.1} value={customWindowValue}
            onChange={(e) => setCustomWindowValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyCustomWindow(); }}
            style={{ width: 60, background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "5px 7px", fontSize: 12 }}
          />
          <select value={customWindowUnit} onChange={(e) => setCustomWindowUnit(e.target.value)}
            style={{ background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "5px 7px", fontSize: 12 }}>
            <option value="seconds">seconds</option>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="weeks">weeks</option>
            <option value="months">months</option>
          </select>
          <SmallButton onClick={applyCustomWindow} title="Applies immediately, skipping the short auto-apply delay">Apply</SmallButton>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#4A5560", fontFamily: "ui-monospace, monospace" }}>
          showing {fmtWindowLabel(historyWindowHours)} ({chartData.length} pts, ~{fmtIntervalLabel(sampleIntervalSec)} apart)
        </span>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi label="WIND SPEED" value={snapshot.windSpeed.toFixed(1)} unit="m/s" accent="#5EC8E8" />
        <Kpi label="WIND OUTPUT" value={Math.round(snapshot.wind)} unit="kW" accent="#5EC8E8" />
        <Kpi label="WIND CAPACITY FACTOR" value={Math.round(capacityFactorPct)} unit="%" accent="#4FD1A5" />
        <Kpi label="TURBINE RATED CAPACITY" value={config.windCapacity} unit="kW" />
      </div>

      {/* S-curve: the theoretical power curve, speed -> output */}
      <div style={{ marginBottom: 20 }}>
        <Panel title="WIND POWER CURVE — output vs wind speed (turbine S-curve)" minWidth={380}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={windCurveData}>
              <CartesianGrid stroke="#1F2A35" vertical={false} />
              <XAxis dataKey="speed" type="number" domain={[0, xMax]}
                tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={{ stroke: "#1F2A35" }} tickLine={false}
                label={{ value: "wind speed (m/s)", position: "insideBottom", offset: -4, fill: "#4A5560", fontSize: 10 }} />
              <YAxis tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false}
                label={{ value: "output (kW)", angle: -90, position: "insideLeft", fill: "#4A5560", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }}
                formatter={(v, name) => [`${v} kW`, name]} labelFormatter={(v) => `${v} m/s`} />
              <Line type="monotone" dataKey="output" stroke="#5EC8E8" strokeWidth={2} dot={false} name="Output (kW)" isAnimationActive={false} />
              <ReferenceLine x={cutIn}  stroke="#8B9AA8" strokeDasharray="3 3" label={{ value: "cut-in",  fill: "#8B9AA8", fontSize: 10, position: "top" }} />
              <ReferenceLine x={rated}  stroke="#4FD1A5" strokeDasharray="3 3" label={{ value: "rated",   fill: "#4FD1A5", fontSize: 10, position: "top" }} />
              <ReferenceLine x={cutOut} stroke="#E8A23D" strokeDasharray="3 3" label={{ value: "cut-out", fill: "#E8A23D", fontSize: 10, position: "top" }} />
              <ReferenceDot x={Math.min(snapshot.windSpeed, xMax)} y={snapshot.wind} r={5} fill="#4FD1A5" stroke="#0A0E14" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Windowed time series: wind speed + wind output, sharing the dashboard's zoom window */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Panel title={`WIND SPEED — last ${fmtWindowLabel(historyWindowHours)} through now`} flex={1} minWidth={320}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid stroke="#1F2A35" vertical={false} />
              <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtAxisTick(v, historyWindowHours)}
                tick={{ fill: "#8B9AA8", fontSize: 10 }} interval={tickInterval} axisLine={{ stroke: "#1F2A35" }} tickLine={false} />
              <YAxis tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(v) => fmtAxisTick(v, historyWindowHours)} contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }} />
              <Area type="monotone" dataKey="windSpeed" stroke="#5EC8E8" fill="#5EC8E8" fillOpacity={0.25} name="Wind speed (m/s)" isAnimationActive={false} />
              <ReferenceLine y={cutOut} stroke="#E8A23D" strokeDasharray="3 3" label={{ value: "cut-out", fill: "#E8A23D", fontSize: 9, position: "right" }} />
              <ReferenceLine x={simIndexFloat} stroke="#5EC8E8" strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={`WIND OUTPUT vs CAPACITY — last ${fmtWindowLabel(historyWindowHours)} through now`} flex={1} minWidth={320}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid stroke="#1F2A35" vertical={false} />
              <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtAxisTick(v, historyWindowHours)}
                tick={{ fill: "#8B9AA8", fontSize: 10 }} interval={tickInterval} axisLine={{ stroke: "#1F2A35" }} tickLine={false} />
              <YAxis domain={[0, config.windCapacity]} tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(v) => fmtAxisTick(v, historyWindowHours)} contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }} />
              <Area type="monotone" dataKey="windOutput" stroke="#4FD1A5" fill="#4FD1A5" fillOpacity={0.3} name="Wind output (kW)" isAnimationActive={false} />
              <ReferenceLine y={config.windCapacity} stroke="#4FD1A5" strokeDasharray="3 3" label={{ value: "rated cap", fill: "#4FD1A5", fontSize: 9, position: "right" }} />
              <ReferenceLine x={simIndexFloat} stroke="#5EC8E8" strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ---------------- SOLAR PV ---------------- */}
      <div style={{ color: "#8B9AA8", fontSize: 13, margin: "28px 0 16px", borderTop: "1px solid #1F2A35", paddingTop: 20 }}>
        Solar PV detail — {stationName} Station
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi label="SOLAR IRRADIANCE" value={Math.round(snapshot.irradiance)} unit="W/m²" accent="#E8C23D" />
        <Kpi label="PV OUTPUT" value={Math.round(snapshot.pv)} unit="kW" accent="#E8C23D" />
        <Kpi label="PV CAPACITY FACTOR" value={Math.round(solarCapacityFactorPct)} unit="%" accent="#4FD1A5" />
        <Kpi label="PV RATED CAPACITY" value={config.pvCapacity} unit="kW" />
      </div>

      {/* Theoretical curve: irradiance -> output, saturating at rated capacity */}
      <div style={{ marginBottom: 20 }}>
        <Panel title="SOLAR PV CURVE — output vs irradiance (panel response)" minWidth={380}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={solarCurveData}>
              <CartesianGrid stroke="#1F2A35" vertical={false} />
              <XAxis dataKey="irradiance" type="number" domain={[0, 900]}
                tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={{ stroke: "#1F2A35" }} tickLine={false}
                label={{ value: "irradiance (W/m²)", position: "insideBottom", offset: -4, fill: "#4A5560", fontSize: 10 }} />
              <YAxis tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false}
                label={{ value: "output (kW)", angle: -90, position: "insideLeft", fill: "#4A5560", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }}
                formatter={(v, name) => [`${v} kW`, name]} labelFormatter={(v) => `${v} W/m²`} />
              <Line type="monotone" dataKey="output" stroke="#E8C23D" strokeWidth={2} dot={false} name="Output (kW)" isAnimationActive={false} />
              <ReferenceLine x={800} stroke="#4FD1A5" strokeDasharray="3 3" label={{ value: "saturation", fill: "#4FD1A5", fontSize: 10, position: "top" }} />
              <ReferenceDot x={Math.min(snapshot.irradiance, 900)} y={snapshot.pv} r={5} fill="#4FD1A5" stroke="#0A0E14" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Windowed time series: irradiance + pv output, sharing the dashboard's zoom window */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Panel title={`SOLAR IRRADIANCE — last ${fmtWindowLabel(historyWindowHours)} through now`} flex={1} minWidth={320}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid stroke="#1F2A35" vertical={false} />
              <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtAxisTick(v, historyWindowHours)}
                tick={{ fill: "#8B9AA8", fontSize: 10 }} interval={tickInterval} axisLine={{ stroke: "#1F2A35" }} tickLine={false} />
              <YAxis tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(v) => fmtAxisTick(v, historyWindowHours)} contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }} />
              <Area type="monotone" dataKey="irradiance" stroke="#E8C23D" fill="#E8C23D" fillOpacity={0.25} name="Irradiance (W/m²)" isAnimationActive={false} />
              <ReferenceLine y={800} stroke="#4FD1A5" strokeDasharray="3 3" label={{ value: "saturation", fill: "#4FD1A5", fontSize: 9, position: "right" }} />
              <ReferenceLine x={simIndexFloat} stroke="#5EC8E8" strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={`PV OUTPUT vs CAPACITY — last ${fmtWindowLabel(historyWindowHours)} through now`} flex={1} minWidth={320}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid stroke="#1F2A35" vertical={false} />
              <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtAxisTick(v, historyWindowHours)}
                tick={{ fill: "#8B9AA8", fontSize: 10 }} interval={tickInterval} axisLine={{ stroke: "#1F2A35" }} tickLine={false} />
              <YAxis domain={[0, config.pvCapacity]} tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(v) => fmtAxisTick(v, historyWindowHours)} contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }} />
              <Area type="monotone" dataKey="pvOutput" stroke="#4FD1A5" fill="#4FD1A5" fillOpacity={0.3} name="PV output (kW)" isAnimationActive={false} />
              <ReferenceLine y={config.pvCapacity} stroke="#4FD1A5" strokeDasharray="3 3" label={{ value: "rated cap", fill: "#4FD1A5", fontSize: 9, position: "right" }} />
              <ReferenceLine x={simIndexFloat} stroke="#5EC8E8" strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}