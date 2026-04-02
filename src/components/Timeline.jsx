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

  // Auto-advance replay frames
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
    if (!isReplaying) {
      enterReplay()
    }
  }, [totalFrames, isReplaying])

  if (totalFrames === 0) return null

  const progress = totalFrames > 1 ? (replayFrame / (totalFrames - 1)) * 100 : 0

  return (
    <div className="h-14 flex items-center gap-3 px-4 border-t shrink-0"
      style={{ background: 'var(--bg-glass)', backdropFilter: 'var(--glass-blur)', borderColor: 'var(--border)' }}>
      
      {/* Play/Pause Replay */}
      <button
        onClick={() => isReplaying ? setIsReplaying(false) : enterReplay()}
        className="w-8 h-8 flex items-center justify-center rounded-md text-xs"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
        title={isReplaying ? 'Pause Replay' : 'Play Replay'}
      >
        {isReplaying ? '⏸' : '▶'}
      </button>

      {/* Time */}
      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-secondary)', minWidth: 70 }}>
        {currentTime}s / {totalTime}s
      </span>

      {/* Progress Bar */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="flex-1 h-2 rounded-full cursor-pointer relative"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--accent), var(--accent-light))',
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
          style={{
            left: `calc(${progress}% - 6px)`,
            background: 'var(--accent)',
            boxShadow: '0 0 8px rgba(99,102,241,0.5)',
          }}
        />
      </div>

      {/* Speed */}
      {[0.5, 1, 2].map(s => (
        <button
          key={s}
          onClick={() => setReplaySpeed(s)}
          className="px-2 py-1 rounded text-xs font-medium"
          style={{
            background: replaySpeed === s ? 'var(--neon)' : 'var(--bg-tertiary)',
            color: replaySpeed === s ? '#0a0a0f' : 'var(--text-secondary)',
          }}
        >
          {s}x
        </button>
      ))}

      {/* Loop */}
      <button
        onClick={() => setReplayLoop(!replayLoop)}
        className="w-8 h-8 flex items-center justify-center rounded-md text-xs"
        style={{
          background: replayLoop ? 'rgba(0,255,136,0.15)' : 'var(--bg-tertiary)',
          color: replayLoop ? 'var(--neon)' : 'var(--text-secondary)',
          border: replayLoop ? '1px solid rgba(0,255,136,0.3)' : '1px solid transparent',
        }}
        title="Loop"
      >
        🔁
      </button>

      {/* Exit Replay */}
      {isReplaying && (
        <button
          onClick={() => { exitReplay(); setPlaying(true); }}
          className="px-3 py-1 rounded-md text-xs font-medium"
          style={{ background: 'rgba(248,81,73,0.15)', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)' }}
        >
          Exit
        </button>
      )}

      {/* Clear */}
      <button
        onClick={clearRecording}
        className="w-8 h-8 flex items-center justify-center rounded-md text-xs"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        title="Clear Recording"
      >
        🗑
      </button>
    </div>
  )
}
