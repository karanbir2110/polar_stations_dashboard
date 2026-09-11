import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid, ReferenceDot,
} from "recharts";
import RenewablesPage from "./RenewablesPage";
import ParametersPage from "./ParametersPage";

/* ============================================================
   STATION CONFIGS — mirrors the Python generator's parameters
   ============================================================ */
const DEFAULT_STATIONS = {
  maitri: {
    name: "Maitri", latitudeDeg: -70.75,
    crewWinter: 25, crewSummer: 45,
    tempSummerAvg: 0.9, tempWinterAvg: -22.0,
    windAvg: 9.7, weibullK: 2.0,
    gustProbPerDay: 0.35, gustSpeedRange: [25, 40], gustDurationHrRange: [3, 10],
    peakLoad: 130, pvCapacity: 80, windCapacity: 200,
    dieselGensetKw: [90, 90, 90], batteryCapacityKwh: 500,
    dieselTankCapacityL: 350000,
  },
  bharati: {
    name: "Bharati", latitudeDeg: -69.40,
    crewWinter: 47, crewSummer: 72,
    tempSummerAvg: 1.5, tempWinterAvg: -18.0,
    windAvg: 8.5, weibullK: 2.0,
    gustProbPerDay: 0.30, gustSpeedRange: [22, 38], gustDurationHrRange: [2, 8],
    peakLoad: 190, pvCapacity: 100, windCapacity: 250,
    dieselGensetKw: [120, 120, 120], batteryCapacityKwh: 700,
    dieselTankCapacityL: 450000,
  },
};

// These used to be fixed module-level constants. They're now DEFAULTS —
// the actual values driving the simulation live in React state (below, in
// the component) so they can be edited live from the Parameters page. The
// DEFAULT_* names are kept around purely as factory-reset targets and as
// default args for callers (tests, etc.) that don't pass explicit params.
const DEFAULT_LOAD_SPLIT = {
  heating: 0.48, lifeSupport: 0.15, labColdStorage: 0.12,
  comms: 0.10, general: 0.15,
};
const DEFAULT_DIESEL_KWH_PER_L = 3.17;
const DEFAULT_SOC_MIN = 0.20, DEFAULT_SOC_MAX = 0.90, DEFAULT_ROUND_TRIP_EFF = 0.92;
const TEMPLATE_YEAR = 2026;
const HOURS = 8760;
const GAMMA_1_5 = 0.8862269254527579;
// Wind turbine power-curve breakpoints (m/s) — pulled out to module level
// (instead of living only as windOutputKw's default args) so the Parameters
// page can display the exact values actually driving the dispatch/curve math.
const DEFAULT_WIND_CUT_IN_MS = 3.5;
const DEFAULT_WIND_RATED_MS = 13.0;
const DEFAULT_WIND_CUT_OUT_MS = 25.0;
// Trailing window (days) used to smooth the fuel-runway estimate in runDispatch.
const DEFAULT_RUNWAY_WINDOW_DAYS = 30;

// Grouped defaults, handed to useState() initializers and used as
// factory-reset targets from the Parameters page.
const DEFAULT_DISPATCH_PARAMS = {
  socMin: DEFAULT_SOC_MIN, socMax: DEFAULT_SOC_MAX,
  roundTripEff: DEFAULT_ROUND_TRIP_EFF, dieselKwhPerL: DEFAULT_DIESEL_KWH_PER_L,
  runwayWindowDays: DEFAULT_RUNWAY_WINDOW_DAYS,
};
const DEFAULT_WIND_CURVE_PARAMS = {
  cutIn: DEFAULT_WIND_CUT_IN_MS, rated: DEFAULT_WIND_RATED_MS, cutOut: DEFAULT_WIND_CUT_OUT_MS,
};

// Default seeds — fixed on purpose so the dataset is IDENTICAL every time
// this artifact loads or reloads, and reachable again any time via the
// "Default seed" button.
const DEFAULT_SEEDS = { maitri: 42, bharati: 43 };

// Accelerated-mode presets, from very slow to very fast.
const SPEED_OPTIONS = [
  { label: "1 min / sec", hoursPerSec: 1 / 60 },
  { label: "10 min / sec", hoursPerSec: 10 / 60 },
  { label: "30 min / sec", hoursPerSec: 0.5 },
  { label: "1 hour / sec", hoursPerSec: 1 },
  { label: "3 hours / sec", hoursPerSec: 3 },
  { label: "6 hours / sec", hoursPerSec: 6 },
  { label: "12 hours / sec", hoursPerSec: 12 },
  { label: "1 day / sec", hoursPerSec: 24 },
  { label: "3 days / sec", hoursPerSec: 72 },
  { label: "1 week / sec", hoursPerSec: 168 },
  { label: "1 month / sec", hoursPerSec: 730 },
];
const MIN_CUSTOM_HPS = 1 / 60;
const MAX_CUSTOM_HPS = 2000;

// Chart zoom (history window) settings.
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

// Data-generation resolution: how often the underlying environment/dispatch
// simulation actually produces a sample. This is INDEPENDENT of the chart
// zoom/window above — the chart always interpolates smoothly between
// whatever samples exist, at any zoom level. This setting controls how
// coarse or fine those underlying samples are.
const DEFAULT_STEP_MINUTES = 60; // 1 sample per hour, matching the original behavior
const MIN_STEP_MINUTES = 5;
const MAX_STEP_MINUTES = 10080; // 1 week
const STEP_PRESETS = [
  { label: "5 min", minutes: 5 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "1 day", minutes: 1440 },
  { label: "1 week", minutes: 10080 },
];
const STEP_UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };

// The environment + dispatch physics ALWAYS run at this fixed internal
// resolution, regardless of what output resolution the user selects. The
// user's resolution setting only controls how the fine results are
// aggregated/sampled for display. This is what makes fuel burn, tank level
// and fuel runway consistent across every resolution setting (previously a
// coarse step would spuriously zero out irradiance and starve the battery,
// causing wildly different runway figures).
const SIM_STEP_MINUTES = 5;

/* ============================================================
   SEEDED PRNG
   ============================================================ */
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   ENVIRONMENT GENERATION — unchanged logic from before
   ============================================================ */
