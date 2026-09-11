import React from "react";

function Section({ title, subtitle, children, minWidth }) {
  return (
    <div style={{
      flex: 1, minWidth: minWidth ?? 320, background: "#10151C",
      border: "1px solid #1F2A35", borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 12, color: "#E8EEF2", fontWeight: 600, marginBottom: subtitle ? 2 : 10 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: "#8B9AA8", marginBottom: 10 }}>{subtitle}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, unit, note, highlight }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      gap: 10, padding: "7px 0", borderBottom: "1px solid #161C24",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#C4CDD5" }}>{label}</div>
        {note && <div style={{ fontSize: 10, color: "#4A5560", marginTop: 1 }}>{note}</div>}
      </div>
      <div style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13,
        color: highlight ? "#5EC8E8" : "#E8EEF2", whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {value}<span style={{ fontSize: 10, color: "#8B9AA8", marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
  );
}

// Small reset-to-default icon button, only rendered when the current value
// has actually drifted from its default (so it doesn't clutter untouched
// rows). Styled like the rest of the app's small pill/icon controls rather
// than a bare underlined text link.
function ResetLink({ show, onClick, label }) {
  if (!show) return null;
  return (
    <button
      onClick={onClick}
      title={label || "Reset to default"}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, marginLeft: 8, flexShrink: 0,
        borderRadius: 6, border: "1px solid #1B3644", background: "#0F1F28",
        color: "#5EC8E8", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1,
      }}
    >⟲</button>
  );
}

/* ============================================================
   NUMBER-FIELD PLUMBING
   ------------------------------------------------------------
   Every editable number on this page is now a plain text field
   (type="text" + inputMode="decimal") instead of a spinner-style
   number input, so the value can be typed straight in. Each field
   advertises its own allowed range in a `RangeHint` line, and a
   value typed outside that range is highlighted amber and clamped
   down to the nearest bound on blur/Enter.
   ============================================================ */

// Format a bound for the range hint without float noise: 1/60 → 0.017,
// 1/3600 → 0.000278, 8758.8 → 8758.8, 90 → 90, null → ∞.
function fmtBound(v) {
  if (v == null) return "∞";
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  const d = abs >= 0.01 ? 3 : 6;
  return String(Number(v.toFixed(d)));
}

// The "what am I allowed to type here" line under each editable field,
// e.g. "range 0–90 kW · step 1".
function RangeHint({ min, max, step, unit, extra }) {
  const parts = [];
  if (min != null || max != null) {
    parts.push(`range ${fmtBound(min)}–${fmtBound(max)}${unit ? ` ${unit}` : ""}`);
  }
  if (step != null) parts.push(`step ${fmtBound(step)}`);
  if (extra) parts.push(extra);
  if (!parts.length) return null;
  return (
    <div style={{
      fontSize: 10, color: "#3E5A6B", marginTop: 1,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    }}>
      {parts.join(" · ")}
    </div>
  );
}

function numInputStyle(highlight, warn) {
  return {
    background: "#0A0E14",
    color: warn ? "#E8A23D" : highlight ? "#5EC8E8" : "#E8EEF2",
    border: `1px solid ${warn ? "#5A4326" : "#1F2A35"}`,
    borderRadius: 6, padding: "5px 7px", fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    textAlign: "right", outline: "none",
  };
}

