import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { perfBudgetStatus, summarizePerfWindow } from '../lib/perfSuggest'
import { buildBandedSparklineSegments, refLineY, FPS_GRAPH_CEIL, scrubSparkline, sparklineSampleStats } from '../lib/fpsGraph'

// R36.D — live perf-budget status pill.
//
// An opt-in, always-on perf overlay for users TUNING a heavy scene: a
// tiny green/amber/red dot + fps + a one-word status (Smooth / Tight /
// Heavy) pinned to the bottom-left, the way a game's perf HUD shows a
// live headroom light. This is separate from the reactive PerfAutoSuggest
// toast (which only speaks up after a sustained low spell) — the pill is
// continuous so the user can watch fps react as they add particles or
// flip on a heavy post-FX.
//
// R37.D — clicking the pill now opens a one-glance HEALTH SUMMARY popover
// (avg / 1% low / drops over the last ~4s) BEFORE the user commits to
// opening the full Debug HUD. A small "Hide" link in the popover keeps
// the old dismiss path. The pill keeps a short rolling fps window
// (sampled by the same 1Hz loop that drives the live light) so the
// summary is ready the instant the popover opens.
//
// R39.D — hovering the popover sparkline scrubs a guide line + dot to the
// nearest sample with a "48 fps · 4s ago" readout.
//
// R40.D — clicking a scrubbed sample PINS it: a distinct marker stays on
// the graph and a stats panel shows that sample's full per-sample stats
// (fps + frame-ms + drop flag + age) so a transient stutter can be
// inspected at leisure, not just caught mid-hover. Clicking again (or the
// panel's clear) drops the pin.
//
// Off by default; the whole component returns null when the preference is
// off (zero cost). zen-hideable so it fades with the rest of the chrome.

// How many 1Hz samples to keep — a ~12s rolling health window. Long
// enough that the 1% low + drop count mean something, short enough to
// stay responsive to a change the user just made.
const WINDOW = 12

