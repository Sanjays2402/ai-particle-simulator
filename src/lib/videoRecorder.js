// WebM / MP4 video recorder backed by the browser's MediaRecorder API.
// We capture the WebGL canvas via canvas.captureStream(fps) and stream
// chunks into a single Blob we then offer as a download.
//
// MediaRecorder support varies: Chrome/Edge prefer video/webm;codecs=vp9,
// Safari prefers video/mp4;codecs=avc1. We pick the first mime type the
// browser actually supports. If none match, the constructor throws and
// startRecording returns null so the caller can show an error.

const CANDIDATE_MIMES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1',
  'video/mp4',
]

export function pickSupportedMime() {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of CANDIDATE_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return null
}

export function isVideoExportSupported() {
  return pickSupportedMime() !== null
}

// Start recording from a canvas element. Returns a controller with stop()
// that resolves to a download-ready Blob, or null if unsupported.
export function startCanvasRecording(canvas, { fps = 30, bitsPerSecond = 8_000_000 } = {}) {
  const mime = pickSupportedMime()
  if (!canvas || !mime) return null

  // captureStream(fps) emits a new frame every 1/fps seconds.
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitsPerSecond })
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }

  // Time-slice into chunks every 100ms so even a tab close has some data.
  recorder.start(100)

  return {
    mime,
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mime })
          // Stop all tracks so the camera-like indicator goes away.
          stream.getTracks().forEach(t => t.stop())
          resolve({ blob, mime })
        }
        try { recorder.stop() } catch { resolve({ blob: new Blob(chunks, { type: mime }), mime }) }
      })
    },
  }
}

// Helper: given a Blob and a base filename, trigger a browser download
// using the right extension for the mime type.
export function downloadVideoBlob(blob, mime, baseName = 'particle-video') {
  const ext = mime.includes('mp4') ? 'mp4' : 'webm'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}-${Date.now()}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
