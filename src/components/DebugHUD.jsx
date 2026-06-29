import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  buildSparklinePoints, sparklinePointsAttr, refLineY, summarizeFpsWindow,
  fpsBandColor, FPS_GRAPH_CEIL,
  buildFrameTimeSparklinePoints, frameTimeSparklineAttr, frameMsRefLineY,
  summarizeFrameTimeWindow, frameMsBandColor, fpsToFrameMs,
  FRAME_MS_GRAPH_CEIL, FRAME_BUDGET_60, FRAME_BUDGET_30,
  frameBudgetHeadroom, headroomBandColor,
  headroomHistoryAttr, headroomZeroLineY, headroomTrend, headroomEtaToEdge,
  ETA_MAX_SEC,
  pushEtaHistory, etaHistoryAttr, summarizeEtaHistory, ETA_HISTORY_CEIL,
  scrubEtaHistory, etaHistorySampleStats,
  // R45.D / R45.A — paste-ready perf-window + pinned-ETA summary lines
  formatFpsWindowStats, formatPinnedEtaLine,
} from '../lib/fpsGraph'
// R45.O — compact/expanded section policy.
import { resolveHudSections, hudModeLabel, hudModeForView } from '../lib/debugHud'

// Performance debug HUD. Toggle with backtick (`) so it doesn't fight
// the existing single-letter shortcuts. Tracks FPS as a rolling window
// (min / avg / max over the last 2 seconds), plus heap usage when
// available (Chrome only) and frame-time variance as a stutter signal.
// Press M while the HUD is open to flip the sparkline + numeric rows
// between fps and frame-time (ms) — the unit you profile a 16.7ms
// budget in directly (R35.A).
export default function DebugHUD() {
  const [visible, setVisible] = useState(false)
  // false = fps view (default), true = frame-time (ms) view.
  const [msView, setMsView] = useState(false)
  // R36.A — live particle count for the GPU-load readout row. Cheap
  // store subscription (only re-renders the HUD when the count changes).
  const particleCount = useStore(s => s.particleCount)
  // R45.O — compact vs expanded layout. Compact strips the sparkline,
  // trend strips, and copy buttons down to the at-a-glance health rows.
  // R50.O — density is remembered PER VIEW (fps vs ms) so the two readouts
  // collapse independently; the pill + sections follow the active view.
  const hudViewModes = useStore(s => s.debugHudViewModes)
  const toggleHudViewMode = useStore(s => s.toggleDebugHudViewMode)
  const syncHudViewModes = useStore(s => s.syncDebugHudViewModes)
  const activeView = msView ? 'ms' : 'fps'
  const hudMode = hudModeForView(hudViewModes, activeView)
  const sections = resolveHudSections(hudMode)
  const [stats, setStats] = useState({ fps: 60, min: 60, max: 60, avg: 60, frame: 16.7, mem: null })
  // R34.A — the live fps series feeding the sparkline. Held in state
  // (not just the ref) so the SVG re-renders each sample tick. Capped
  // to the same ~2s window the numeric stats use.
  const [series, setSeries] = useState([])
  const samplesRef = useRef([]) // [{ t, fps }] last ~2 seconds
  // R39.A — rolling history of the ETA-to-budget-edge readout so the HUD
  // can show whether the deadline is rushing AT the user (ETA shrinking)
  // or stabilising (ETA holding / growing), not just the instant number.
  // Held in state (mirrored from a ref) so the strip re-renders each tick.
  const [etaHistory, setEtaHistory] = useState([])
  const etaHistoryRef = useRef([])
  // R40.A — hover-scrub over the ETA-history strip: the cursor x in the
  // strip's pixel space (or null when the pointer is off it). Drives a
  // vertical guide line + a dot + a readout of the exact seconds-to-edge
  // + how-long-ago for the sample under the cursor, so a tuner can pick a
  // specific dip off the trend line instead of eyeballing the slope.
  const [etaScrubX, setEtaScrubX] = useState(null)
  // R41.A — click-to-PIN on the ETA strip (parallels R40.D's perf-pill
  // pin). Clicking a scrubbed dip locks its seconds-to-edge + age on
  // screen while the user tweaks, instead of holding the hover. We store
  // the INDEX (not the value) and re-resolve the stats every render so a
  // pin tracks its sample as the window scrolls, shifting the index when
  // ticks scroll off the front and clearing once the moment ages out.
  const [pinnedEtaIndex, setPinnedEtaIndex] = useState(null)
  // R45.D / R45.A — transient "copied" flag for the perf-window + pinned-ETA
  // copy buttons; keyed by which button fired so only that one flashes.
  const [copiedKey, setCopiedKey] = useState(null)
  const copyStat = (key, text) => {
    if (!text) return
    try { navigator.clipboard?.writeText(text) } catch { /* unsupported */ }
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1200)
  }
  const lastRef = useRef(performance.now())
  const accumRef = useRef(0)
  const framesRef = useRef(0)
  // Mirror `visible` into a ref so the (deps-free) key handler can read
  // the live value without a nested setState in another updater.
  const visibleRef = useRef(false)
  useEffect(() => { visibleRef.current = visible }, [visible])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === '`' || e.key === '~') {
        e.preventDefault()
        setVisible(v => !v)
      } else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Flip fps <-> ms, but only while the HUD is open so M stays
        // free for any future global shortcut when it's closed. R51.O —
        // Shift+M instead SYNCS both views to one density in a single shot.
        if (visibleRef.current) {
          e.preventDefault()
          if (e.shiftKey) syncHudViewModes()
          else setMsView(v => !v)
        }
      }
    }
    // R37.D — the perf pill's "Debug HUD" button opens the HUD via this
    // event so it doesn't have to synthesise a keystroke.
    const onToggle = () => setVisible(v => !v)
    window.addEventListener('keydown', onKey)
    window.addEventListener('particle:toggle-debug-hud', onToggle)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('particle:toggle-debug-hud', onToggle)
    }
  }, [syncHudViewModes])

  useEffect(() => {
    if (!visible) return
    let raf
    const loop = (t) => {
      const dt = t - lastRef.current
      lastRef.current = t
      accumRef.current += dt
      framesRef.current += 1

      // Sample once every ~250ms so we update 4x/sec.
      if (accumRef.current >= 250) {
        const fps = (framesRef.current * 1000) / accumRef.current
        const frame = accumRef.current / framesRef.current
        samplesRef.current.push({ t, fps })
        // Trim to a 2s window.
        const cutoff = t - 2000
        while (samplesRef.current.length && samplesRef.current[0].t < cutoff) samplesRef.current.shift()

        let min = Infinity, max = -Infinity, sum = 0
        for (const s of samplesRef.current) {
          if (s.fps < min) min = s.fps
          if (s.fps > max) max = s.fps
          sum += s.fps
        }
        const avg = samplesRef.current.length ? sum / samplesRef.current.length : fps
        const mem = (performance.memory && performance.memory.usedJSHeapSize)
          ? performance.memory.usedJSHeapSize / 1024 / 1024
          : null
        setStats({ fps: Math.round(fps), min: Math.round(min), max: Math.round(max), avg: Math.round(avg), frame: frame.toFixed(1), mem })
        // Feed the sparkline with the same windowed series (raw fps,
        // newest last) so the graph and the numeric readout never drift.
        setSeries(samplesRef.current.map(s => s.fps))

        // R39.A — record this tick's ETA-to-edge into the rolling history.
        // We compute it from the same fps window the live readout uses (at
        // the HUD's 250ms cadence). A "not approaching" tick records null
        // so the strip shows a gap-free climb back to safe when a scene
        // recovers. Mirror ref → state so the strip re-renders.
        const tickFps = samplesRef.current.map(s => s.fps)
        const tickEta = headroomEtaToEdge(tickFps, { sampleMs: 250 })
        const prevEtaLen = etaHistoryRef.current.length
        etaHistoryRef.current = pushEtaHistory(
          etaHistoryRef.current,
          tickEta.approaching ? tickEta.etaSec : null,
        )
        setEtaHistory(etaHistoryRef.current)
        // R41.A — when the ETA window is full, each push drops one sample
        // off the FRONT. Shift the pin by that amount so it stays on the
        // SAME moment; once that moment scrolls off the window entirely,
        // drop the pin. (pushEtaHistory concats exactly one sample, so
        // dropped = prevLen + 1 - newLen.)
        const etaDropped = prevEtaLen + 1 - etaHistoryRef.current.length
        if (etaDropped > 0) {
          setPinnedEtaIndex(p => {
            if (p == null) return null
            const shifted = p - etaDropped
            return shifted < 0 ? null : shifted
          })
        }

        accumRef.current = 0
        framesRef.current = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [visible])

  // R41.A — a pin is a session-scoped inspection, not a persistent
  // marker: drop it (and any hover-scrub) whenever the HUD is hidden so
  // it doesn't reappear stale when the user toggles the HUD back open.
  useEffect(() => {
    if (!visible) { setPinnedEtaIndex(null); setEtaScrubX(null) }
  }, [visible])

  if (!visible) return null

  const fpsColor = stats.fps >= 55 ? '#86efac' : stats.fps >= 30 ? '#fbbf24' : '#f87171'

  // Sparkline geometry — a compact 168x34 graph of the same 2s window.
  // The view (fps vs ms) only swaps which pure mappers + summary we use;
  // the SVG box + the live series are identical so the toggle is cheap.
  const GW = 168, GH = 34
  const liveMs = fpsToFrameMs(stats.fps)
  let sparkOpts, sparkAttr, sparkPts, lineA, lineB, lineAColor, lineBColor, strokeColor
  if (msView) {
    sparkOpts = { ceil: FRAME_MS_GRAPH_CEIL, width: GW, height: GH }
    sparkAttr = frameTimeSparklineAttr(series, sparkOpts)
    sparkPts = buildFrameTimeSparklinePoints(series, sparkOpts)
    lineA = frameMsRefLineY(FRAME_BUDGET_60, sparkOpts) // 16.7ms budget
    lineB = frameMsRefLineY(FRAME_BUDGET_30, sparkOpts) // 33.3ms budget
    lineAColor = 'rgba(134,239,172,0.22)'
    lineBColor = 'rgba(248,113,113,0.18)'
    strokeColor = frameMsBandColor(liveMs)
  } else {
    sparkOpts = { ceil: FPS_GRAPH_CEIL, width: GW, height: GH }
    sparkAttr = sparklinePointsAttr(series, sparkOpts)
    sparkPts = buildSparklinePoints(series, sparkOpts)
    lineA = refLineY(60, sparkOpts)
    lineB = refLineY(30, sparkOpts)
    lineAColor = 'rgba(134,239,172,0.22)'
    lineBColor = 'rgba(248,113,113,0.18)'
    strokeColor = fpsBandColor(stats.fps)
  }
  // Area-fill polygon: the line, then down the right edge, along the
  // floor, and back up the left edge.
  const areaAttr = sparkPts.length >= 2
    ? `${sparkAttr} ${sparkPts[sparkPts.length - 1].x},${GH} ${sparkPts[0].x},${GH}`
    : ''
  const fpsSummary = summarizeFpsWindow(series)
  const msSummary = summarizeFrameTimeWindow(series)
  // R36.A — how much of the 60fps (16.7ms) budget the live frame leaves
  // on the table. Shown as a bar in the ms view so the user can see how
  // much heavier a scene they can push before fps drops, not just the
  // current cost.
  const budget = frameBudgetHeadroom(stats.fps)
  const headroomColor = headroomBandColor(budget.headroom)
  // R37.A — the same 2s window as a tiny rolling headroom strip so the
  // user can see whether they're trending toward or away from the 16.7ms
  // budget edge, not just the instant value. Plotted SIGNED around a
  // centre zero-line (above = free budget, below = over). A trend arrow
  // (rising / falling / flat) summarises the direction at a glance.
  const HSW = GW, HSH = 26
  const headroomOpts = { width: HSW, height: HSH }
  const headroomAttr = headroomHistoryAttr(series, headroomOpts)
  const headroomZeroY = headroomZeroLineY(headroomOpts)
  const trend = headroomTrend(series)
  const trendGlyph = trend.dir === 'rising' ? '\u2197' : trend.dir === 'falling' ? '\u2198' : '\u2192'
  // Rising headroom (recovering) is good → green; falling (heading for
  // the edge) is a warning → amber; flat is neutral.
  const trendColor = trend.dir === 'rising' ? '#86efac' : trend.dir === 'falling' ? '#fbbf24' : '#8a8aa0'
  const trendWord = trend.dir === 'rising' ? 'easing' : trend.dir === 'falling' ? 'loading' : 'steady'
  // R38.A — extrapolate the headroom slope to a concrete "seconds until
  // you cross the 16.7ms budget" warning. Only shows while genuinely
  // falling AND still above the edge — a recovering or already-over
  // scene has nothing urgent to say. The HUD samples at ~250ms, so we
  // pass that cadence so the slope reads in real seconds.
  const eta = headroomEtaToEdge(series, { sampleMs: 250 })
  // R39.A — the rolling ETA history as a tiny strip + a trend read so the
  // user sees whether the deadline is rushing AT them (ETA falling) or
  // stabilising (ETA holding/rising). Only meaningful once we've recorded
  // at least one genuinely-approaching tick.
  const ETW = HSW, ETH = 18
  const etaOpts = { width: ETW, height: ETH, ceil: ETA_HISTORY_CEIL }
  const etaAttr = etaHistoryAttr(etaHistory, etaOpts)
  const etaSummary = summarizeEtaHistory(etaHistory)
  const etaTrendGlyph = etaSummary.dir === 'rising' ? '\u2197' : etaSummary.dir === 'falling' ? '\u2198' : '\u2192'
  // Falling ETA (edge rushing at you) is the warning state → amber/red;
  // rising (pulling away) is good → green; flat is neutral.
  const etaTrendColor = etaSummary.dir === 'falling'
    ? (etaSummary.urgent ? '#f87171' : '#fbbf24')
    : etaSummary.dir === 'rising' ? '#86efac' : '#8a8aa0'
  const etaTrendWord = etaSummary.dir === 'rising' ? 'pulling away' : etaSummary.dir === 'falling' ? 'closing in' : 'holding'
  // R40.A — resolve the live hover-x to the nearest ETA sample so the
  // tooltip + guide line read an exact seconds-to-edge + age off the
  // strip. The HUD records one ETA per 250ms tick, so sampleMs=250 makes
  // secondsAgo read in the HUD's real cadence. null when not hovering.
  const etaScrub = etaScrubX != null
    ? scrubEtaHistory(etaHistory, etaScrubX, { width: ETW, sampleMs: 250 })
    : null
  // The y of the scrubbed sample on the strip (for the dot): a finite ETA
  // maps high→top / 0→floor exactly as buildEtaHistoryPoints does; a "not
  // approaching" (null) tick pins to the safe ceiling (top, y=0).
  const etaScrubY = etaScrub
    ? (etaScrub.approaching
        ? ETH - (Math.min(etaScrub.etaSec, ETA_HISTORY_CEIL) / ETA_HISTORY_CEIL) * ETH
        : 0)
    : null
  // R41.A — the pinned ETA sample's stats (seconds-to-edge + age),
  // re-resolved every render so the pin tracks its moment as the strip
  // scrolls. null once the sample has aged out of the window. The strip
  // records one ETA per 250ms tick, so sampleMs=250 reads the age in the
  // HUD's real cadence.
  const etaPinned = pinnedEtaIndex != null
    ? etaHistorySampleStats(etaHistory, pinnedEtaIndex, { sampleMs: 250 })
    : null
  // The pin marker's x/y on the strip: even spacing means sample i sits
  // at x = (i / (n-1)) * ETW (single sample pins to the right edge); a
  // finite ETA maps high→top / 0→floor exactly as buildEtaHistoryPoints
  // does, a "not approaching" (null) tick pins to the safe ceiling (top).
  let etaPinX = null, etaPinY = null
  if (etaPinned) {
    const n = etaHistory.length
    etaPinX = n > 1 ? (etaPinned.index / (n - 1)) * ETW : ETW
    etaPinY = etaPinned.approaching
      ? ETH - (Math.min(etaPinned.etaSec, ETA_HISTORY_CEIL) / ETA_HISTORY_CEIL) * ETH
      : 0
  }

  return (
    <div style={{
      position: 'fixed', top: 60, left: 12, zIndex: 40,
      fontFamily: 'JetBrains Mono, Geist Mono, monospace',
      fontSize: 11, lineHeight: 1.45, color: '#d8d8e0',
      background: 'linear-gradient(135deg, rgba(15,15,25,0.85) 0%, rgba(20,12,30,0.85) 100%)',
      backdropFilter: 'blur(14px) saturate(140%)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      border: '1px solid rgba(168,85,247,0.28)',
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 180,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 18px rgba(168,85,247,0.18)',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: '#a78bfa',
        }}>Debug HUD</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {/* Tiny fps|ms unit pill — the active unit is highlighted so the
            user can see which view they're in at a glance. */}
        <span style={{
          display: 'inline-flex', gap: 1, fontSize: 8.5, fontWeight: 700,
          letterSpacing: '0.06em', borderRadius: 4, overflow: 'hidden',
          border: '1px solid rgba(168,85,247,0.25)',
        }}>
          <span style={{
            padding: '1px 5px',
            background: msView ? 'transparent' : 'rgba(168,85,247,0.28)',
            color: msView ? '#6a6a80' : '#e9d5ff',
          }}>FPS</span>
          <span style={{
            padding: '1px 5px',
            background: msView ? 'rgba(168,85,247,0.28)' : 'transparent',
            color: msView ? '#e9d5ff' : '#6a6a80',
          }}>MS</span>
        </span>
        {/* R45.O — compact/expanded density toggle. FULL is the instrument
            panel; MIN keeps the at-a-glance rows only. pointerEvents:auto so
            it's clickable inside the otherwise pass-through HUD. */}
        <button
          onClick={(e) => e.shiftKey ? syncHudViewModes() : toggleHudViewMode(activeView)}
          title={hudMode === 'compact' ? `Expand ${activeView.toUpperCase()} HUD (full panel) - density remembered per view; Shift to sync both views (Shift+M)` : `Compact ${activeView.toUpperCase()} HUD (essentials only) - density remembered per view; Shift to sync both views (Shift+M)`}
          style={{
            marginLeft: 6, padding: '1px 6px', borderRadius: 4, lineHeight: 1.5,
            background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.3)',
            color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', pointerEvents: 'auto',
          }}
        >{hudModeLabel(hudMode)}</button>
        </span>
      </div>

      {/* Sparkline — the same 2s window drawn as a graph so a stutter
          spike is visible at a glance. In fps view the 60/30fps lines
          anchor it; in ms view the 16.7ms / 33.3ms frame-budget lines
          do. A faster frame always sits HIGHER in both views so the
          silhouette reads the same direction (dips = trouble). */}
      <div style={{ marginBottom: 8 }}>
        {sections.sparkline && (
        <svg width={GW} height={GH} style={{ display: 'block', borderRadius: 5, background: 'rgba(0,0,0,0.28)' }}>
          {lineA != null && (
            <line x1={0} y1={lineA} x2={GW} y2={lineA}
              stroke={lineAColor} strokeWidth={1} strokeDasharray="2 3" />
          )}
          {lineB != null && (
            <line x1={0} y1={lineB} x2={GW} y2={lineB}
              stroke={lineBColor} strokeWidth={1} strokeDasharray="2 3" />
          )}
          {areaAttr && (
            <polygon points={areaAttr} fill={strokeColor} fillOpacity={0.1} />
          )}
          {sparkAttr && (
            <polyline points={sparkAttr} fill="none" stroke={strokeColor}
              strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
          )}
        </svg>
        )}
      </div>

      {msView ? (
        <>
          <Row label="Frame"     value={<span style={{ color: frameMsBandColor(liveMs) }}>{liveMs.toFixed(1)} ms</span>} />
          {/* R45.O — budget bar + trend strips are the deep-dive instruments;
              compact mode hides them, leaving the headline + 2s rows. */}
          {sections.trends && (<>
          {/* R36.A — budget headroom bar: how much of the 16.7ms (60fps)
              frame budget is left. Green = comfortable room, amber =
              tight, red = already over budget. The filled portion is the
              budget USED; the label shows the signed headroom %. */}
          <div style={{ margin: '5px 0 7px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: '#8a8aa0' }}>Budget</span>
              <span style={{ color: headroomColor, fontVariantNumeric: 'tabular-nums' }}>
                {budget.overBudget ? 'over' : `${budget.headroomPct}% free`}
              </span>
            </div>
            <div style={{
              position: 'relative', height: 5, borderRadius: 3,
              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
              {/* 16.7ms budget tick sits at 100% of the bar; the fill is
                  the fraction used so it crosses the full bar exactly at
                  the budget edge. */}
              <div style={{
                position: 'absolute', inset: 0, width: `${Math.round(budget.used * 100)}%`,
                background: headroomColor, opacity: 0.85,
                transition: 'width 0.2s ease-out, background 0.2s ease-out',
              }} />
            </div>
          </div>
          {/* R37.A — budget-headroom history strip: the last ~2s of
              headroom plotted SIGNED around a centre zero-line (the
              16.7ms budget edge). Above the line = free budget; below =
              over. The trend pill says whether the user is trending
              toward (loading) or away from (easing) the edge so they see
              direction, not just the instant value. */}
          {headroomAttr && (
            <div style={{ margin: '0 0 7px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: '#8a8aa0' }}>Trend</span>
                <span style={{ color: trendColor, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontWeight: 700, marginRight: 3 }}>{trendGlyph}</span>{trendWord}
                </span>
              </div>
              {/* R38.A — concrete "seconds to the budget edge" warning,
                  extrapolated from the headroom slope. Only renders while
                  genuinely falling AND still above the edge so it stays a
                  signal, not noise. */}
              {eta.approaching && eta.etaSec != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#8a8aa0' }}>To edge</span>
                  <span style={{
                    color: eta.etaSec <= 3 ? '#f87171' : '#fbbf24',
                    fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                  }}>
                    ~{eta.etaSec >= ETA_MAX_SEC ? `${ETA_MAX_SEC}+` : eta.etaSec}s
                  </span>
                </div>
              )}
              {/* R39.A — ETA-to-edge HISTORY strip: the last several
                  seconds of the "seconds to edge" readout plotted so the
                  user reads the deadline's DIRECTION. A line sloping down
                  toward the floor = the edge is closing in; climbing back
                  to the top = the scene is recovering / pulling away. A
                  "closing in" / "pulling away" pill names the trend. Only
                  renders once at least one approaching tick was recorded. */}
              {etaSummary.hasData && etaAttr && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#8a8aa0' }}>Edge trend</span>
                    <span style={{ color: etaTrendColor, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ fontWeight: 700, marginRight: 3 }}>{etaTrendGlyph}</span>{etaTrendWord}
                    </span>
                  </div>
                  <svg width={ETW} height={ETH} style={{ display: 'block', borderRadius: 5, background: 'rgba(0,0,0,0.28)', marginBottom: (etaScrub || etaPinned) ? 0 : 6, cursor: 'crosshair', pointerEvents: 'auto' }}
                    onPointerMove={(e) => {
                      // Map the pointer into the strip's pixel space. The
                      // SVG renders at its native ETW width, so a simple
                      // offset from the bounding rect suffices.
                      const rect = e.currentTarget.getBoundingClientRect()
                      if (rect.width <= 0) return
                      const localX = ((e.clientX - rect.left) / rect.width) * ETW
                      setEtaScrubX(localX)
                    }}
                    onPointerLeave={() => setEtaScrubX(null)}
                    onClick={(e) => {
                      // R41.A — click pins the sample under the cursor so
                      // its seconds-to-edge + age stay on screen while the
                      // user tweaks. Clicking the already-pinned sample
                      // toggles it off. Resolve the index from the click x
                      // (independent of the live scrub) so a tap lands
                      // precisely even on a touch device with no hover.
                      const rect = e.currentTarget.getBoundingClientRect()
                      if (rect.width <= 0) return
                      const localX = ((e.clientX - rect.left) / rect.width) * ETW
                      const hit = scrubEtaHistory(etaHistory, localX, { width: ETW, sampleMs: 250 })
                      if (!hit) return
                      setPinnedEtaIndex(p => (p === hit.index ? null : hit.index))
                    }}
                  >
                    {/* A faint baseline at the floor marks ETA=0 (you've
                        hit the budget edge) so a line diving toward it
                        reads as urgent at a glance. */}
                    <line x1={0} y1={ETH - 0.5} x2={ETW} y2={ETH - 0.5}
                      stroke="rgba(248,113,113,0.28)" strokeWidth={1} strokeDasharray="2 3" />
                    <polyline points={etaAttr} fill="none" stroke={etaTrendColor}
                      strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
                    {/* R41.A — the pinned sample marker: a persistent
                        dashed vertical line + ringed dot (distinct from
                        the solid hover guide) so the inspected moment
                        stays visible while the user reads the pinned
                        readout. Drawn UNDER the live hover guide so a
                        fresh hover still reads on top. */}
                    {etaPinned && etaPinX != null && (
                      <>
                        <line x1={etaPinX} y1={0} x2={etaPinX} y2={ETH}
                          stroke={etaPinned.approaching ? 'rgba(251,191,36,0.7)' : 'rgba(134,239,172,0.6)'}
                          strokeWidth={1} strokeDasharray="2 2" />
                        {etaPinY != null && (
                          <circle cx={etaPinX} cy={etaPinY} r={3.2}
                            fill="none" stroke={etaPinned.approaching ? '#fbbf24' : '#86efac'} strokeWidth={1.5} />
                        )}
                      </>
                    )}
                    {/* R40.A — hover-scrub guide: a vertical line at the
                        snapped sample x + a dot on the line so the user
                        sees exactly which sample the readout is reading. */}
                    {etaScrub && (
                      <>
                        <line x1={etaScrub.x} y1={0} x2={etaScrub.x} y2={ETH}
                          stroke="rgba(255,255,255,0.32)" strokeWidth={1} />
                        {etaScrubY != null && (
                          <circle cx={etaScrub.x} cy={etaScrubY} r={2.4}
                            fill="#fff" stroke="rgba(0,0,0,0.4)" strokeWidth={0.75} />
                        )}
                      </>
                    )}
                  </svg>
                  {/* R40.A — the scrub readout: exact seconds-to-edge +
                      how-long-ago for the sample under the cursor. Only
                      while hovering; a "safe" label for non-approaching
                      ticks (no finite ETA). */}
                  {etaScrub && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 10, marginBottom: etaPinned ? 2 : 6, marginTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      <span style={{
                        color: etaScrub.approaching
                          ? (etaScrub.etaSec <= 3 ? '#f87171' : '#fbbf24')
                          : '#86efac',
                        fontWeight: 600,
                      }}>
                        {etaScrub.approaching ? `~${etaScrub.etaSec}s to edge` : 'safe'}
                      </span>
                      <span style={{ color: '#8a8aa0' }}>
                        {etaScrub.secondsAgo === 0 ? 'now' : `${etaScrub.secondsAgo}s ago`}
                      </span>
                    </div>
                  )}
                  {/* R41.A — the PINNED readout: the locked sample's exact
                      seconds-to-edge + age, held on screen (independent of
                      the hover) with an inline clear so a tuner can change
                      the scene while keeping the dip's numbers in view. A
                      "PIN" tag + amber/green accent distinguishes it from
                      the transient hover readout above. */}
                  {etaPinned && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 10, marginBottom: 6, marginTop: 2, gap: 8,
                      padding: '3px 6px', borderRadius: 5,
                      background: etaPinned.approaching ? 'rgba(251,191,36,0.1)' : 'rgba(134,239,172,0.08)',
                      border: `1px solid ${etaPinned.approaching ? 'rgba(251,191,36,0.3)' : 'rgba(134,239,172,0.28)'}`,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        color: etaPinned.approaching
                          ? (etaPinned.etaSec <= 3 ? '#f87171' : '#fbbf24')
                          : '#86efac',
                        fontWeight: 600,
                      }}>
                        <span style={{
                          fontSize: 7.5, fontWeight: 700, letterSpacing: '0.08em',
                          padding: '0 3px', borderRadius: 3,
                          background: 'rgba(255,255,255,0.08)', color: '#c8c8d0',
                        }}>PIN</span>
                        {etaPinned.approaching ? `~${etaPinned.etaSec}s to edge` : 'safe'}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ color: '#8a8aa0' }}>
                          {etaPinned.secondsAgo === 0 ? 'now' : `${etaPinned.secondsAgo}s ago`}
                        </span>
                        {/* R45.A — copy the pinned ETA sample as a paste-ready
                            line so a perf-bug report carries the exact moment. */}
                        <button
                          onClick={() => copyStat('eta', formatPinnedEtaLine(etaPinned))}
                          title="Copy this pinned ETA sample"
                          style={{
                            padding: '0 5px', borderRadius: 4, lineHeight: 1.5,
                            background: copiedKey === 'eta' ? 'rgba(134,239,172,0.18)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${copiedKey === 'eta' ? 'rgba(134,239,172,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: copiedKey === 'eta' ? '#86efac' : '#9a9ab0', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em',
                            pointerEvents: 'auto',
                          }}
                        >{copiedKey === 'eta' ? 'Copied' : 'Copy'}</button>
                        <button
                          onClick={() => setPinnedEtaIndex(null)}
                          title="Unpin this sample"
                          style={{
                            padding: '0 5px', borderRadius: 4, lineHeight: 1.5,
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#9a9ab0', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em',
                            pointerEvents: 'auto',
                          }}
                        >Clear</button>
                      </span>
                    </div>
                  )}
                </>
              )}
              <svg width={HSW} height={HSH} style={{ display: 'block', borderRadius: 5, background: 'rgba(0,0,0,0.28)' }}>
                {/* The budget edge — headroom crosses 0 here. Above is
                    healthy (green tint), below is over budget (red tint). */}
                <rect x={0} y={0} width={HSW} height={headroomZeroY} fill="rgba(134,239,172,0.06)" />
                <rect x={0} y={headroomZeroY} width={HSW} height={HSH - headroomZeroY} fill="rgba(248,113,113,0.07)" />
                <line x1={0} y1={headroomZeroY} x2={HSW} y2={headroomZeroY}
                  stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="2 3" />
                <polyline points={headroomAttr} fill="none" stroke={headroomColor}
                  strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </div>
          )}
          </>)}
          <Row label="Avg / 2s"  value={`${msSummary.avg} ms`} />
          <Row label="Best / 2s" value={`${msSummary.min} ms`} />
          <Row label="Worst / 2s" value={`${msSummary.max} ms`} />
          <Row label="1% high"   value={<span style={{ color: frameMsBandColor(msSummary.high) }}>{msSummary.high} ms</span>} />
          {msSummary.over > 0 && <Row label="Over 33ms" value={<span style={{ color: '#f87171' }}>{msSummary.over}</span>} />}
        </>
      ) : (
        <>
          <Row label="FPS"      value={<span style={{ color: fpsColor }}>{stats.fps}</span>} />
          <Row label="Avg / 2s" value={stats.avg} />
          <Row label="Min / 2s" value={stats.min} />
          <Row label="Max / 2s" value={stats.max} />
          <Row label="1% low"   value={<span style={{ color: fpsSummary.low >= 55 ? '#86efac' : fpsSummary.low >= 30 ? '#fbbf24' : '#f87171' }}>{fpsSummary.low}</span>} />
          {fpsSummary.drops > 0 && <Row label="Drops" value={<span style={{ color: '#f87171' }}>{fpsSummary.drops}</span>} />}
          <Row label="Frame"    value={`${stats.frame} ms`} />
          {/* R45.D — copy the whole 2s window (avg/1%-low/min/max/drops/N) as
              one paste-ready line so a perf-bug report carries exact numbers.
              R45.O — only in expanded mode (compact trims tooling). */}
          {sections.copyButtons && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button
              onClick={() => copyStat('win', formatFpsWindowStats(fpsSummary, { heapMB: stats.mem, particles: particleCount }))}
              title="Copy the 2s perf window + heap + particle count as one line"
              style={{
                padding: '1px 7px', borderRadius: 4, lineHeight: 1.5,
                background: copiedKey === 'win' ? 'rgba(134,239,172,0.18)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${copiedKey === 'win' ? 'rgba(134,239,172,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: copiedKey === 'win' ? '#86efac' : '#9a9ab0', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em', pointerEvents: 'auto',
              }}
            >{copiedKey === 'win' ? 'Copied window' : 'Copy window'}</button>
          </div>
          )}
        </>
      )}
      {stats.mem != null && <Row label="Heap" value={`${stats.mem.toFixed(0)} MB`} />}
      {/* R36.A — particle load: the single biggest GPU-cost lever, so it
          sits right next to the perf numbers for a quick "is the count
          why I'm slow?" read. */}
      <Row label="Particles" value={`${(particleCount / 1000).toFixed(particleCount >= 10000 ? 0 : 1)}K`} />
      <div style={{ fontSize: 10, color: '#6a6a80', marginTop: 6 }}>
        <kbd style={kbd}>`</kbd> toggle · <kbd style={kbd}>M</kbd> {msView ? 'fps' : 'ms'}
      </div>
    </div>
  )
}

const kbd = {
  padding: '1px 4px', borderRadius: 3,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'inherit', fontSize: 10,
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
      <span style={{ color: '#8a8aa0' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