function generateEnvironment(config, seed, stepMinutes = DEFAULT_STEP_MINUTES, loadSplit = DEFAULT_LOAD_SPLIT) {
  const stepHours = stepMinutes / 60;
  const n = Math.max(2, Math.round(HOURS / stepHours));
  const rng = mulberry32(seed);
  const temperature = new Float64Array(n);
  const windSpeed = new Float64Array(n);
  const irradiance = new Float64Array(n);
  const weather = new Array(n);
  const totalLoad = new Float64Array(n);
  const loadBreakdown = {
    heating: new Float64Array(n), lifeSupport: new Float64Array(n),
    labColdStorage: new Float64Array(n), comms: new Float64Array(n),
    general: new Float64Array(n),
  };

  const tempAmp = (config.tempSummerAvg - config.tempWinterAvg) / 2;
  const tempMean = (config.tempSummerAvg + config.tempWinterAvg) / 2;
  const windScale = config.windAvg / GAMMA_1_5;

  let tempNoiseState = 0, loadNoiseState = 0;
  let weatherState = "clear", weatherRemainingHr = 0, weatherDerate = 1;

  // The AR(1) noise processes below were calibrated at 1-hour steps. Scale
  // the per-step decay and injected-noise magnitude so the *hourly*
  // correlation length and variance stay the same regardless of stepHours —
  // otherwise a 5-minute resolution would look far noisier (or a 1-day
  // resolution far smoother) than intended, just from the step size.
  const tempDecay = Math.pow(0.85, stepHours);
  const loadDecay = Math.pow(0.70, stepHours);
  const noiseScale = Math.sqrt(stepHours);

  // Gust probability stays "per calendar day"; duration/placement convert
  // from hours into however many steps that spans at this resolution.
  const gustSpeedAt = new Float64Array(n);
  for (let d = 0; d < 365; d++) {
    if (rng() < config.gustProbPerDay) {
      const [gLo, gHi] = config.gustSpeedRange;
      const [dLo, dHi] = config.gustDurationHrRange;
      const gustSpeed = gLo + rng() * (gHi - gLo);
      const durationHr = dLo + rng() * (dHi - dLo);
      const durationSteps = Math.max(1, Math.round(durationHr / stepHours));
      const startHrInDay = rng() * 24;
      const startStep = Math.round((d * 24 + startHrInDay) / stepHours);
      for (let h = startStep; h < Math.min(startStep + durationSteps, n); h++) {
        gustSpeedAt[h] = Math.max(gustSpeedAt[h], gustSpeed);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const elapsedHr = i * stepHours;
    const date = new Date(Date.UTC(TEMPLATE_YEAR, 0, 1) + elapsedHr * 3600000);
    const doy = elapsedHr / 24 + 1;
    const hour = elapsedHr % 24;

    const seasonal = Math.cos((2 * Math.PI * (doy - 172)) / 365);
    const diurnal = 1.5 * Math.cos((2 * Math.PI * (hour - 15)) / 24);
    tempNoiseState = tempDecay * tempNoiseState + (rng() - 0.5) * 1.2 * noiseScale;
    temperature[i] = tempMean - tempAmp * seasonal + diurnal + tempNoiseState;

    const weibull = windScale * Math.pow(-Math.log(1 - rng()), 1 / config.weibullK);
    windSpeed[i] = Math.min(Math.max(weibull, gustSpeedAt[i]), 55);

    if (weatherRemainingHr <= 0) {
      const r = rng();
      if (r < 0.03) { weatherState = "whiteout"; weatherRemainingHr = 4 + rng() * 44; weatherDerate = rng() * 0.05; }
      else if (r < 0.28) { weatherState = "overcast"; weatherRemainingHr = 8 + rng() * 88; weatherDerate = 0.10 + rng() * 0.20; }
      else { weatherState = "clear"; weatherRemainingHr = 8 + rng() * 88; weatherDerate = 1; }
    }
    weather[i] = weatherState;
    weatherRemainingHr -= stepHours;

    const declination = 23.44 * Math.sin((2 * Math.PI / 365) * (doy - 81));
    const hourAngle = 15 * (hour - 12);
    const latRad = (config.latitudeDeg * Math.PI) / 180;
    const declRad = (declination * Math.PI) / 180;
    const haRad = (hourAngle * Math.PI) / 180;
    const sinElev = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
    irradiance[i] = Math.max(sinElev, 0) * 550 * weatherDerate;

    const isSummerMonth = [10, 11, 0, 1].includes(date.getUTCMonth());
    const crewRatio = config.crewSummer / config.crewWinter;
    const crewFactor = isSummerMonth ? 1 + (crewRatio - 1) * 0.5 : 1;
    const heatingFactor = Math.min(Math.max((0 - temperature[i]) / 30, 0.15), 1.6);
    const diurnalBump = 1 + 0.10 * Math.cos((2 * Math.PI * (hour - 14)) / 24);
    let load = config.peakLoad * 0.75 * crewFactor * diurnalBump * (0.55 + 0.45 * (heatingFactor / 1.6));
    loadNoiseState = loadDecay * loadNoiseState + (rng() - 0.5) * 0.06 * load * noiseScale;
    load += loadNoiseState;
    if (rng() < Math.min(1, 0.01 * stepHours)) load += 5 + rng() * 15;
    totalLoad[i] = Math.max(load, 20);

    for (const key of Object.keys(loadSplit)) {
      loadBreakdown[key][i] = totalLoad[i] * loadSplit[key];
    }
  }

  return { temperature, windSpeed, weather, irradiance, totalLoad, loadBreakdown, stepHours, stepMinutes };
}

function windOutputKw(speed, capacityKw, cutIn = DEFAULT_WIND_CUT_IN_MS, rated = DEFAULT_WIND_RATED_MS, cutOut = DEFAULT_WIND_CUT_OUT_MS) {
  if (speed < cutIn || speed > cutOut) return 0;
  if (speed >= rated) return capacityKw;
  return capacityKw * Math.pow((speed - cutIn) / (rated - cutIn), 3);
}

// Solar PV panel response: linear ramp from 0 up to `saturation` W/m²,
// clamped at rated capacity above that — mirrors the inline formula
// runDispatch already used, pulled out so the Renewables page can trace
// the same curve for any irradiance value (not just simulated steps).
const DEFAULT_PV_SATURATION_WM2 = 800;
function pvOutputKw(irradiance, capacityKw, saturation = DEFAULT_PV_SATURATION_WM2) {
  return Math.min(Math.max(irradiance / saturation, 0), 1) * capacityKw;
}

function runDispatch(env, config, { windOn, solarOn }, params = {}) {
  const {
    socMin = DEFAULT_SOC_MIN, socMax = DEFAULT_SOC_MAX,
    roundTripEff = DEFAULT_ROUND_TRIP_EFF, dieselKwhPerL = DEFAULT_DIESEL_KWH_PER_L,
    runwayWindowDays = DEFAULT_RUNWAY_WINDOW_DAYS,
    windCutIn = DEFAULT_WIND_CUT_IN_MS, windRated = DEFAULT_WIND_RATED_MS, windCutOut = DEFAULT_WIND_CUT_OUT_MS,
  } = params;
  // stepHours travels with `env` (set by generateEnvironment) so dispatch
  // always matches whatever resolution the environment was generated at.
  const stepHours = env.stepHours;
  const n = env.totalLoad.length;
  const pv = new Float64Array(n);
  const wind = new Float64Array(n);
  const dieselOut = new Float64Array(n);
  const batterySoc = new Float64Array(n);
  const batteryFlow = new Float64Array(n);
  const unmet = new Float64Array(n);
  const fuelBurnL = new Float64Array(n);
  const tankLevelL = new Float64Array(n);
  const notes = new Array(n);

  const batteryCap = config.batteryCapacityKwh;
  const maxDieselKw = config.dieselGensetKw.reduce((a, b) => a + b, 0);
  let tank = config.dieselTankCapacityL;
  let soc = 0.6;

  for (let i = 0; i < n; i++) {
    pv[i] = solarOn ? pvOutputKw(env.irradiance[i], config.pvCapacity) : 0;
    wind[i] = windOn ? windOutputKw(env.windSpeed[i], config.windCapacity, windCutIn, windRated, windCutOut) : 0;

    const renewables = pv[i] + wind[i]; // kW — instantaneous/average power for this step
    const load = env.totalLoad[i];
    const net = renewables - load; // kW

    let socDeltaKwh = 0;

    if (net >= 0) {
      // Energy (kWh) available to charge over this step's duration.
      const roomKwh = Math.max((socMax - soc) * batteryCap, 0);
      const chargeKwh = Math.min(net * stepHours, roomKwh);
      batteryFlow[i] = -(chargeKwh / stepHours); // back to an average kW figure
      dieselOut[i] = 0;
      socDeltaKwh = chargeKwh * roundTripEff;
      notes[i] = `Renewables covering load with ${Math.round(net)} kW surplus — charging battery.`;
    } else {
      const deficitKwh = -net * stepHours;
      const availableKwh = Math.max((soc - socMin) * batteryCap, 0);
      const fromBattKwh = Math.min(deficitKwh, availableKwh);
      batteryFlow[i] = fromBattKwh / stepHours;
      socDeltaKwh = -fromBattKwh;
      const remainingKwh = deficitKwh - fromBattKwh;
      if (remainingKwh > 0) {
        const remainingKw = remainingKwh / stepHours;
        const d = Math.min(remainingKw, maxDieselKw);
        dieselOut[i] = d;
        if (remainingKw > maxDieselKw) {
          unmet[i] = remainingKw - maxDieselKw;
          notes[i] = `Deficit exceeds battery+diesel capacity — non-critical load-shed triggered.`;
        } else {
          notes[i] = `Battery depleted to reserve floor — diesel covering remaining ${Math.round(remainingKw)} kW.`;
        }
      } else {
        notes[i] = `Battery covering ${Math.round(fromBattKwh / stepHours)} kW deficit — diesel not needed.`;
      }
    }

    soc = Math.min(Math.max(soc + socDeltaKwh / batteryCap, 0), 1);
    batterySoc[i] = soc * 100;

    fuelBurnL[i] = (dieselOut[i] * stepHours) / dieselKwhPerL;
    tank -= fuelBurnL[i];
    tankLevelL[i] = tank;
  }

  const windowHours = 24 * runwayWindowDays;
  const windowSteps = Math.max(1, Math.round(windowHours / stepHours));
  const minRealisticBurnPerDay = (maxDieselKw * 0.02 * 24) / dieselKwhPerL;
  const fuelRunwayDays = new Float64Array(n);
  let runningSum = 0;
  for (let i = 0; i < n; i++) {
    runningSum += fuelBurnL[i];
    if (i >= windowSteps) runningSum -= fuelBurnL[i - windowSteps];
    const stepsCounted = Math.min(i + 1, windowSteps);
    const hoursCounted = stepsCounted * stepHours;
    const perDay = Math.max((runningSum / hoursCounted) * 24, minRealisticBurnPerDay);
    fuelRunwayDays[i] = tankLevelL[i] / perDay;
  }

  return { pv, wind, dieselOut, batterySoc, batteryFlow, unmet, fuelBurnL, tankLevelL, fuelRunwayDays, notes, stepHours };
}

/* ============================================================
   RESOLUTION AGGREGATION
   The physics always runs at SIM_STEP_MINUTES. These helpers fold the fine
   simulation arrays up to whatever output resolution the user picked, so
   the resolution selector changes how many points are shown, not what the
   results actually say.
   ============================================================ */
function aggregateFloat(fineArr, fineStepHours, targetStepHours, mode = "avg") {
  if (targetStepHours <= fineStepHours) return fineArr;
  const n = fineArr.length;
  const totalHours = n * fineStepHours;
  const outN = Math.max(1, Math.round(totalHours / targetStepHours));
  const stepRatio = targetStepHours / fineStepHours;
  const out = new Float64Array(outN);
  for (let j = 0; j < outN; j++) {
    const lo = Math.min(Math.round(j * stepRatio), n - 1);
    const hi = Math.min(Math.round((j + 1) * stepRatio), n);
    if (hi <= lo) { out[j] = j > 0 ? out[j - 1] : fineArr[n - 1]; continue; }
    if (mode === "last") {
      out[j] = fineArr[hi - 1];
    } else if (mode === "sum") {
      let s = 0;
      for (let k = lo; k < hi; k++) s += fineArr[k];
      out[j] = s;
    } else {
      let s = 0;
      for (let k = lo; k < hi; k++) s += fineArr[k];
      out[j] = s / (hi - lo);
    }
  }
  return out;
}

function aggregateLabel(fineArr, fineStepHours, targetStepHours, mode = "last") {
  if (targetStepHours <= fineStepHours) return fineArr;
  const n = fineArr.length;
  const totalHours = n * fineStepHours;
  const outN = Math.max(1, Math.round(totalHours / targetStepHours));
  const stepRatio = targetStepHours / fineStepHours;
  const out = new Array(outN);
  for (let j = 0; j < outN; j++) {
    const lo = Math.min(Math.round(j * stepRatio), n - 1);
    const hi = Math.min(Math.round((j + 1) * stepRatio), n);
    if (hi <= lo) { out[j] = j > 0 ? out[j - 1] : fineArr[n - 1]; continue; }
    out[j] = mode === "first" ? fineArr[lo] : fineArr[hi - 1];
  }
  return out;
}

function aggregateEnvironment(fineEnv, targetStepMinutes) {
  const targetStepHours = targetStepMinutes / 60;
  if (targetStepHours <= fineEnv.stepHours) return fineEnv;
  const fs = fineEnv.stepHours, ts = targetStepHours;
  return {
    temperature: aggregateFloat(fineEnv.temperature, fs, ts),
    windSpeed:   aggregateFloat(fineEnv.windSpeed,   fs, ts),
    weather:     aggregateLabel(fineEnv.weather,     fs, ts),
    irradiance:  aggregateFloat(fineEnv.irradiance,  fs, ts),
    totalLoad:   aggregateFloat(fineEnv.totalLoad,   fs, ts),
    loadBreakdown: {
      heating:        aggregateFloat(fineEnv.loadBreakdown.heating,        fs, ts),
      lifeSupport:    aggregateFloat(fineEnv.loadBreakdown.lifeSupport,    fs, ts),
      labColdStorage: aggregateFloat(fineEnv.loadBreakdown.labColdStorage, fs, ts),
      comms:          aggregateFloat(fineEnv.loadBreakdown.comms,          fs, ts),
      general:        aggregateFloat(fineEnv.loadBreakdown.general,        fs, ts),
    },
    stepHours: targetStepHours,
    stepMinutes: targetStepMinutes,
  };
}

function aggregateDispatch(fineDispatch, targetStepMinutes) {
  const targetStepHours = targetStepMinutes / 60;
  if (targetStepHours <= fineDispatch.stepHours) return fineDispatch;
  const fs = fineDispatch.stepHours, ts = targetStepHours;
  return {
    pv:             aggregateFloat(fineDispatch.pv,             fs, ts),
    wind:           aggregateFloat(fineDispatch.wind,           fs, ts),
    dieselOut:      aggregateFloat(fineDispatch.dieselOut,      fs, ts),
    batterySoc:     aggregateFloat(fineDispatch.batterySoc,     fs, ts, "last"),
    batteryFlow:    aggregateFloat(fineDispatch.batteryFlow,    fs, ts),
    unmet:          aggregateFloat(fineDispatch.unmet,          fs, ts),
    fuelBurnL:      aggregateFloat(fineDispatch.fuelBurnL,      fs, ts, "sum"),
    tankLevelL:     aggregateFloat(fineDispatch.tankLevelL,     fs, ts, "last"),
    fuelRunwayDays: aggregateFloat(fineDispatch.fuelRunwayDays, fs, ts, "last"),
    notes:          aggregateLabel(fineDispatch.notes,          fs, ts),
    stepHours:      ts,
  };
}

// Maps a real wall-clock Date onto the templated simulation year, at
// hour+minute+second(+ms) precision, so "now" always lines up exactly
// with the real clock instead of only to the nearest hour.
//
// Both `start` and `templated` are built with the *local* Date
// constructor (no Date.UTC, no getUTC* accessors) so the elapsed-hours
// math happens entirely in the viewer's own timezone. The previous
// version read local clock fields (now.getHours(), etc.) but then wrapped
// them in Date.UTC(...), which builds a UTC instant out of local-time
// numbers. Downstream, fmtSeasonPrecise() did the same mismatched
// construction and then called toLocaleString(), which converts that
// (already-shifted) UTC instant back into the local zone — shifting the
// displayed time by the UTC offset a *second* time. That's why the date
// still looked right (a few hours of drift rarely crosses midnight) while
// the time was off by the offset.
function getLiveIndex(now) {
  const start = new Date(TEMPLATE_YEAR, 0, 1, 0, 0, 0, 0);
  const templated = new Date(
    TEMPLATE_YEAR, now.getMonth(), now.getDate(),
    now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()
  );
  const hoursFloat = (templated - start) / 3600000;
  const idx = Math.min(Math.floor(hoursFloat), HOURS - 2);
  const frac = hoursFloat - idx;
  return { idx: Math.max(idx, 0), frac };
}
function interp(arr, idx, frac) {
  return arr[idx] + (arr[idx + 1] - arr[idx]) * frac;
}
// The timeline (simIndexFloat, chart "h" values, scrub range, etc.) is
// always expressed in continuous HOURS since Jan 1, regardless of how
// coarsely the underlying data was actually sampled. These convert an
// hours-since-start value into a (step index, fraction) pair for whatever
// resolution `stepHours` the data arrays were generated at, so a hour
// value can still be looked up correctly whether the data has 1 sample/hour
// or 1 sample/week.
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
function stepIndexAtHour(hourFloat, stepHours, n) {
  return timeToStepIndex(hourFloat, stepHours, n).i;
}
function runwayStatus(days) {
  if (days > 180) return { label: "Ample", color: "#4FD1A5" };
  if (days > 60) return { label: "Watch", color: "#E8A23D" };
  return { label: "Critical", color: "#E85D5D" };
}
function fmtTime(date) {
  return date.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
// Anchor for turning a simulation index back into a real Date. Must be
// built the same way (local, no UTC) as `start` in getLiveIndex so the
// two stay in lockstep — see the note on getLiveIndex above.
const SIM_EPOCH = new Date(TEMPLATE_YEAR, 0, 1, 0, 0, 0, 0);
function idxToDate(idxFloat) {
  return new Date(SIM_EPOCH.getTime() + idxFloat * 3600000);
}
// Coarse label used for chart axis ticks at wide zoom (hour resolution).
function fmtSeason(idxFloat) {
  return idxToDate(idxFloat).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
}
// Precise label used for the main clock readout and tooltips — includes minutes & seconds.
function fmtSeasonPrecise(idxFloat) {
  return idxToDate(idxFloat).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
// Adaptive tick/tooltip label: resolution follows the current zoom window,
// right down to milliseconds once you're zoomed to ~1 second, so the
// sub-hour interpolation ramp is actually legible instead of every tick
// showing the same rounded hour.
function fmtAxisTick(idxFloat, windowHours) {
  const d = idxToDate(idxFloat);
  if (windowHours < 1 / 60) {
    const base = d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${base}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  }
  if (windowHours < 2) {
    return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (windowHours < 24 * 3) {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
}
// Human label for the current chart zoom window, e.g. "1s", "10m", "48h", "2.0w".
function fmtWindowLabel(hours) {
  if (hours < 1 / 60) return `${Math.round(hours * 3600)}s`;
  if (hours < 1) {
    const mins = hours * 60;
    return `${mins < 10 ? mins.toFixed(1) : Math.round(mins)}m`;
  }
  if (hours < 48) return `${Math.round(hours)}h`;
  if (hours < 24 * 14) return `${Math.round(hours / 24)}d`;
  if (hours < 24 * 60) return `${(hours / 168).toFixed(1)}w`;
  return `${(hours / 730).toFixed(1)}mo`;
}
// Human label for the gap between plotted chart points, e.g. "250ms", "2.3s", "4.0m".
function fmtIntervalLabel(seconds) {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(2) : Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// Wraps `pos` into the half-open loop range [lower, upper) — used for
// accelerated playback so it loops between a chosen start point and either
// "live now" or the end of the year, instead of always looping the whole
// 8760-hour array from zero.
function wrapAccel(pos, lower, upper) {
  const range = Math.max(upper - lower, 1e-6);
  return lower + (((pos - lower) % range) + range) % range;
}
// Rounds a window size to something clean at its own scale (whole hours
// once ≥2h, whole minutes down to 1min, whole seconds below that) instead
// of always rounding to the nearest whole hour — otherwise zooming below
// ~1h collapses straight to the MIN_WINDOW_HOURS floor.
function roundWindowHours(hours) {
  if (hours >= 2) return Math.round(hours);
  if (hours >= 1 / 60) return Math.round(hours * 60) / 60;
  return Math.round(hours * 3600) / 3600;
}

function Toggle({ on, onChange, label, sublabel }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      display: "flex", alignItems: "center", gap: 12,
      background: "#10151C", border: "1px solid #1F2A35",
      borderRadius: 10, padding: "10px 14px", cursor: "pointer",
      minWidth: 190, textAlign: "left",
    }}>
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: on ? "#4FD1A5" : "#2A3641",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", background: "#0A0E14",
          position: "absolute", top: 3, left: on ? 21 : 3, transition: "left 0.2s",
        }} />
      </div>
      <div>
        <div style={{ color: "#E8EEF2", fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ color: "#8B9AA8", fontSize: 11 }}>{sublabel}</div>
      </div>
    </button>
  );
}

// Renewable source card: on/off toggle + slider + exact-kW number input.
function RenewableControl({ label, on, onToggle, valueKw, onValueChange, maxKw, defaultKw }) {
  return (
    <div style={{
      background: "#10151C", border: "1px solid #1F2A35", borderRadius: 10,
      padding: "12px 14px", minWidth: 240, flex: 1, display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#E8EEF2", fontSize: 13, fontWeight: 600 }}>{label}</div>
        <button onClick={() => onToggle(!on)} title={on ? "Turn off" : "Turn on"} style={{
          width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", padding: 0,
          background: on ? "#4FD1A5" : "#2A3641", position: "relative", flexShrink: 0,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%", background: "#0A0E14",
            position: "absolute", top: 3, left: on ? 21 : 3, transition: "left 0.2s",
          }} />
        </button>
      </div>
      <input
        type="range" min={0} max={maxKw} step={1} value={valueKw} disabled={!on}
        onChange={(e) => onValueChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#5EC8E8", opacity: on ? 1 : 0.45, cursor: on ? "pointer" : "not-allowed" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number" min={0} max={maxKw} value={Math.round(valueKw)} disabled={!on}
          onChange={(e) => onValueChange(clamp(Number(e.target.value) || 0, 0, maxKw))}
          style={{
            width: 70, background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35",
            borderRadius: 6, padding: "5px 7px", fontSize: 12, opacity: on ? 1 : 0.6,
          }}
        />
        <span style={{ fontSize: 11, color: "#8B9AA8" }}>kW {on ? "installed" : "(off)"}</span>
        {Math.round(valueKw) !== defaultKw && (
          <button onClick={() => onValueChange(defaultKw)} style={{
            marginLeft: "auto", fontSize: 10, color: "#5EC8E8", background: "none",
            border: "none", cursor: "pointer", textDecoration: "underline",
          }}>reset to {defaultKw}</button>
        )}
      </div>
    </div>
  );
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

function ModeButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
      border: `1px solid ${active ? "#4FD1A5" : "#1F2A35"}`,
      background: active ? "#12241C" : "#10151C",
      color: active ? "#4FD1A5" : "#8B9AA8",
    }}>{children}</button>
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

/* ============================================================
   MAIN DASHBOARD
   ============================================================ */
export default function PolarTwinDashboard() {
  const [page, setPage] = useState("dashboard"); // "dashboard" | "renewables" | "parameters"
  const [station, setStation] = useState("maitri");
  const [windOn, setWindOn] = useState(true);
  const [solarOn, setSolarOn] = useState(true);
  const [mode, setMode] = useState("live"); // "live" | "accelerated" | "manual"
  const [speedIdx, setSpeedIdx] = useState(4); // index into SPEED_OPTIONS ("3 hours / sec")
  const [customSpeedOn, setCustomSpeedOn] = useState(false);
  const [customHoursPerSec, setCustomHoursPerSec] = useState(2);
  const [accelPaused, setAccelPaused] = useState(false);
  // Where accelerated playback loops back to, and whether it's allowed to
  // roam the whole 8760-hour year or only the window up to live "now".
  const [accelFullTimeline, setAccelFullTimeline] = useState(false);
  const [accelStartIdx, setAccelStartIdx] = useState(() => {
    const { idx, frac } = getLiveIndex(new Date());
    return idx + frac;
  });
  const [scrubIdx, setScrubIdx] = useState(4000);
  const [seeds, setSeeds] = useState(DEFAULT_SEEDS);
  const [seedInput, setSeedInput] = useState({ maitri: String(DEFAULT_SEEDS.maitri), bharati: String(DEFAULT_SEEDS.bharati) });
  const [capacities, setCapacities] = useState({
    maitri: { pv: DEFAULT_STATIONS.maitri.pvCapacity, wind: DEFAULT_STATIONS.maitri.windCapacity },
    bharati: { pv: DEFAULT_STATIONS.bharati.pvCapacity, wind: DEFAULT_STATIONS.bharati.windCapacity },
  });
  // Editable site/climate + power-system BASE config, per station. Starts
  // as a deep copy of DEFAULT_STATIONS so DEFAULT_STATIONS itself always
  // stays intact as the factory-reset target (surfaced on the Parameters
  // page). `capacities` above remains the separate "effective/installed"
  // override layer for PV & wind (the existing slider), independent of
  // whatever base capacity is set here.
  const [stationConfigs, setStationConfigs] = useState(() => ({
    maitri: { ...DEFAULT_STATIONS.maitri, gustSpeedRange: [...DEFAULT_STATIONS.maitri.gustSpeedRange], gustDurationHrRange: [...DEFAULT_STATIONS.maitri.gustDurationHrRange], dieselGensetKw: [...DEFAULT_STATIONS.maitri.dieselGensetKw] },
    bharati: { ...DEFAULT_STATIONS.bharati, gustSpeedRange: [...DEFAULT_STATIONS.bharati.gustSpeedRange], gustDurationHrRange: [...DEFAULT_STATIONS.bharati.gustDurationHrRange], dieselGensetKw: [...DEFAULT_STATIONS.bharati.dieselGensetKw] },
  }));
  // Editable model constants (previously hardcoded module-level constants).
  const [loadSplit, setLoadSplit] = useState({ ...DEFAULT_LOAD_SPLIT });
  const [dispatchParams, setDispatchParams] = useState({ ...DEFAULT_DISPATCH_PARAMS });
  const [windCurveParams, setWindCurveParams] = useState({ ...DEFAULT_WIND_CURVE_PARAMS });
  const [historyWindowHours, setHistoryWindowHours] = useState(DEFAULT_WINDOW_HOURS);
  const [customWindowValue, setCustomWindowValue] = useState(2);
  const [customWindowUnit, setCustomWindowUnit] = useState("days");
  // Data-generation resolution (how often the simulation's results are
  // sampled for display). The physics always runs at SIM_STEP_MINUTES
  // internally; this only controls the aggregation/sampling layer.
  const [stepMinutes, setStepMinutes] = useState(DEFAULT_STEP_MINUTES);
  const [customStepOn, setCustomStepOn] = useState(false);
  const [customStepValue, setCustomStepValue] = useState(1);
  const [customStepUnit, setCustomStepUnit] = useState("hours");
  const [tick, setTick] = useState(0);
  const [realNow, setRealNow] = useState(new Date());

  const accelBase = useRef({ startReal: Date.now(), startSimIdx: 0 });

  const hoursPerSec = customSpeedOn
    ? clamp(customHoursPerSec, MIN_CUSTOM_HPS, MAX_CUSTOM_HPS)
    : SPEED_OPTIONS[speedIdx].hoursPerSec;

  // ---- Fine physics layer: ALWAYS runs at SIM_STEP_MINUTES. -----------------
  // Regenerated when station, seed, base station config, or the load-split
  // shares change (expensive layer).
  const fineEnvByStation = useMemo(() => ({
    maitri:  generateEnvironment(stationConfigs.maitri,  seeds.maitri,  SIM_STEP_MINUTES, loadSplit),
    bharati: generateEnvironment(stationConfigs.bharati, seeds.bharati, SIM_STEP_MINUTES, loadSplit),
  }), [seeds, stationConfigs, loadSplit]);

  // Display layer: same physics, just aggregated up to the user's output
  // resolution. This is what feeds all charts / readouts below.
  const envByStation = useMemo(() => ({
    maitri:  aggregateEnvironment(fineEnvByStation.maitri,  stepMinutes),
    bharati: aggregateEnvironment(fineEnvByStation.bharati, stepMinutes),
  }), [fineEnvByStation, stepMinutes]);

  const effectiveConfig = useMemo(() => ({
    ...stationConfigs[station],
    pvCapacity: capacities[station].pv,
    windCapacity: capacities[station].wind,
  }), [station, capacities, stationConfigs]);

  // Bundled dispatch-model params so the memo below has one stable dep.
  const dispatchModelParams = useMemo(() => ({
    ...dispatchParams,
    windCutIn: windCurveParams.cutIn, windRated: windCurveParams.rated, windCutOut: windCurveParams.cutOut,
  }), [dispatchParams, windCurveParams]);

  // ---- Fine dispatch: runs on the fine environment --------------------------
  // This is what makes fuel burn / tank level / fuel runway consistent
  // across every output-resolution setting.
  const fineDispatch = useMemo(() => {
    return runDispatch(fineEnvByStation[station], effectiveConfig, { windOn, solarOn }, dispatchModelParams);
  }, [station, windOn, solarOn, fineEnvByStation, effectiveConfig, dispatchModelParams]);

  // Display dispatch: aggregated to the user's chosen output resolution.
  const dispatch = useMemo(() => {
    return aggregateDispatch(fineDispatch, stepMinutes);
  }, [fineDispatch, stepMinutes]);

  const config = stationConfigs[station];
  const env = envByStation[station];

  // Theoretical turbine power curve for the current wind capacity — a pure
  // function of speed, independent of time/weather. Sampled finely (0.2
  // m/s steps) from 0 up to just past cut-out so the chart traces the full
  // cut-in -> cubic ramp -> rated plateau -> cut-out shape cleanly.
  const windCurveData = useMemo(() => {
    const capacity = effectiveConfig.windCapacity;
    const pts = [];
    for (let s = 0; s <= 30; s += 0.2) {
      pts.push({ speed: Math.round(s * 10) / 10, output: Math.round(windOutputKw(s, capacity, windCurveParams.cutIn, windCurveParams.rated, windCurveParams.cutOut) * 10) / 10 });
    }
    return pts;
  }, [effectiveConfig.windCapacity, windCurveParams]);

  // Theoretical PV panel-response curve for the current PV capacity — a
  // pure function of irradiance, independent of time/weather. Sampled
  // every 10 W/m² from 0 up to just past the saturation point so the
  // chart traces the full linear ramp -> plateau shape cleanly.
  const solarCurveData = useMemo(() => {
    const capacity = effectiveConfig.pvCapacity;
    const pts = [];
    for (let irr = 0; irr <= 900; irr += 10) {
      pts.push({ irradiance: irr, output: Math.round(pvOutputKw(irr, capacity) * 10) / 10 });
    }
    return pts;
  }, [effectiveConfig.pvCapacity]);

  // Continuously-updated "where is live now" position, used to bound
  // accelerated playback when the full-year timeline isn't unlocked.
  const liveNowFloat = (() => {
    const { idx, frac } = getLiveIndex(realNow);
    return idx + frac;
  })();
  const accelStartMax = accelFullTimeline ? HOURS - 2 : liveNowFloat;

  // Real wall-clock ticks every second, always — this is what keeps the
  // header clock and the "live" simulation index exactly in sync with
  // real time instead of drifting or only updating on interaction.
  useEffect(() => {
    // 100ms rather than 1000ms so the "live" cursor — and any chart zoomed
    // in near the 1-second floor — glides smoothly instead of jumping once
    // a second. The clock text itself still only shows whole seconds.
    const t = setInterval(() => setRealNow(new Date()), 100);
    return () => clearInterval(t);
  }, []);

  // Accelerated mode needs a faster re-render tick so playback looks smooth.
  useEffect(() => {
    if (mode !== "accelerated" || accelPaused) return;
    const t = setInterval(() => setTick((x) => x + 1), 100);
    return () => clearInterval(t);
  }, [mode, accelPaused]);

  // When switching INTO accelerated mode, anchor to the chosen start point
  // (accelStartIdx) rather than always jumping to live "now" — the start
  // point is picked separately via the "Start from" control below.
  useEffect(() => {
    if (mode === "accelerated") {
      accelBase.current = { startReal: Date.now(), startSimIdx: accelStartIdx };
      setAccelPaused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // If the full-year timeline gets locked back down while the chosen start
  // point is out beyond live "now", pull it back in so the loop bounds
  // stay valid (lower ≤ upper).
  useEffect(() => {
    if (!accelFullTimeline) {
      setAccelStartIdx((s) => Math.min(s, liveNowFloat));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accelFullTimeline]);

  // Re-anchor whenever playback speed changes, so the position doesn't
  // jump — the elapsed real time under the OLD speed is folded into the
  // new base instead of being re-applied at the new rate.
  const prevHoursPerSec = useRef(hoursPerSec);
  useEffect(() => {
    if (mode === "accelerated" && !accelPaused && prevHoursPerSec.current !== hoursPerSec) {
      const elapsedSec = (Date.now() - accelBase.current.startReal) / 1000;
      const current = wrapAccel(
        accelBase.current.startSimIdx + elapsedSec * prevHoursPerSec.current,
        accelStartIdx, accelStartMax
      );
      accelBase.current = { startReal: Date.now(), startSimIdx: current };
    }
    prevHoursPerSec.current = hoursPerSec;
  }, [hoursPerSec, mode, accelPaused]);

  // When switching INTO manual mode, start the scrubber at "now" instead
  // of a fixed default index — this is what fixed the jump/glitch feeling
  // when the mode was toggled.
  useEffect(() => {
    if (mode === "manual") {
      const { idx, frac } = getLiveIndex(new Date());
      setScrubIdx(idx + frac);
    }
  }, [mode]);

  // Keep the seed text inputs showing the active seed (e.g. after Regenerate).
  useEffect(() => {
    setSeedInput({ maitri: String(seeds.maitri), bharati: String(seeds.bharati) });
  }, [seeds]);

  const togglePause = () => {
    if (!accelPaused) {
      const elapsedSec = (Date.now() - accelBase.current.startReal) / 1000;
      const frozen = wrapAccel(accelBase.current.startSimIdx + elapsedSec * hoursPerSec, accelStartIdx, accelStartMax);
      accelBase.current = { startReal: Date.now(), startSimIdx: frozen };
      setAccelPaused(true);
    } else {
      accelBase.current = { startReal: Date.now(), startSimIdx: accelBase.current.startSimIdx };
      setAccelPaused(false);
    }
  };
  const jumpToNow = () => {
    const { idx, frac } = getLiveIndex(new Date());
    accelBase.current = { startReal: Date.now(), startSimIdx: idx + frac };
    setAccelPaused(false);
  };
  // Moves the loop's start point and, if we're already in accelerated
  // mode, immediately restarts playback from the new start.
  const updateAccelStart = (val) => {
    setAccelStartIdx(val);
    if (mode === "accelerated") {
      accelBase.current = { startReal: Date.now(), startSimIdx: val };
      setAccelPaused(false);
    }
  };

  let simIndexFloat;
  if (mode === "manual") {
    simIndexFloat = scrubIdx;
  } else if (mode === "live") {
    const { idx, frac } = getLiveIndex(realNow);
    simIndexFloat = idx + frac;
  } else if (accelPaused) {
    simIndexFloat = accelBase.current.startSimIdx;
  } else {
    const elapsedSec = (Date.now() - accelBase.current.startReal) / 1000;
    const rawPos = accelBase.current.startSimIdx + elapsedSec * hoursPerSec;
    simIndexFloat = wrapAccel(rawPos, accelStartIdx, accelStartMax);
  }
  const idx = Math.max(0, Math.min(Math.floor(simIndexFloat), HOURS - 2));
  const frac = simIndexFloat - idx;
  // Step index into the actual (possibly coarser/finer-than-hourly) data
  // arrays, at the current simulated moment.
  const curStepIdx = stepIndexAtHour(simIndexFloat, env.stepHours, env.weather.length);

  const snapshot = {
    temperature: interpAtHour(env.temperature, simIndexFloat, env.stepHours),
    windSpeed: interpAtHour(env.windSpeed, simIndexFloat, env.stepHours),
    irradiance: interpAtHour(env.irradiance, simIndexFloat, env.stepHours),
    load: interpAtHour(env.totalLoad, simIndexFloat, env.stepHours),
    pv: interpAtHour(dispatch.pv, simIndexFloat, env.stepHours),
    wind: interpAtHour(dispatch.wind, simIndexFloat, env.stepHours),
    diesel: interpAtHour(dispatch.dieselOut, simIndexFloat, env.stepHours),
    soc: interpAtHour(dispatch.batterySoc, simIndexFloat, env.stepHours),
    runway: interpAtHour(dispatch.fuelRunwayDays, simIndexFloat, env.stepHours),
    weather: env.weather[curStepIdx],
  };
  const status = runwayStatus(snapshot.runway);

  // History-only window: only time up to and including "now" is plotted —
  // never future/not-yet-elapsed data. Points are sampled at *continuous*
  // (fractional-hour) positions via interp(), not just at whole-hour array
  // indices, so zooming all the way in to a 1-second window still shows a
  // smooth interpolation ramp instead of one or two flat dots. At wide
  // zoom the same continuous sampling just spreads across the window,
  // capped at MAX_CHART_POINTS — equivalent to the old downsampling.
  const nowFloat = idx + frac;
  const windowStart = Math.max(0, nowFloat - historyWindowHours);
  const span = Math.max(nowFloat - windowStart, 1 / 3600000); // guard against a zero-length window
  const pointsForResolution = Math.ceil((span * 3600) / MIN_SAMPLE_SECONDS) + 1;
  const numPoints = Math.max(2, Math.min(MAX_CHART_POINTS, pointsForResolution));
  const chartData = [];
  for (let k = 0; k < numPoints; k++) {
    const t = k === numPoints - 1 ? nowFloat : windowStart + (span * k) / (numPoints - 1);
    chartData.push({
      h: t,
      load: Math.round(interpAtHour(env.totalLoad, t, env.stepHours)),
      renewables: Math.round(interpAtHour(dispatch.pv, t, env.stepHours) + interpAtHour(dispatch.wind, t, env.stepHours)),
      diesel: Math.round(interpAtHour(dispatch.dieselOut, t, env.stepHours)),
      soc: Math.round(interpAtHour(dispatch.batterySoc, t, env.stepHours)),
      windSpeed: Math.round(interpAtHour(env.windSpeed, t, env.stepHours) * 10) / 10,
      windOutput: Math.round(interpAtHour(dispatch.wind, t, env.stepHours)),
      irradiance: Math.round(interpAtHour(env.irradiance, t, env.stepHours)),
      pvOutput: Math.round(interpAtHour(dispatch.pv, t, env.stepHours)),
    });
  }
  const tickInterval = Math.max(0, Math.floor(chartData.length / 7) - 1);
  const sampleIntervalSec = numPoints > 1 ? (span * 3600) / (numPoints - 1) : 0;

  const yearOverview = [];
  for (let i = 0; i < HOURS; i += 24 * 7) {
    const si = stepIndexAtHour(i, env.stepHours, dispatch.tankLevelL.length);
    yearOverview.push({ h: i, tank: Math.round(dispatch.tankLevelL[si] / 1000) });
  }

  const recentNotes = [];
  for (let k = curStepIdx; k > Math.max(0, curStepIdx - 6); k--) {
    recentNotes.push({ i: k * env.stepHours, note: dispatch.notes[k] });
  }

  const regenerate = () => {
    setSeeds({ maitri: Math.floor(Math.random() * 1e6), bharati: Math.floor(Math.random() * 1e6) });
  };
  const useDefaultSeed = () => setSeeds(DEFAULT_SEEDS);
  const applySeed = (key) => {
    const val = parseInt(seedInput[key], 10);
    if (Number.isNaN(val)) return;
    setSeeds((prev) => (prev[key] === val ? prev : { ...prev, [key]: val }));
  };

  const pvMax = Math.round(stationConfigs[station].pvCapacity * 2);
  const windMax = Math.round(stationConfigs[station].windCapacity * 2);

  const isDefaultSeed = seeds.maitri === DEFAULT_SEEDS.maitri && seeds.bharati === DEFAULT_SEEDS.bharati;

  const zoomIn = () => setHistoryWindowHours((w) => clamp(roundWindowHours(w / ZOOM_FACTOR), MIN_WINDOW_HOURS, MAX_WINDOW_HOURS));
  const zoomOut = () => setHistoryWindowHours((w) => clamp(roundWindowHours(w * ZOOM_FACTOR), MIN_WINDOW_HOURS, MAX_WINDOW_HOURS));
  const resetZoom = () => setHistoryWindowHours(DEFAULT_WINDOW_HOURS);
  const applyCustomWindow = () => {
    const hrs = clamp(roundWindowHours((Number(customWindowValue) || 0) * WINDOW_UNIT_HOURS[customWindowUnit]), MIN_WINDOW_HOURS, MAX_WINDOW_HOURS);
    setHistoryWindowHours(hrs);
  };

  const isDefaultStep = stepMinutes === DEFAULT_STEP_MINUTES && !customStepOn;
  const applyCustomStep = () => {
    const mins = clamp(Math.round((Number(customStepValue) || 0) * STEP_UNIT_MINUTES[customStepUnit]), MIN_STEP_MINUTES, MAX_STEP_MINUTES);
    setStepMinutes(mins);
  };
  const useDefaultStep = () => {
    setStepMinutes(DEFAULT_STEP_MINUTES);
    setCustomStepOn(false);
    setCustomStepValue(1);
    setCustomStepUnit("hours");
  };

  /* ----------------------------------------------------------------
     Handlers for the newly-editable Parameters-page fields
     ---------------------------------------------------------------- */
  // Scalar base-config fields (latitude, crew, temps, wind avg, weibull k,
  // gust probability, peak load, base PV/wind capacity, battery, tank).
  const updateBaseField = (field, value) => {
    setStationConfigs((prev) => ({ ...prev, [station]: { ...prev[station], [field]: value } }));
  };
  // Two-element array base-config fields (gustSpeedRange, gustDurationHrRange).
  const updateBaseRangeField = (field, idx, value) => {
    setStationConfigs((prev) => {
      const arr = [...prev[station][field]];
      arr[idx] = value;
      return { ...prev, [station]: { ...prev[station], [field]: arr } };
    });
  };
  // Variable-length diesel genset array (add/remove/edit).
  const updateDieselGensets = (newArr) => {
    setStationConfigs((prev) => ({ ...prev, [station]: { ...prev[station], dieselGensetKw: newArr } }));
  };
  const resetBaseField = (field) => {
    setStationConfigs((prev) => ({
      ...prev,
      [station]: {
        ...prev[station],
        [field]: Array.isArray(DEFAULT_STATIONS[station][field])
          ? [...DEFAULT_STATIONS[station][field]]
          : DEFAULT_STATIONS[station][field],
      },
    }));
  };

  // Effective (installed/override) PV & wind capacity — same state the
  // Dashboard's slider already writes to, just addressed by the base-config
  // field name ("pvCapacity"/"windCapacity") for a uniform Parameters-page API.
  const updateEffectiveCapacity = (field, value) => {
    const key = field === "pvCapacity" ? "pv" : "wind";
    setCapacities((c) => ({ ...c, [station]: { ...c[station], [key]: value } }));
  };
  const resetEffectiveCapacity = (field) => {
    const key = field === "pvCapacity" ? "pv" : "wind";
    setCapacities((c) => ({ ...c, [station]: { ...c[station], [key]: stationConfigs[station][field] } }));
  };

  // Load-split shares (must conceptually sum to 100% — normalize rescales
  // them to do so without the user having to hand-balance every field).
  const updateLoadSplit = (key, value) => {
    setLoadSplit((prev) => ({ ...prev, [key]: value }));
  };
  const normalizeLoadSplit = () => {
    setLoadSplit((prev) => {
      const sum = Object.values(prev).reduce((a, b) => a + b, 0) || 1;
      const next = {};
      for (const k of Object.keys(prev)) next[k] = prev[k] / sum;
      return next;
    });
  };
  const resetLoadSplit = () => setLoadSplit({ ...DEFAULT_LOAD_SPLIT });

  // Dispatch & battery model constants (SOC floor/ceiling, round-trip
  // efficiency, diesel efficiency, runway averaging window).
  const updateDispatchParam = (field, value) => setDispatchParams((p) => ({ ...p, [field]: value }));
  const resetDispatchParam = (field) => setDispatchParams((p) => ({ ...p, [field]: DEFAULT_DISPATCH_PARAMS[field] }));

  // Wind turbine power-curve breakpoints.
  const updateWindCurveParam = (field, value) => setWindCurveParams((p) => ({ ...p, [field]: value }));
  const resetWindCurveParam = (field) => setWindCurveParams((p) => ({ ...p, [field]: DEFAULT_WIND_CURVE_PARAMS[field] }));

  // Single "reset everything" for the Parameters page — puts every
  // editable field on that page (current station's base config, its
  // effective PV/wind capacity override, the data seed, sample
  // resolution, chart window, load split, dispatch/battery constants,
  // and wind-curve breakpoints) back to its factory default in one go.
  const resetAllParameters = () => {
    setStationConfigs((prev) => ({
      ...prev,
      [station]: {
        ...DEFAULT_STATIONS[station],
        gustSpeedRange: [...DEFAULT_STATIONS[station].gustSpeedRange],
        gustDurationHrRange: [...DEFAULT_STATIONS[station].gustDurationHrRange],
        dieselGensetKw: [...DEFAULT_STATIONS[station].dieselGensetKw],
      },
    }));
    setCapacities((c) => ({
      ...c,
      [station]: { pv: DEFAULT_STATIONS[station].pvCapacity, wind: DEFAULT_STATIONS[station].windCapacity },
    }));
    setSeeds(DEFAULT_SEEDS);
    setStepMinutes(DEFAULT_STEP_MINUTES);
    setCustomStepOn(false);
    setCustomStepValue(1);
    setCustomStepUnit("hours");
    setHistoryWindowHours(DEFAULT_WINDOW_HOURS);
    setLoadSplit({ ...DEFAULT_LOAD_SPLIT });
    setDispatchParams({ ...DEFAULT_DISPATCH_PARAMS });
    setWindCurveParams({ ...DEFAULT_WIND_CURVE_PARAMS });
  };

  return (
    // position:fixed + inset:0 pins this layer to the full viewport
    // regardless of how the parent element sizes itself (a parent that
    // only wraps to its content's width/height is the usual reason a
    // full-page layout like this ends up looking cropped or narrow, and
    // it's also why the charts below can end up with 0 width and render
    // blank — recharts' ResponsiveContainer needs a parent with a real,
    // nonzero measured size to draw into).
    <div style={{ position: "fixed", inset: 0, overflow: "auto", boxSizing: "border-box" }}>
      <style>{`
        html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        input[type="number"]::-webkit-inner-spin-button { opacity: 1; }
      `}</style>
      <div style={{
        background: "#080B10", width: "100%", minHeight: "100%", padding: "24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        color: "#E8EEF2",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Polar Twin</div>
            <div style={{ color: "#8B9AA8", fontSize: 13, marginTop: 2 }}>Live energy monitor — {config.name} Station</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {Object.keys(stationConfigs).map((key) => (
              <button key={key} onClick={() => setStation(key)} style={{
                padding: "8px 18px", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${station === key ? "#5EC8E8" : "#1F2A35"}`,
                background: station === key ? "#132530" : "#10151C",
                color: station === key ? "#5EC8E8" : "#8B9AA8",
                fontWeight: 600, fontSize: 13,
              }}>{stationConfigs[key].name}</button>
            ))}
            <button onClick={useDefaultSeed} disabled={isDefaultSeed} title="Restores the original 42/43 seed pair the dashboard starts with"
              style={{
                padding: "8px 14px", borderRadius: 8, cursor: isDefaultSeed ? "default" : "pointer",
                border: `1px solid ${isDefaultSeed ? "#1F2A35" : "#2A3641"}`,
                background: isDefaultSeed ? "#0C1015" : "#10151C",
                color: isDefaultSeed ? "#4A5560" : "#8B9AA8",
                fontWeight: 600, fontSize: 12, marginLeft: 4, opacity: isDefaultSeed ? 0.6 : 1,
              }}>⟲ Default seed</button>
            <button onClick={regenerate} title="Draws a brand new RANDOM seed pair each click"
              style={{
                padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                border: "1px solid #2A3641", background: "#10151C", color: "#8B9AA8",
                fontWeight: 600, fontSize: 12,
              }}>↻ Regenerate (random seed)</button>
          </div>
        </div>

        {/* Page tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <ModeButton active={page === "dashboard"} onClick={() => setPage("dashboard")}>Dashboard</ModeButton>
          <ModeButton active={page === "renewables"} onClick={() => setPage("renewables")}>🌬 Renewable Resources</ModeButton>
          <ModeButton active={page === "parameters"} onClick={() => setPage("parameters")}>⚙ Parameters</ModeButton>
        </div>

        {page === "renewables" && (
          <RenewablesPage
            config={effectiveConfig}
            stationName={config.name}
            snapshot={snapshot}
            env={env}
            dispatch={dispatch}
            windCurveData={windCurveData}
            solarCurveData={solarCurveData}
            fmtWindowLabel={fmtWindowLabel}
            fmtAxisTick={fmtAxisTick}
            fmtIntervalLabel={fmtIntervalLabel}
            simIndexFloat={simIndexFloat}
          />
        )}

        {page === "parameters" && (
          <ParametersPage
            stationKey={station}
            stationName={config.name}
            stationOptions={Object.keys(stationConfigs).map((key) => ({ key, name: stationConfigs[key].name }))}
            onStationChange={setStation}
            baseConfig={stationConfigs[station]}
            defaultBaseConfig={DEFAULT_STATIONS[station]}
            onBaseFieldChange={updateBaseField}
            onBaseRangeFieldChange={updateBaseRangeField}
            onDieselGensetsChange={updateDieselGensets}
            onResetBaseField={resetBaseField}
            effectiveConfig={effectiveConfig}
            onEffectiveCapacityChange={updateEffectiveCapacity}
            onResetEffectiveCapacity={resetEffectiveCapacity}
            seed={seeds[station]}
            isDefaultSeed={isDefaultSeed}
            onSeedChange={(v) => setSeeds((s) => ({ ...s, [station]: v }))}
            onUseDefaultSeed={useDefaultSeed}
            onRegenerateSeed={regenerate}
            stepMinutesSetting={stepMinutes}
            stepHoursActive={env.stepHours}
            samplesPerYear={env.temperature.length}
            isDefaultStep={isDefaultStep}
            onStepMinutesChange={(v) => setStepMinutes(clamp(Math.round(v), MIN_STEP_MINUTES, MAX_STEP_MINUTES))}
            onUseDefaultStep={useDefaultStep}
            historyWindowHours={historyWindowHours}
            onHistoryWindowHoursChange={(v) => setHistoryWindowHours(clamp(v, MIN_WINDOW_HOURS, MAX_WINDOW_HOURS))}
            onResetHistoryWindowHours={resetZoom}
            mode={mode}
            onModeChange={setMode}
            hoursPerSec={hoursPerSec}
            onHoursPerSecChange={(v) => { setCustomSpeedOn(true); setCustomHoursPerSec(clamp(v, MIN_CUSTOM_HPS, MAX_CUSTOM_HPS)); }}
            windOn={windOn}
            onWindOnChange={setWindOn}
            solarOn={solarOn}
            onSolarOnChange={setSolarOn}
            simIndexFloat={simIndexFloat}
            simTimeLabel={fmtSeasonPrecise(simIndexFloat)}
            snapshot={snapshot}
            chartPointCount={chartData.length}
            sampleIntervalSec={sampleIntervalSec}
            tickInterval={tickInterval}
            loadSplit={loadSplit}
            defaultLoadSplit={DEFAULT_LOAD_SPLIT}
            onLoadSplitChange={updateLoadSplit}
            onNormalizeLoadSplit={normalizeLoadSplit}
            onResetLoadSplit={resetLoadSplit}
            dispatchParams={dispatchParams}
            defaultDispatchParams={DEFAULT_DISPATCH_PARAMS}
            onDispatchParamChange={updateDispatchParam}
            onResetDispatchParam={resetDispatchParam}
            windCurveParams={windCurveParams}
            defaultWindCurveParams={DEFAULT_WIND_CURVE_PARAMS}
            onWindCurveParamChange={updateWindCurveParam}
            onResetWindCurveParam={resetWindCurveParam}
            onResetAll={resetAllParameters}
            constants={{
              TEMPLATE_YEAR, HOURS, GAMMA_1_5,
              MAX_CHART_POINTS, MIN_SAMPLE_SECONDS,
              DEFAULT_WINDOW_HOURS, DEFAULT_STEP_MINUTES, DEFAULT_SEEDS,
              MIN_STEP_MINUTES, MAX_STEP_MINUTES, MIN_WINDOW_HOURS, MAX_WINDOW_HOURS,
              SIM_STEP_MINUTES,
            }}
          />
        )}

        {page === "dashboard" && (<>
        {/* Seed panel */}
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center",
          background: "#10151C", border: "1px solid #1F2A35", borderRadius: 10, padding: "10px 14px",
        }}>
          <div style={{ fontSize: 11, color: "#8B9AA8", minWidth: 210 }}>
            "Default seed" restores the original 42/43 dataset. "Regenerate" always picks a new
            random seed. Or type a specific seed below — the same seed always reproduces identical data.
          </div>
          {Object.keys(stationConfigs).map((key) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#8B9AA8" }}>{stationConfigs[key].name} seed</span>
              <input
                type="number" value={seedInput[key]}
                onChange={(e) => setSeedInput((s) => ({ ...s, [key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") applySeed(key); }}
                style={{ width: 90, background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "5px 7px", fontSize: 12 }}
              />
              <button onClick={() => applySeed(key)} style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                border: "1px solid #2A3641", background: "#132530", color: "#5EC8E8",
              }}>Apply</button>
              <span style={{ fontSize: 10, color: "#4A5560" }}>(active: {seeds[key]})</span>
            </div>
          ))}
        </div>

        {/* Data resolution panel */}
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center",
          background: "#10151C", border: "1px solid #1F2A35", borderRadius: 10, padding: "10px 14px",
        }}>
          <div style={{ fontSize: 11, color: "#8B9AA8", minWidth: 210 }}>
            Data resolution — how finely the simulation's results are sampled across the year.
            The underlying physics (weather, load, dispatch) always runs at a fixed 5-minute
            step internally, so changing this only changes how many points are reported and
            plotted — it does not change the results (fuel burn, tank level or fuel runway).
            Separate from the chart zoom window above.
          </div>
          {!customStepOn && (
            <select value={stepMinutes} onChange={(e) => setStepMinutes(Number(e.target.value))}
              style={{ background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}>
              {STEP_PRESETS.map((p) => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
            </select>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8B9AA8", cursor: "pointer" }}>
            <input type="checkbox" checked={customStepOn} onChange={(e) => setCustomStepOn(e.target.checked)} />
            Custom
          </label>
          {customStepOn && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number" min={0.1} step={0.1} value={customStepValue}
                onChange={(e) => setCustomStepValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyCustomStep(); }}
                style={{ width: 60, background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "5px 7px", fontSize: 12 }}
              />
              <select value={customStepUnit} onChange={(e) => setCustomStepUnit(e.target.value)}
                style={{ background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "5px 7px", fontSize: 12 }}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <SmallButton onClick={applyCustomStep}>Apply</SmallButton>
            </div>
          )}
          <SmallButton onClick={useDefaultStep} active={isDefaultStep} title="Restores the original 1 sample/hour display resolution">
            ⟲ Set to default
          </SmallButton>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#4A5560", fontFamily: "ui-monospace, monospace" }}>
            display: {fmtWindowLabel(env.stepHours)}/sample · {env.temperature.length.toLocaleString()} samples/year
            {" · "}
            physics: {SIM_STEP_MINUTES}min ({fineEnvByStation[station].temperature.length.toLocaleString()} steps)
          </span>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <RenewableControl
            label="Solar PV" on={solarOn} onToggle={setSolarOn}
            valueKw={capacities[station].pv}
            onValueChange={(v) => setCapacities((c) => ({ ...c, [station]: { ...c[station], pv: v } }))}
            maxKw={pvMax} defaultKw={stationConfigs[station].pvCapacity}
          />
          <RenewableControl
            label="Wind Turbines" on={windOn} onToggle={setWindOn}
            valueKw={capacities[station].wind}
            onValueChange={(v) => setCapacities((c) => ({ ...c, [station]: { ...c[station], wind: v } }))}
            maxKw={windMax} defaultKw={stationConfigs[station].windCapacity}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <ModeButton active={mode === "live"} onClick={() => setMode("live")}>● Live</ModeButton>
            <ModeButton active={mode === "accelerated"} onClick={() => setMode("accelerated")}>▶ Accelerated</ModeButton>
            <ModeButton active={mode === "manual"} onClick={() => setMode("manual")}>○ Manual</ModeButton>
          </div>

          {mode === "accelerated" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 320 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {!customSpeedOn && (
                  <select value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))}
                    style={{ background: "#10151C", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 8, padding: "9px 10px", fontSize: 12 }}>
                    {SPEED_OPTIONS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                  </select>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8B9AA8", cursor: "pointer" }}>
                  <input type="checkbox" checked={customSpeedOn} onChange={(e) => setCustomSpeedOn(e.target.checked)} />
                  Custom
                </label>
                {customSpeedOn && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number" min={MIN_CUSTOM_HPS} max={MAX_CUSTOM_HPS} step={0.1}
                      value={customHoursPerSec}
                      onChange={(e) => setCustomHoursPerSec(clamp(Number(e.target.value) || 0, MIN_CUSTOM_HPS, MAX_CUSTOM_HPS))}
                      style={{ width: 70, background: "#0A0E14", color: "#E8EEF2", border: "1px solid #1F2A35", borderRadius: 6, padding: "5px 7px", fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, color: "#8B9AA8" }}>sim-hours / real-sec</span>
                  </div>
                )}
                <button onClick={togglePause} style={{
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  border: "1px solid #1F2A35", background: "#10151C", color: "#E8EEF2",
                }}>{accelPaused ? "▶ Resume" : "⏸ Pause"}</button>
                <button onClick={jumpToNow} style={{
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  border: "1px solid #1F2A35", background: "#10151C", color: "#8B9AA8",
                }}>⟳ Jump playhead to now</button>
              </div>

              <div style={{
                display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                background: "#0A0E14", border: "1px solid #1F2A35", borderRadius: 8, padding: "8px 10px",
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8B9AA8", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={accelFullTimeline} onChange={(e) => setAccelFullTimeline(e.target.checked)} />
                  Unlock full-year timeline
                </label>
                <span style={{ fontSize: 11, color: "#4A5560", whiteSpace: "nowrap" }}>
                  {accelFullTimeline ? "loops anywhere in the year" : "loops start → live now"}
                </span>
                <div style={{ width: 1, alignSelf: "stretch", background: "#1F2A35" }} />
                <span style={{ fontSize: 11, color: "#8B9AA8", whiteSpace: "nowrap" }}>Start from:</span>
                <input
                  type="range" min={0} max={accelStartMax} step={accelStartMax / 2000 || 1}
                  value={Math.min(accelStartIdx, accelStartMax)}
                  onChange={(e) => updateAccelStart(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 140, accentColor: "#5EC8E8" }}
                />
                <span style={{ fontSize: 11, color: "#8B9AA8", fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>
                  {fmtSeasonPrecise(Math.min(accelStartIdx, accelStartMax))}
                </span>
                <SmallButton onClick={() => updateAccelStart(0)} title="Start from the very beginning of the year">Year start</SmallButton>
                <SmallButton onClick={() => updateAccelStart(liveNowFloat)} title="Start from right now">Now</SmallButton>
              </div>
            </div>
          )}
          {mode === "manual" && (
            <div style={{ display: "flex", flex: 1, minWidth: 260, alignItems: "center", gap: 10 }}>
              <input type="range" min={0} max={HOURS - 1.001} step={1 / 12} value={scrubIdx}
                onChange={(e) => setScrubIdx(Number(e.target.value))}
                style={{ flex: 1, minWidth: 200, accentColor: "#5EC8E8" }} />
              <span style={{ fontSize: 11, color: "#8B9AA8", fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>
                {fmtSeasonPrecise(scrubIdx)}
              </span>
            </div>
          )}

          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#8B9AA8" }}>
              {mode === "live"
                ? "Live · synced to real time"
                : mode === "accelerated"
                  ? `Simulated · ${customSpeedOn ? `${customHoursPerSec}h/sec custom` : SPEED_OPTIONS[speedIdx].label}${accelPaused ? " · Paused" : ""} · loops ${fmtSeasonPrecise(accelStartIdx)} → ${accelFullTimeline ? "year end" : "now"}`
                  : "Manual scrub"}
            </div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 14 }}>
              {fmtSeasonPrecise(simIndexFloat)} <span style={{ color: "#8B9AA8" }}>· {snapshot.weather}</span>
            </div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#4A5560", marginTop: 2 }}>
              Wall clock: {fmtTime(realNow)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <Kpi label="TOTAL LOAD" value={Math.round(snapshot.load)} unit="kW" />
          <Kpi label="RENEWABLE OUTPUT" value={Math.round(snapshot.pv + snapshot.wind)} unit="kW" accent="#5EC8E8" />
          <Kpi label="DIESEL OUTPUT" value={Math.round(snapshot.diesel)} unit="kW" accent="#E8A23D" />
          <Kpi label="BATTERY SOC" value={Math.round(snapshot.soc)} unit="%" accent="#4FD1A5" />
          <Kpi label="FUEL RUNWAY" value={Math.round(snapshot.runway)} unit="days" accent={status.color} big />
        </div>

        {/* Shared chart zoom / window control */}
        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12,
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
            <SmallButton onClick={applyCustomWindow}>Apply</SmallButton>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#4A5560", fontFamily: "ui-monospace, monospace" }}>
            showing {fmtWindowLabel(historyWindowHours)} ({chartData.length} pts, ~{fmtIntervalLabel(sampleIntervalSec)} apart)
          </span>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: 2, minWidth: 320, background: "#10151C", border: "1px solid #1F2A35", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#8B9AA8", marginBottom: 8 }}>LOAD vs GENERATION — last {fmtWindowLabel(historyWindowHours)} through now</div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <CartesianGrid stroke="#1F2A35" vertical={false} />
                <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtAxisTick(v, historyWindowHours)}
                  tick={{ fill: "#8B9AA8", fontSize: 10 }} interval={tickInterval} axisLine={{ stroke: "#1F2A35" }} tickLine={false} />
                <YAxis tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(v) => fmtAxisTick(v, historyWindowHours)} contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }} />
                <Area type="monotone" dataKey="renewables" stackId="1" stroke="#5EC8E8" fill="#5EC8E8" fillOpacity={0.35} name="Renewables (kW)" isAnimationActive={false} />
                <Area type="monotone" dataKey="diesel" stackId="1" stroke="#E8A23D" fill="#E8A23D" fillOpacity={0.35} name="Diesel (kW)" isAnimationActive={false} />
                <Line type="monotone" dataKey="load" stroke="#E8EEF2" strokeWidth={2} dot={false} name="Load (kW)" isAnimationActive={false} />
                <ReferenceLine x={simIndexFloat} stroke="#5EC8E8" strokeDasharray="3 3" label={{ value: "now", fill: "#5EC8E8", fontSize: 10, position: "top" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ flex: 1, minWidth: 260, background: "#10151C", border: "1px solid #1F2A35", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#8B9AA8", marginBottom: 8 }}>BATTERY SOC — last {fmtWindowLabel(historyWindowHours)} through now</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1F2A35" vertical={false} />
                <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtAxisTick(v, historyWindowHours)}
                  tick={{ fill: "#8B9AA8", fontSize: 10 }} interval={tickInterval} axisLine={{ stroke: "#1F2A35" }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#8B9AA8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(v) => fmtAxisTick(v, historyWindowHours)} contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }} />
                <Line type="monotone" dataKey="soc" stroke="#4FD1A5" strokeWidth={2} dot={false} isAnimationActive={false} />
                <ReferenceLine x={simIndexFloat} stroke="#5EC8E8" strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 320, background: "#10151C", border: "1px solid #1F2A35", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#8B9AA8", marginBottom: 8 }}>DIESEL TANK LEVEL — full year overview (× 1,000 L)</div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={yearOverview}>
                <Area type="monotone" dataKey="tank" stroke="#E8A23D" fill="#E8A23D" fillOpacity={0.15} isAnimationActive={false} />
                <XAxis dataKey="h" hide />
                <YAxis hide domain={[0, "dataMax"]} />
                <ReferenceDot x={idx} y={dispatch.tankLevelL[curStepIdx] / 1000} r={5} fill="#5EC8E8" stroke="none" isAnimationActive={false} />
                <Tooltip labelFormatter={fmtSeason} contentStyle={{ background: "#0A0E14", border: "1px solid #1F2A35", fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ flex: 1, minWidth: 280, background: "#10151C", border: "1px solid #1F2A35", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#8B9AA8", marginBottom: 10 }}>DISPATCH DECISIONS — explained</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 140, overflowY: "auto" }}>
              {recentNotes.map(({ i, note }) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.4, borderLeft: "2px solid #2A3641", paddingLeft: 8 }}>
                  <span style={{ color: "#5EC8E8", fontFamily: "ui-monospace, monospace", fontSize: 10 }}>{fmtSeason(i)}</span>
                  <div style={{ color: "#C4CDD5" }}>{note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, color: "#4A5560", fontSize: 11 }}>
          Synthetic data — physics-informed generator calibrated to researched station parameters, not historical sensor logs.
          Dataset is seeded and identical for a given seed; use "Default seed" to return to the original dataset,
          "Regenerate" for a new random seed, or enter your own seed above. The physics always runs at a fixed
          5-minute internal step; the Data resolution control only changes how many points are reported and plotted,
          so fuel burn, tank level and fuel runway stay identical across resolution settings.
        </div>
        </>)}
      </div>
    </div>
  );
}