// A single free-typing numeric field. Keeps a local draft string so partial
// input (e.g. "-" while typing "-5", or a trailing "." ) doesn't get
// clamped or reverted mid-keystroke. Commit happens on blur or Enter:
//   - empty / non-numeric  → revert to the last good value
//   - outside [min, max]   → clamp to the nearest bound
//   - otherwise            → onChange with the parsed number
function NumField({
  value, min, max, width = 84, highlight, onChange, warnOutOfRange = true,
}) {
  const [draft, setDraft] = React.useState(String(value));
  const [focused, setFocused] = React.useState(false);

  // Re-sync from the store whenever the value changes underneath us, but
  // never while the user is actively typing in this field.
  React.useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const empty = draft.trim() === "";
  const parsed = Number(draft);
  const invalid = !empty && !Number.isFinite(parsed);
  const outOfRange = !empty && !invalid && (
    (min != null && parsed < min) || (max != null && parsed > max)
  );
  const warn = warnOutOfRange && (invalid || outOfRange);

  const commit = () => {
    setFocused(false);
    if (empty || invalid) { setDraft(String(value)); return; }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={draft}
      title={warn ? `Out of range — will be clamped to ${fmtBound(min)}–${fmtBound(max)}` : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
        if (e.key === "Escape") { setDraft(String(value)); e.target.blur(); }
      }}
      style={{ ...numInputStyle(highlight, warn), width }}
    />
  );
}

// A row with an inline-editable number field, plus the range it accepts.
function EditableRow({
  label, value, unit, note, highlight, min, max, step = 1,
  onChange, isDefault, onReset, width, hint,
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 10, padding: "7px 0", borderBottom: "1px solid #161C24",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#C4CDD5" }}>{label}</div>
        {note && <div style={{ fontSize: 10, color: "#4A5560", marginTop: 1 }}>{note}</div>}
        <RangeHint min={min} max={max} step={step} unit={unit} extra={hint} />
      </div>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, paddingTop: 1 }}>
        <NumField
          value={value} min={min} max={max} width={width}
          highlight={highlight} onChange={onChange}
        />
        <span style={{ fontSize: 10, color: "#8B9AA8", marginLeft: 3 }}>{unit}</span>
        <ResetLink show={!isDefault} onClick={onReset} />
      </div>
    </div>
  );
}

// A row editing a two-element [lo, hi] range with two free-typing fields.
// The low field is capped at the current high, and vice versa.
function EditableRangeRow({
  label, unit, note, values, min, max, step = 1, onChange, isDefault, onReset,
}) {
  const [lo, hi] = values;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 10, padding: "7px 0", borderBottom: "1px solid #161C24",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#C4CDD5" }}>{label}</div>
        {note && <div style={{ fontSize: 10, color: "#4A5560", marginTop: 1 }}>{note}</div>}
        <RangeHint min={min} max={max} step={step} unit={unit} extra="low ≤ high" />
      </div>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 4, paddingTop: 1 }}>
        <NumField value={lo} min={min} max={hi} width={56}
          onChange={(v) => onChange(0, v)} />
        <span style={{ color: "#4A5560", fontSize: 11 }}>–</span>
        <NumField value={hi} min={lo} max={max} width={56}
          onChange={(v) => onChange(1, v)} />
        <span style={{ fontSize: 10, color: "#8B9AA8", marginLeft: 3 }}>{unit}</span>
        <ResetLink show={!isDefault} onClick={onReset} />
      </div>
    </div>
  );
}

