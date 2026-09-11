import React from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid, ReferenceDot,
} from "recharts";

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

export default function RenewablesPage({
  config, stationName, snapshot, windCurveData, chartData,
  historyWindowHours, fmtWindowLabel, fmtAxisTick, tickInterval, simIndexFloat,
  windCurveParams,
}) {
  const capacityFactorPct = config.windCapacity > 0 ? (snapshot.wind / config.windCapacity) * 100 : 0;

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
    </div>
  );
}