export default function PerfBudgetPill() {
  const enabled = useStore(s => s.perfPillEnabled)
  const setEnabled = useStore(s => s.setPerfPillEnabled)
  const [fps, setFps] = useState(60)
  // Rolling fps window for the health summary. Held in state so the
  // popover re-renders as fresh samples land while it's open.
  const [series, setSeries] = useState([])
  const [open, setOpen] = useState(false)
  // R39.D — hover-scrub: the cursor x over the popover sparkline (in the
  // SVG's pixel space), or null when the pointer is off it. Drives a
  // vertical guide line + a tooltip reading the exact fps + seconds-ago
  // for the sample under the cursor.
  const [scrubX, setScrubX] = useState(null)
  // R40.D — a pinned sample index (or null). Clicking a scrubbed point on
  // the sparkline pins it so its full stats stay on screen; we store the
  // INDEX (not the value) and re-resolve the stats every render so a pin
  // tracks its sample as the window scrolls, and clears itself once the
  // sample ages out of the window.
  const [pinnedIndex, setPinnedIndex] = useState(null)
  const seriesRef = useRef([])

  useEffect(() => {
    if (!enabled) return undefined
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = (t) => {
      frames++
      if (t - last >= 1000) {
        const sample = Math.round((frames * 1000) / (t - last))
        setFps(sample)
        // Push into the rolling window (newest last, capped to WINDOW).
        const next = seriesRef.current.concat(sample)
        const dropped = next.length > WINDOW ? next.length - WINDOW : 0
        if (dropped > 0) next.splice(0, dropped)
        seriesRef.current = next
        setSeries(next)
        // R40.D — when samples scroll off the front, shift the pin by the
        // same amount so it stays on the SAME moment; once that moment
        // scrolls off the window entirely, drop the pin.
        if (dropped > 0) {
          setPinnedIndex(p => {
            if (p == null) return null
            const shifted = p - dropped
            return shifted < 0 ? null : shifted
          })
        }
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [enabled])

  // Close the popover whenever the pill itself is disabled so it doesn't
  // linger as an orphan.
  useEffect(() => { if (!enabled) { setOpen(false); setScrubX(null); setPinnedIndex(null) } }, [enabled])
  // Drop any hover-scrub when the popover closes so it doesn't reappear
  // mid-scrub the next time it opens. Also clear the pin — a pin is a
  // session-scoped inspection, not a persistent marker.
  useEffect(() => { if (!open) { setScrubX(null); setPinnedIndex(null) } }, [open])

  if (!enabled) return null

  const status = perfBudgetStatus(fps)
  const summary = summarizePerfWindow(series)
  // R38.D — the same ~12s window as a tiny band-coloured sparkline at the
  // top of the popover so the summary shows SHAPE (where the dips were),
  // not just numbers. Split into green/amber/red runs so a stutter paints
  // red exactly where it happened.
  const SPARK_W = 162, SPARK_H = 30
  const sparkOpts = { ceil: FPS_GRAPH_CEIL, width: SPARK_W, height: SPARK_H }
  const sparkSegments = buildBandedSparklineSegments(series, sparkOpts)
  const spark60 = refLineY(60, sparkOpts)
  const spark30 = refLineY(30, sparkOpts)
  // R39.D — resolve the live hover-x to the nearest sample (fps +
  // seconds-ago) so the tooltip + guide line read an exact value off the
  // sparkline. The pill samples at 1Hz, so the default sampleMs=1000
  // makes secondsAgo read in whole seconds. null when not hovering.
  const scrub = scrubX != null ? scrubSparkline(series, scrubX, { width: SPARK_W, sampleMs: 1000 }) : null
  // The y of the scrubbed sample on the sparkline (for the dot) — found by
  // walking the segments for the point at the snapped index. Cheap: the
  // segments already carry every point.
  let scrubY = null
  if (scrub) {
    const flat = []
    for (const seg of sparkSegments) for (const p of seg.points) flat.push(p)
    // Segments share boundary points, so dedupe by x to index by sample.
    if (flat.length) {
      // Nearest point to the snapped x.
      let best = flat[0]
      for (const p of flat) {
        if (Math.abs(p.x - scrub.x) < Math.abs(best.x - scrub.x)) best = p
      }
      scrubY = best.y
    }
  }

  // R40.D — the pinned sample's full stats (fps + frame-ms + drop + age),
  // re-resolved every render so the pin tracks its sample as the window
  // scrolls. null once the sample has aged out. The pill samples at 1Hz,
  // so the default sampleMs=1000 reads secondsAgo in whole seconds.
  const pinned = pinnedIndex != null ? sparklineSampleStats(series, pinnedIndex, { sampleMs: 1000 }) : null
  // The pin marker position on the sparkline: even spacing means sample i
  // sits at x = (i / (n-1)) * SPARK_W. Walk the flat points for its y.
  let pinX = null, pinY = null
  if (pinned) {
    const n = series.length
    pinX = n > 1 ? (pinned.index / (n - 1)) * SPARK_W : SPARK_W
    const flat = []
    for (const seg of sparkSegments) for (const p of seg.points) flat.push(p)
    if (flat.length) {
      let best = flat[0]
      for (const p of flat) {
        if (Math.abs(p.x - pinX) < Math.abs(best.x - pinX)) best = p
      }
      pinY = best.y
    }
  }

  return (
    <div
      className="zen-hideable"
      style={{ position: 'fixed', bottom: 14, left: 14, zIndex: 38 }}
    >
      {/* R37.D — health-summary popover. Opens above the pill so it never
          slides off the bottom edge. */}
      {open && (
        <div
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
            width: 188,
            padding: '11px 13px 10px',
            borderRadius: 12,
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            background: 'linear-gradient(135deg, rgba(15,15,25,0.94) 0%, rgba(20,12,30,0.94) 100%)',
            border: `1px solid ${status.color}40`,
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            boxShadow: `0 12px 30px rgba(0,0,0,0.45), 0 0 16px ${status.color}1f`,
            animation: 'cp-fade 0.14s ease-out',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 9,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#a78bfa',
            }}>Perf health</span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: summary.status.color,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{summary.count > 0 ? summary.status.label : '—'}</span>
          </div>

          {/* R38.D — band-coloured fps sparkline of the same window. Each
              green/amber/red run is its own polyline so a dip paints red
              exactly where it happened; the 60/30fps guide lines anchor
              it. Only when there are enough samples to draw a line. */}
          {sparkSegments.length > 0 && (
            <svg
              width={SPARK_W} height={SPARK_H}
              style={{ display: 'block', width: '100%', height: SPARK_H, borderRadius: 5, background: 'rgba(0,0,0,0.28)', marginBottom: 9, cursor: 'crosshair' }}
              preserveAspectRatio="none"
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              onPointerMove={(e) => {
                // Map the pointer to the SVG's internal coordinate space:
                // the SVG renders at 100% width (responsive) so the on-
                // screen px must be scaled back to the SPARK_W viewBox.
                const rect = e.currentTarget.getBoundingClientRect()
                if (rect.width <= 0) return
                const localX = ((e.clientX - rect.left) / rect.width) * SPARK_W
                setScrubX(localX)
              }}
              onPointerLeave={() => setScrubX(null)}
              onClick={(e) => {
                // R40.D — click pins the sample under the cursor so its
                // full stats stay on screen for inspection. Clicking the
                // already-pinned sample toggles it off. We resolve the
                // index from the click x (independent of the live scrub
                // state) so a tap lands precisely.
                const rect = e.currentTarget.getBoundingClientRect()
                if (rect.width <= 0) return
                const localX = ((e.clientX - rect.left) / rect.width) * SPARK_W
                const hit = scrubSparkline(series, localX, { width: SPARK_W, sampleMs: 1000 })
                if (!hit) return
                setPinnedIndex(p => (p === hit.index ? null : hit.index))
              }}
            >
              {spark60 != null && (
                <line x1={0} y1={spark60} x2={SPARK_W} y2={spark60}
                  stroke="rgba(134,239,172,0.18)" strokeWidth={1} strokeDasharray="2 3" />
              )}
              {spark30 != null && (
                <line x1={0} y1={spark30} x2={SPARK_W} y2={spark30}
                  stroke="rgba(248,113,113,0.16)" strokeWidth={1} strokeDasharray="2 3" />
              )}
              {sparkSegments.map((seg, i) => (
                <polyline key={i} points={seg.attr} fill="none" stroke={seg.color}
                  strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {/* R40.D — the pinned sample marker: a persistent vertical
                  line + ringed dot (distinct from the hover dot) so the
                  inspected moment stays visible while the user reads the
                  stats panel. Drawn UNDER the live hover guide so a fresh
                  hover still reads on top. */}
              {pinned && pinX != null && (
                <>
                  <line x1={pinX} y1={0} x2={pinX} y2={SPARK_H}
                    stroke={pinned.isDrop ? 'rgba(248,113,113,0.7)' : 'rgba(167,139,250,0.7)'}
                    strokeWidth={1} strokeDasharray="2 2" />
                  {pinY != null && (
                    <circle cx={pinX} cy={pinY} r={3.4}
                      fill="none" stroke={pinned.isDrop ? '#f87171' : '#a78bfa'} strokeWidth={1.6} />
                  )}
                </>
              )}
              {/* R39.D — hover-scrub guide: a vertical line at the snapped
                  sample x + a dot on the line so the user sees exactly
                  which sample the tooltip is reading. */}
              {scrub && (
                <>
                  <line x1={scrub.x} y1={0} x2={scrub.x} y2={SPARK_H}
                    stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
                  {scrubY != null && (
                    <circle cx={scrub.x} cy={scrubY} r={2.6}
                      fill="#fff" stroke="rgba(0,0,0,0.4)" strokeWidth={0.75} />
                  )}
                </>
              )}
            </svg>
          )}

          {/* R39.D — the scrub readout: exact fps + how-long-ago for the
              sample under the cursor. Sits directly below the sparkline
              so the eye doesn't travel; fixed height so the layout doesn't
              jump as the pointer enters / leaves. */}
          {sparkSegments.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              height: 15, marginBottom: 8, marginTop: -3,
              fontSize: 10, fontFamily: 'inherit',
              opacity: scrub ? 1 : 0.42, transition: 'opacity 0.12s ease-out',
            }}>
              {scrub ? (
                <>
                  <span style={{
                    color: scrub.fps == null ? '#7a7a90'
                      : scrub.fps >= 55 ? '#86efac' : scrub.fps >= 30 ? '#fbbf24' : '#f87171',
                    fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  }}>{scrub.fps == null ? '—' : `${scrub.fps} fps`}</span>
                  <span style={{ color: '#8a8aa0', fontVariantNumeric: 'tabular-nums' }}>
                    {scrub.secondsAgo === 0 ? 'now' : `${scrub.secondsAgo}s ago`}
                  </span>
                </>
              ) : (
                <span style={{ color: '#6a6a80', letterSpacing: '0.02em' }}>Hover to scrub · click to pin</span>
              )}
            </div>
          )}

          {/* R40.D — pinned-sample inspector: a fixed panel showing the
              full per-sample stats of the pinned moment (fps + frame-ms +
              drop flag + age) so a transient stutter caught while hovering
              can be studied. A clear button drops the pin. */}
          {pinned && (
            <div style={{
              marginBottom: 9, padding: '7px 9px', borderRadius: 8,
              background: pinned.isDrop ? 'rgba(248,113,113,0.08)' : 'rgba(167,139,250,0.08)',
              border: `1px solid ${pinned.isDrop ? 'rgba(248,113,113,0.3)' : 'rgba(167,139,250,0.3)'}`,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 6,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: pinned.isDrop ? '#f87171' : '#a78bfa',
                }}>
                  Pinned · {pinned.secondsAgo === 0 ? 'now' : `${pinned.secondsAgo}s ago`}
                </span>
                <button
                  onClick={() => setPinnedIndex(null)}
                  title="Unpin this sample"
                  style={{
                    padding: '1px 7px', borderRadius: 5,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#9a9ab0', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                  }}
                >Clear</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <SummaryRow label="FPS" value={pinned.fps == null ? '—' : `${pinned.fps} fps`}
                  color={pinned.fps == null ? '#7a7a90'
                    : pinned.fps >= 55 ? '#86efac' : pinned.fps >= 30 ? '#fbbf24' : '#f87171'} />
                <SummaryRow label="Frame time" value={pinned.frameMs == null ? '—' : `${pinned.frameMs} ms`}
                  color={pinned.frameMs == null ? '#7a7a90'
                    : pinned.frameMs <= 16.7 ? '#86efac' : pinned.frameMs <= 33.3 ? '#fbbf24' : '#f87171'} />
                <SummaryRow label="Drop (<30)" value={pinned.fps == null ? '—' : pinned.isDrop ? 'yes' : 'no'}
                  color={pinned.isDrop ? '#f87171' : '#8a8aa0'} />
              </div>
            </div>
          )}

          {summary.count > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SummaryRow label="Avg / window" value={`${summary.avg} fps`} color={summary.status.color} />
              <SummaryRow label="1% low" value={`${summary.low} fps`}
                color={summary.low >= 55 ? '#86efac' : summary.low >= 30 ? '#fbbf24' : '#f87171'} />
              <SummaryRow label="Worst frame" value={`${summary.min} fps`} />
              <SummaryRow label="Drops (<30)" value={summary.drops}
                color={summary.drops > 0 ? '#f87171' : '#8a8aa0'} />
              <SummaryRow label="Samples" value={`${summary.count}s`} />
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#7a7a90', padding: '4px 0 6px', lineHeight: 1.4 }}>
              Warming up — sampling the last few seconds…
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 9, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)',
          }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('particle:toggle-debug-hud'))}
              title="Open the full Debug HUD (backtick)"
              style={popoverBtn}
            >Debug HUD</button>
            <button
              onClick={() => { setOpen(false); setEnabled(false) }}
              title="Hide the perf pill (re-enable in the Camera panel)"
              style={{ ...popoverBtn, color: '#9a9ab0' }}
            >Hide</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        title="Live perf budget — click for a health summary"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 10px 5px 8px', borderRadius: 999,
          cursor: 'pointer',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
          color: '#d8d8e0',
          background: 'linear-gradient(135deg, rgba(15,15,25,0.82) 0%, rgba(20,12,30,0.82) 100%)',
          border: `1px solid ${status.color}${open ? '88' : '40'}`,
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
          boxShadow: `0 4px 16px rgba(0,0,0,0.32), 0 0 12px ${status.color}22`,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: status.color,
          boxShadow: `0 0 8px ${status.color}`,
          flexShrink: 0,
        }} />
        <span style={{ color: status.color, fontVariantNumeric: 'tabular-nums' }}>{status.fps}</span>
        <span style={{ color: '#8a8aa0', fontWeight: 500 }}>fps</span>
        <span style={{
          color: status.color, fontWeight: 700, fontSize: 10,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          paddingLeft: 4, borderLeft: '1px solid rgba(255,255,255,0.1)',
        }}>{status.label}</span>
      </button>
    </div>
  )
}

const popoverBtn = {
  padding: '4px 9px', borderRadius: 6,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#c8c8d0', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.04em',
}

function SummaryRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: '#8a8aa0' }}>{label}</span>
      <span style={{ color: color || '#d8d8e0', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
