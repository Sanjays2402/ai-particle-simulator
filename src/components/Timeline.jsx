import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'

export default function Timeline() {
  const {
    recordingBuffer, isReplaying, replayFrame, replaySpeed, replayLoop,
    setReplayFrame, setReplaySpeed, setReplayLoop, exitReplay, setIsReplaying,
    enterReplay, clearRecording, setPlaying,
  } = useStore()

  const intervalRef = useRef(null)
  const barRef = useRef(null)

  const totalFrames = recordingBuffer.length
  const currentTime = ((replayFrame / 10) || 0).toFixed(1)
  const totalTime = ((totalFrames / 10) || 0).toFixed(1)

  useEffect(() => {
    if (!isReplaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      const { replayFrame, recordingBuffer, replayLoop, replaySpeed } = useStore.getState()
      const next = replayFrame + 1
      if (next >= recordingBuffer.length) {
        if (replayLoop) {
          useStore.getState().setReplayFrame(0)
        } else {
          useStore.getState().setIsReplaying(false)
        }
      } else {
        useStore.getState().setReplayFrame(next)
      }
    }, 100 / replaySpeed)
    return () => clearInterval(intervalRef.current)
  }, [isReplaying, replaySpeed, replayLoop])

  const handleBarClick = useCallback((e) => {
    if (!barRef.current || totalFrames === 0) return
    const rect = barRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const frame = Math.floor(pct * (totalFrames - 1))
    setReplayFrame(frame)
    if (!isReplaying) enterReplay()
  }, [totalFrames, isReplaying])

  if (totalFrames === 0) return null

  const progress = totalFrames > 1 ? (replayFrame / (totalFrames - 1)) * 100 : 0

  return (
    <div style={{
      height: 52,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px',
      flexShrink: 0,
      background: 'rgba(8,8,14,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(255,255,255,0.04)',
    }}>
      {/* Play/Pause */}
      <button onClick={() => isReplaying ? setIsReplaying(false) : enterReplay()}
        title={isReplaying ? 'Pause Replay' : 'Play Replay'}
        style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease-out',
          background: 'rgba(255,255,255,0.04)', color: '#eeeef0', border: '1px solid rgba(255,255,255,0.06)',
        }}>
        {isReplaying ? '⏸' : '▶'}
      </button>

      {/* Time */}
      <span style={{
        fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#7a7a90',
        minWidth: 70, flexShrink: 0,
      }}>
        {currentTime}s / {totalTime}s
      </span>

      {/* Progress Bar */}
      <div ref={barRef} onClick={handleBarClick}
        style={{
          flex: 1, height: 3, borderRadius: 2, cursor: 'pointer', position: 'relative',
          background: 'rgba(255,255,255,0.06)',
        }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #6366f1, #818cf8)',
          transition: 'width 0.1s ease-out',
        }} />
        <div style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          left: `calc(${progress}% - 5px)`,
          width: 10, height: 10, borderRadius: '50%',
          background: '#6366f1',
          boxShadow: '0 0 10px rgba(99,102,241,0.4)',
        }} />
      </div>

      {/* Speed */}
      {[0.5, 1, 2].map(s => (
        <button key={s} onClick={() => setReplaySpeed(s)}
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s ease-out',
            background: replaySpeed === s ? '#6366f1' : 'rgba(255,255,255,0.04)',
            color: replaySpeed === s ? '#ffffff' : '#7a7a90',
            border: 'none',
          }}>
          {s}x
        </button>
      ))}

      {/* Loop */}
      <button onClick={() => setReplayLoop(!replayLoop)} title="Loop"
        style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease-out',
          background: replayLoop ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
          color: replayLoop ? '#6366f1' : '#7a7a90',
          border: replayLoop ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(255,255,255,0.06)',
        }}>
        🔁
      </button>

      {/* Exit */}
      {isReplaying && (
        <button onClick={() => { exitReplay(); setPlaying(true) }}
          style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s ease-out',
            background: 'rgba(239,68,68,0.12)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.25)',
          }}>
          Exit
        </button>
      )}

      {/* Clear */}
      <button onClick={clearRecording} title="Clear Recording"
        style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease-out',
          background: 'rgba(255,255,255,0.04)', color: '#7a7a90',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
        🗑
      </button>
    </div>
  )
}