// Editable list of diesel genset sizes (kW each), with add/remove.
function DieselGensetsRow({ values, defaultValues, onChange, onReset }) {
  const isDefault = values.length === defaultValues.length && values.every((v, i) => v === defaultValues[i]);
  return (
    <div style={{ padding: "7px 0", borderBottom: "1px solid #161C24" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#C4CDD5" }}>Diesel gensets</div>
          <RangeHint min={0} max={null} unit="kW each" extra="at least one genset" />
        </div>
        <ResetLink show={!isDefault} onClick={onReset} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
        {values.map((v, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <NumField
              value={v} min={0} max={null} width={62}
              onChange={(nv) => {
                const next = [...values];
                next[i] = nv;
                onChange(next);
              }}
            />
            <button
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              disabled={values.length <= 1}
              title="Remove genset"
              style={{
                width: 20, height: 26, borderRadius: 5, cursor: values.length <= 1 ? "default" : "pointer",
                border: "1px solid #2A2025", background: "#1A1215", color: values.length <= 1 ? "#4A3538" : "#C97A82",
                fontSize: 13, lineHeight: 1, opacity: values.length <= 1 ? 0.5 : 1,
              }}
            >−</button>
          </div>
        ))}
        <button
          onClick={() => onChange([...values, values[values.length - 1] ?? 90])}
          title="Add genset"
          style={{
            width: 26, height: 26, borderRadius: 5, cursor: "pointer",
            border: "1px solid #1F3B30", background: "#12241C", color: "#4FD1A5", fontSize: 14, lineHeight: 1,
          }}
        >+</button>
        <span style={{ fontSize: 10, color: "#4A5560", marginLeft: 4 }}>
          = {values.reduce((a, b) => a + b, 0)} kW total
        </span>
      </div>
    </div>
  );
}

// Row for editing a fraction (0–1) as a whole percent, e.g. gust probability
// or load-split shares. The range hint is expressed in percent.
function EditablePercentRow({ label, note, fraction, min = 0, max = 100, onChange, isDefault, onReset, highlight }) {
  return (
    <EditableRow
      label={label} note={note} unit="%" highlight={highlight}
      value={Math.round(fraction * 1000) / 10}
      min={min} max={max} step={0.1}
      onChange={(pctVal) => onChange(pctVal / 100)}
      isDefault={isDefault} onReset={onReset}
    />
  );
}

function Pill({ children, tone, onClick }) {
  const colors = {
    on: { bg: "#12241C", fg: "#4FD1A5", bd: "#1F3B30" },
    off: { bg: "#1A1215", fg: "#8B9AA8", bd: "#2A2025" },
    info: { bg: "#0F1F28", fg: "#5EC8E8", bd: "#1B3644" },
  }[tone || "info"];
  const Tag = onClick ? "button" : "span";
  return (
    <Tag onClick={onClick} style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11,
      background: colors.bg, color: colors.fg, border: `1px solid ${colors.bd}`,
      cursor: onClick ? "pointer" : "default", fontFamily: "inherit",
    }}>{children}</Tag>
  );
}

function SmallBtn({ onClick, active, children, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600,
      border: `1px solid ${active ? "#5EC8E8" : "#1F2A35"}`,
      background: active ? "#132530" : "#0A0E14",
      color: active ? "#5EC8E8" : "#8B9AA8",
    }}>{children}</button>
  );
}

// Big "reset everything on this page" button, styled to stand out from
// the small per-field ResetLink icons so it reads as the page-level
// action it is, not just another field control.
function DefaultAllButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Reset every editable value on this page — station config, capacities, seed, resolution, chart window, load split, dispatch constants, wind curve — back to factory defaults"
      style={{
        display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
        padding: "8px 14px", borderRadius: 8, cursor: "pointer",
        fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
        border: "1px solid #5EC8E8", background: "#132530", color: "#5EC8E8",
      }}
    >⟲ Default</button>
  );
}

const round = (v, d = 1) => {
  const f = 10 ** d;
  return Math.round((v ?? 0) * f) / f;
};
const pct = (v) => `${Math.round(v * 100)}`;

export default function ParametersPage({
  stationKey, stationName, stationOptions, onStationChange,
  baseConfig, defaultBaseConfig, onBaseFieldChange, onBaseRangeFieldChange, onDieselGensetsChange, onResetBaseField,
  effectiveConfig, onEffectiveCapacityChange, onResetEffectiveCapacity,
  seed, isDefaultSeed, onSeedChange, onUseDefaultSeed, onRegenerateSeed,
  stepMinutesSetting, stepHoursActive, samplesPerYear, isDefaultStep, onStepMinutesChange, onUseDefaultStep,
  historyWindowHours, onHistoryWindowHoursChange, onResetHistoryWindowHours,
  mode, onModeChange, hoursPerSec, onHoursPerSecChange,
  windOn, onWindOnChange, solarOn, onSolarOnChange,
  simIndexFloat, simTimeLabel, snapshot,
  chartPointCount, sampleIntervalSec, tickInterval,
  loadSplit, defaultLoadSplit, onLoadSplitChange, onNormalizeLoadSplit, onResetLoadSplit,
  dispatchParams, defaultDispatchParams, onDispatchParamChange, onResetDispatchParam,
  windCurveParams, defaultWindCurveParams, onWindCurveParamChange, onResetWindCurveParam,
  onResetAll,
  constants,
}) {
  const {
    TEMPLATE_YEAR, HOURS,
    MAX_CHART_POINTS, MIN_SAMPLE_SECONDS, DEFAULT_WINDOW_HOURS,
    DEFAULT_STEP_MINUTES, DEFAULT_SEEDS, MIN_STEP_MINUTES, MAX_STEP_MINUTES,
    MIN_WINDOW_HOURS, MAX_WINDOW_HOURS,
  } = constants;

  const maxDieselKw = baseConfig.dieselGensetKw.reduce((a, b) => a + b, 0);
  const pvOverridden = effectiveConfig.pvCapacity !== baseConfig.pvCapacity;
  const windOverridden = effectiveConfig.windCapacity !== baseConfig.windCapacity;
  const loadSplitSum = Object.values(loadSplit).reduce((a, b) => a + b, 0);
  const loadSplitOff = Math.abs(loadSplitSum - 1) > 0.001;

  const baseIsDefault = (field) => baseConfig[field] === defaultBaseConfig[field];
  const rangeIsDefault = (field) => {
    const a = baseConfig[field], b = defaultBaseConfig[field];
    return a[0] === b[0] && a[1] === b[1];
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
        <div style={{ color: "#8B9AA8", fontSize: 13 }}>
          Every parameter currently feeding the {stationName} Station simulation — site &amp; climate inputs,
          power-system capacities, and the model constants behind dispatch and the charts — plus what the
          simulation is doing with them right now. Values read live from app state; anything with a text
          field below is editable (type a value, press Enter or click away) and feeds straight back into the
          simulation. Each editable field lists the range it accepts.
        </div>
        <DefaultAllButton onClick={onResetAll} />
      </div>

      {/* Live simulation context */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <Section title="SIMULATION CONTEXT" subtitle="What's currently selected/active">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #161C24" }}>
            <div style={{ fontSize: 12, color: "#C4CDD5" }}>Station</div>
            <select value={stationKey} onChange={(e) => onStationChange(e.target.value)}
              style={{ background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "5px 7px", fontSize: 12 }}>
              {stationOptions.map((s) => <option key={s.key} value={s.key}>{s.name} ({s.key})</option>)}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #161C24" }}>
            <div style={{ fontSize: 12, color: "#C4CDD5" }}>Playback mode</div>
            <div style={{ display: "flex", gap: 4 }}>
              <SmallBtn active={mode === "live"} onClick={() => onModeChange("live")}>Live</SmallBtn>
              <SmallBtn active={mode === "accelerated"} onClick={() => onModeChange("accelerated")}>Accel.</SmallBtn>
              <SmallBtn active={mode === "manual"} onClick={() => onModeChange("manual")}>Manual</SmallBtn>
            </div>
          </div>
          {mode === "accelerated" && (
            <EditableRow
              label="Playback speed" unit="sim-hr / real-sec" value={round(hoursPerSec, 3)}
              min={1 / 60} max={2000} step={0.1} highlight
              onChange={onHoursPerSecChange} isDefault hint="edits switch to a custom speed"
            />
          )}
          <Row label="Simulated timestamp" value={simTimeLabel} highlight />
          <Row label="Sim index (hours since Jan 1)" value={round(simIndexFloat, 4)} unit="h" note={`template year ${TEMPLATE_YEAR}, ${HOURS} h/year total`} />
          <div style={{ display: "flex", gap: 6, padding: "8px 0 2px" }}>
            <Pill tone={windOn ? "on" : "off"} onClick={() => onWindOnChange(!windOn)}>Wind {windOn ? "ON" : "OFF"} — click to toggle</Pill>
            <Pill tone={solarOn ? "on" : "off"} onClick={() => onSolarOnChange(!solarOn)}>Solar {solarOn ? "ON" : "OFF"} — click to toggle</Pill>
          </div>
        </Section>

        <Section title="DATA GENERATION SEED &amp; RESOLUTION" subtitle="Controls generateEnvironment(...) — editable">
          <EditableRow
            label="Active seed" value={seed} note={isDefaultSeed ? "default seed" : "custom seed"}
            step={1} min={0} max={null} onChange={(v) => onSeedChange(Math.round(v))}
            isDefault={isDefaultSeed} onReset={onUseDefaultSeed}
            hint="any whole number"
          />
          <div style={{ padding: "2px 0 7px" }}>
            <SmallBtn onClick={onRegenerateSeed}>↻ Regenerate (random, both stations)</SmallBtn>
          </div>
          <EditableRow
            label="Sample resolution (setting)" unit="min" value={stepMinutesSetting}
            min={MIN_STEP_MINUTES} max={MAX_STEP_MINUTES} step={1}
            note={isDefaultStep ? "default" : "custom"}
            onChange={onStepMinutesChange} isDefault={isDefaultStep} onReset={onUseDefaultStep}
          />
          <Row label="Sample resolution (active)" value={round(stepHoursActive * 60, 1)} unit="min/sample" highlight />
          <Row label="Samples generated this year" value={samplesPerYear.toLocaleString()} unit="pts" />
          <Row label="Default seed pair" value={`${DEFAULT_SEEDS.maitri} / ${DEFAULT_SEEDS.bharati}`} note="maitri / bharati" />
          <Row label="Default resolution" value={DEFAULT_STEP_MINUTES} unit="min" />
        </Section>
      </div>

      {/* Live snapshot values actually plotted right now */}
      <div style={{ marginBottom: 16 }}>
        <Section title="LIVE SNAPSHOT — interpolated at the current sim index" subtitle="Pure simulation outputs — read-only. These are the exact numbers driving the KPI tiles and the ReferenceDot/ReferenceLine markers on the charts">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Row label="Temperature" value={round(snapshot.temperature, 1)} unit="°C" />
              <Row label="Wind speed" value={round(snapshot.windSpeed, 1)} unit="m/s" />
              <Row label="Weather state" value={snapshot.weather} />
              <Row label="Total load" value={round(snapshot.load, 1)} unit="kW" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Row label="PV output" value={round(snapshot.pv, 1)} unit="kW" />
              <Row label="Wind output" value={round(snapshot.wind, 1)} unit="kW" />
              <Row label="Diesel output" value={round(snapshot.diesel, 1)} unit="kW" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Row label="Battery SOC" value={round(snapshot.soc, 1)} unit="%" />
              <Row label="Fuel runway" value={round(snapshot.runway, 1)} unit="days" />
            </div>
          </div>
        </Section>
      </div>

      {/* Site / climate parameters that seed the environment generator */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <Section title="SITE &amp; CLIMATE PARAMETERS" subtitle="STATIONS[station] — inputs to generateEnvironment() — editable">
          <EditableRow label="Latitude" unit="°" value={baseConfig.latitudeDeg} min={-90} max={90} step={0.05}
            note="drives solar elevation / irradiance"
            onChange={(v) => onBaseFieldChange("latitudeDeg", v)} isDefault={baseIsDefault("latitudeDeg")} onReset={() => onResetBaseField("latitudeDeg")} />
          <EditableRow label="Crew (winter)" unit="people" value={baseConfig.crewWinter} min={1} max={500} step={1}
            onChange={(v) => onBaseFieldChange("crewWinter", Math.round(v))} isDefault={baseIsDefault("crewWinter")} onReset={() => onResetBaseField("crewWinter")} />
          <EditableRow label="Crew (summer)" unit="people" value={baseConfig.crewSummer} min={1} max={500} step={1}
            note="scales load via crewFactor"
            onChange={(v) => onBaseFieldChange("crewSummer", Math.round(v))} isDefault={baseIsDefault("crewSummer")} onReset={() => onResetBaseField("crewSummer")} />
          <EditableRow label="Avg summer temp" unit="°C" value={baseConfig.tempSummerAvg} min={-40} max={40} step={0.1}
            onChange={(v) => onBaseFieldChange("tempSummerAvg", v)} isDefault={baseIsDefault("tempSummerAvg")} onReset={() => onResetBaseField("tempSummerAvg")} />
          <EditableRow label="Avg winter temp" unit="°C" value={baseConfig.tempWinterAvg} min={-80} max={20} step={0.1}
            note="together set seasonal amplitude"
            onChange={(v) => onBaseFieldChange("tempWinterAvg", v)} isDefault={baseIsDefault("tempWinterAvg")} onReset={() => onResetBaseField("tempWinterAvg")} />
          <EditableRow label="Mean wind speed" unit="m/s" value={baseConfig.windAvg} min={0} max={40} step={0.1}
            note="Weibull scale input"
            onChange={(v) => onBaseFieldChange("windAvg", v)} isDefault={baseIsDefault("windAvg")} onReset={() => onResetBaseField("windAvg")} />
          <EditableRow label="Weibull shape (k)" unit="" value={baseConfig.weibullK} min={0.5} max={5} step={0.05}
            onChange={(v) => onBaseFieldChange("weibullK", v)} isDefault={baseIsDefault("weibullK")} onReset={() => onResetBaseField("weibullK")} />
          <EditablePercentRow label="Gust probability" note="chance per day" fraction={baseConfig.gustProbPerDay} min={0} max={100}
            onChange={(v) => onBaseFieldChange("gustProbPerDay", v)} isDefault={baseIsDefault("gustProbPerDay")} onReset={() => onResetBaseField("gustProbPerDay")} />
          <EditableRangeRow label="Gust speed range" unit="m/s" values={baseConfig.gustSpeedRange} min={0} max={80} step={0.5}
            onChange={(idx, v) => onBaseRangeFieldChange("gustSpeedRange", idx, v)} isDefault={rangeIsDefault("gustSpeedRange")} onReset={() => onResetBaseField("gustSpeedRange")} />
          <EditableRangeRow label="Gust duration range" unit="hr" values={baseConfig.gustDurationHrRange} min={0} max={48} step={0.5}
            onChange={(idx, v) => onBaseRangeFieldChange("gustDurationHrRange", idx, v)} isDefault={rangeIsDefault("gustDurationHrRange")} onReset={() => onResetBaseField("gustDurationHrRange")} />
        </Section>

        <Section title="POWER SYSTEM CAPACITIES" subtitle="Feed runDispatch() — base is editable; effective includes any slider override">
          <EditableRow label="Peak load (design)" unit="kW" value={baseConfig.peakLoad} min={1} max={2000} step={1}
            onChange={(v) => onBaseFieldChange("peakLoad", v)} isDefault={baseIsDefault("peakLoad")} onReset={() => onResetBaseField("peakLoad")} />
          <EditableRow label="PV capacity — base" unit="kW" value={baseConfig.pvCapacity} min={0} max={2000} step={1}
            onChange={(v) => onBaseFieldChange("pvCapacity", v)} isDefault={baseIsDefault("pvCapacity")} onReset={() => onResetBaseField("pvCapacity")} />
          <EditableRow label="PV capacity — effective" unit="kW" value={effectiveConfig.pvCapacity} min={0} max={2000} step={1} highlight
            note={pvOverridden ? "overridden via slider" : "= base (default)"}
            onChange={(v) => onEffectiveCapacityChange("pvCapacity", v)} isDefault={!pvOverridden} onReset={() => onResetEffectiveCapacity("pvCapacity")} />
          <EditableRow label="Wind capacity — base" unit="kW" value={baseConfig.windCapacity} min={0} max={2000} step={1}
            onChange={(v) => onBaseFieldChange("windCapacity", v)} isDefault={baseIsDefault("windCapacity")} onReset={() => onResetBaseField("windCapacity")} />
          <EditableRow label="Wind capacity — effective" unit="kW" value={effectiveConfig.windCapacity} min={0} max={2000} step={1} highlight
            note={windOverridden ? "overridden via slider" : "= base (default)"}
            onChange={(v) => onEffectiveCapacityChange("windCapacity", v)} isDefault={!windOverridden} onReset={() => onResetEffectiveCapacity("windCapacity")} />
          <DieselGensetsRow values={baseConfig.dieselGensetKw} defaultValues={defaultBaseConfig.dieselGensetKw}
            onChange={onDieselGensetsChange} onReset={() => onResetBaseField("dieselGensetKw")} />
          <Row label="Diesel — total capacity" value={maxDieselKw} unit="kW" note="sum of gensets, caps dieselOut" />
          <EditableRow label="Battery capacity" unit="kWh" value={baseConfig.batteryCapacityKwh} min={1} max={20000} step={10}
            onChange={(v) => onBaseFieldChange("batteryCapacityKwh", v)} isDefault={baseIsDefault("batteryCapacityKwh")} onReset={() => onResetBaseField("batteryCapacityKwh")} />
          <EditableRow label="Diesel tank capacity" unit="L" value={baseConfig.dieselTankCapacityL} min={1000} max={2000000} step={1000}
            onChange={(v) => onBaseFieldChange("dieselTankCapacityL", v)} isDefault={baseIsDefault("dieselTankCapacityL")} onReset={() => onResetBaseField("dieselTankCapacityL")} />
        </Section>
      </div>

      {/* Model constants: wind curve, dispatch, chart sampling */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <Section title="WIND TURBINE POWER CURVE" subtitle="windOutputKw() — shapes the S-curve chart on Renewable Resources — editable" minWidth={260}>
          <EditableRow label="Cut-in speed" unit="m/s" value={windCurveParams.cutIn} min={0} max={windCurveParams.rated - 0.1} step={0.1}
            note="output = 0 below this"
            onChange={(v) => onWindCurveParamChange("cutIn", v)} isDefault={windCurveParams.cutIn === defaultWindCurveParams.cutIn} onReset={() => onResetWindCurveParam("cutIn")} />
          <EditableRow label="Rated speed" unit="m/s" value={windCurveParams.rated} min={windCurveParams.cutIn + 0.1} max={windCurveParams.cutOut - 0.1} step={0.1}
            note="output = full capacity at/above this"
            onChange={(v) => onWindCurveParamChange("rated", v)} isDefault={windCurveParams.rated === defaultWindCurveParams.rated} onReset={() => onResetWindCurveParam("rated")} />
          <EditableRow label="Cut-out speed" unit="m/s" value={windCurveParams.cutOut} min={windCurveParams.rated + 0.1} max={80} step={0.5}
            note="output = 0 above this (safety)"
            onChange={(v) => onWindCurveParamChange("cutOut", v)} isDefault={windCurveParams.cutOut === defaultWindCurveParams.cutOut} onReset={() => onResetWindCurveParam("cutOut")} />
          <Row label="Ramp shape" value="cubic" note="output ∝ ((speed − cut-in) / (rated − cut-in))³ — fixed" />
        </Section>

        <Section title="DISPATCH &amp; BATTERY MODEL" subtitle="Constants in runDispatch() — editable" minWidth={260}>
          <EditablePercentRow label="SOC floor" note="battery won't discharge below this" fraction={dispatchParams.socMin} min={0} max={Number(pct(dispatchParams.socMax)) - 1}
            onChange={(v) => onDispatchParamChange("socMin", v)} isDefault={dispatchParams.socMin === defaultDispatchParams.socMin} onReset={() => onResetDispatchParam("socMin")} />
          <EditablePercentRow label="SOC ceiling" note="battery won't charge above this" fraction={dispatchParams.socMax} min={Number(pct(dispatchParams.socMin)) + 1} max={100}
            onChange={(v) => onDispatchParamChange("socMax", v)} isDefault={dispatchParams.socMax === defaultDispatchParams.socMax} onReset={() => onResetDispatchParam("socMax")} />
          <EditablePercentRow label="Round-trip efficiency" note="applied on charge" fraction={dispatchParams.roundTripEff} min={1} max={100}
            onChange={(v) => onDispatchParamChange("roundTripEff", v)} isDefault={dispatchParams.roundTripEff === defaultDispatchParams.roundTripEff} onReset={() => onResetDispatchParam("roundTripEff")} />
          <EditableRow label="Diesel efficiency" unit="kWh/L" value={dispatchParams.dieselKwhPerL} min={0.1} max={10} step={0.01}
            onChange={(v) => onDispatchParamChange("dieselKwhPerL", v)} isDefault={dispatchParams.dieselKwhPerL === defaultDispatchParams.dieselKwhPerL} onReset={() => onResetDispatchParam("dieselKwhPerL")} />
          <EditableRow label="Fuel runway averaging window" unit="days" value={dispatchParams.runwayWindowDays} min={1} max={365} step={1}
            note="trailing burn rate used for the runway estimate"
            onChange={(v) => onDispatchParamChange("runwayWindowDays", Math.round(v))} isDefault={dispatchParams.runwayWindowDays === defaultDispatchParams.runwayWindowDays} onReset={() => onResetDispatchParam("runwayWindowDays")} />
        </Section>

        <Section title="LOAD BREAKDOWN SPLIT" subtitle="LOAD_SPLIT — shares of totalLoad — editable, should sum to 100%" minWidth={260}>
          {Object.entries(loadSplit).map(([key, share]) => (
            <EditablePercentRow key={key} label={key} fraction={share} min={0} max={100}
              onChange={(v) => onLoadSplitChange(key, v)}
              isDefault={share === defaultLoadSplit[key]} onReset={() => onLoadSplitChange(key, defaultLoadSplit[key])}
            />
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
            <span style={{ fontSize: 11, color: loadSplitOff ? "#E8A23D" : "#4FD1A5" }}>
              sum: {pct(loadSplitSum)}% {loadSplitOff ? "— doesn't add to 100%" : "✓"}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <SmallBtn onClick={onNormalizeLoadSplit}>Normalize to 100%</SmallBtn>
              <SmallBtn onClick={onResetLoadSplit}>⟲ Defaults</SmallBtn>
            </div>
          </div>
        </Section>
      </div>

      {/* Chart sampling */}
      <div style={{ marginBottom: 4 }}>
        <Section title="CHART SAMPLING PARAMETERS" subtitle="Governs how the windowed time-series charts are built from the underlying samples">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <EditableRow label="Chart window (zoom)" unit="h" value={round(historyWindowHours, 3)} min={MIN_WINDOW_HOURS} max={MAX_WINDOW_HOURS} step={historyWindowHours < 1 ? 0.001 : 1} highlight
                onChange={onHistoryWindowHoursChange} isDefault={historyWindowHours === DEFAULT_WINDOW_HOURS} onReset={onResetHistoryWindowHours} />
              <Row label="Points currently plotted" value={chartPointCount} unit="pts" />
              <Row label="Sample interval (current)" value={round(sampleIntervalSec, 2)} unit="sec" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Row label="X-axis tick interval" value={tickInterval} unit="pts between ticks" />
              <Row label="Max plotted points (cap)" value={MAX_CHART_POINTS} unit="pts" note="fixed technical safety cap" />
              <Row label="Finest sample gap allowed" value={MIN_SAMPLE_SECONDS} unit="sec" note="fixed technical safety cap" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Row label="Default chart window" value={DEFAULT_WINDOW_HOURS} unit="h" />
            </div>
          </div>
        </Section>
      </div>

      <div style={{ marginTop: 16, color: "#4A5560", fontSize: 11 }}>
        This page reads from — and writes back to — the same state and constants that drive the Dashboard
        and Renewable Resources pages. Type a value into any field and press Enter (or click away) to apply
        it; a value outside the listed range is flagged amber and clamped to the nearest allowed bound.
        Press Escape while editing to cancel. Fields with a "reset" link have drifted from their factory
        default; the Live Snapshot and the chart's technical caps stay read-only since they're pure outputs
        or safety limits rather than inputs.
      </div>
    </div>
  );
}