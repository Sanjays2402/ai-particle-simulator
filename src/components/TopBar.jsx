import { useRef, useEffect } from 'react'
import { useStore } from '../store'
import { presets } from '../presets'

export default function TopBar({ onSettings }) {
  const { playing, setPlaying, loadRandom, mouseAttract, setMouseAttract, audioReactive, setAudioReactive, isRecording, startRecording, stopRecording, recordingBuffer, enterReplay, isReplaying } = useStore()
  const audioCtxRef = useRef(null)
  const streamRef = useRef(null)

  const handleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  const handleExport = () => {
    const { particleFnSource, infoTitle, particleCount, glowIntensity } = useStore.getState()
    const html = generateExportHTML(particleFnSource, infoTitle, particleCount, glowIntensity)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(infoTitle || 'particles').replace(/\s+/g, '-').toLowerCase()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleScreenshot = () => {
    const canvas = document.querySelector('#particle-canvas canvas')
    if (!canvas) return
    const { infoTitle, currentPreset } = useStore.getState()
    const name = (infoTitle || currentPreset || 'particles').replace(/\s+/g, '-').toLowerCase()
    const ts = Date.now()
    const link = document.createElement('a')
    link.download = `particle-${name}-${ts}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleShare = () => {
    const { particleFnSource, currentPreset, particleCount, speed, glowIntensity, visualStyle, theme } = useStore.getState()
    const data = { code: particleFnSource, preset: currentPreset, count: particleCount, speed, glow: glowIntensity, style: visualStyle, theme }
    const json = JSON.stringify(data)
    const hash = btoa(encodeURIComponent(json))
    const url = `${window.location.origin}${window.location.pathname}#share=${hash}`
    navigator.clipboard.writeText(url).then(() => {
      const notif = document.getElementById('perf-notif')
      if (notif) { notif.textContent = '🔗 URL copied to clipboard!'; notif.style.opacity = '1'; setTimeout(() => notif.style.opacity = '0', 2000) }
    }).catch(() => {
      window.prompt('Share URL:', url)
    })
  }

  const handleMic = async () => {
    if (audioReactive) {
      // Stop
      setAudioReactive(false)
      useStore.getState().setAudioLevel(0)
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      setAudioReactive(true)
      const poll = () => {
        if (!audioCtxRef.current) return
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length / 255
        useStore.getState().setAudioLevel(avg)
        requestAnimationFrame(poll)
      }
      poll()
    } catch (e) {
      console.error('Mic access denied:', e)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Don't capture when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const { setPlaying, playing, loadRandom, loadPreset, nextPreset, prevPreset } = useStore.getState()
      switch (e.code) {
        case 'Space': e.preventDefault(); setPlaying(!playing); break
        case 'KeyR': loadRandom(); break
        case 'KeyF': handleFullscreen(); break
        case 'KeyS': handleScreenshot(); break
        case 'ArrowLeft': e.preventDefault(); prevPreset(); break
        case 'ArrowRight': e.preventDefault(); nextPreset(); break
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
        case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9': case 'Digit0': {
          const num = e.code === 'Digit0' ? 9 : parseInt(e.code.slice(5)) - 1
          if (num < presets.length) loadPreset(presets[num].id)
          break
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="h-12 flex items-center justify-between px-4 sticky top-0 z-20"
      style={{ background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        <div className="text-lg font-bold tracking-tight" style={{ color: 'var(--accent)', letterSpacing: '-0.02em' }}>
          ✦ Particle Simulator
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Btn onClick={() => setPlaying(!playing)} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          {playing ? '⏸' : '▶️'}
        </Btn>
        <RecordBtn isRecording={isRecording} onClick={() => isRecording ? stopRecording() : startRecording()} />
        {recordingBuffer.length > 0 && !isReplaying && (
          <Btn onClick={enterReplay} title="Enter Replay">🔁</Btn>
        )}
        <Btn onClick={() => {
          const { loadPreset, currentPreset, loadCustomCode, particleFnSource, infoTitle, infoDesc } = useStore.getState()
          if (currentPreset) loadPreset(currentPreset)
          else loadCustomCode(particleFnSource, infoTitle, infoDesc)
        }} title="Reset Camera">⟲</Btn>
        <Btn onClick={handleFullscreen} title="Fullscreen (F)">⛶</Btn>
        <Btn onClick={loadRandom} title="Random Preset (R)">🎲</Btn>
        <Btn onClick={() => setMouseAttract(!mouseAttract)} title="Mouse Attract" active={mouseAttract}>🧲</Btn>
        <Btn onClick={handleScreenshot} title="Screenshot (S)">📷</Btn>
        <Btn onClick={handleShare} title="Share URL">🔗</Btn>
        <Btn onClick={handleMic} title="Sound Reactivity" active={audioReactive}>🎤</Btn>
        <Btn onClick={handleExport} title="Export HTML">⬇</Btn>
        <Btn onClick={onSettings} title="Settings">⚙</Btn>
      </div>
    </div>
  )
}

function RecordBtn({ isRecording, onClick }) {
  return (
    <button
      onClick={onClick}
      title={isRecording ? 'Stop Recording' : 'Record'}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-sm transition-all hover:scale-105"
      style={{
        background: isRecording ? 'rgba(248,81,73,0.15)' : 'rgba(255,255,255,0.04)',
        border: isRecording ? '1px solid #f85149' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span style={{
        display: 'inline-block',
        width: isRecording ? 12 : 14,
        height: isRecording ? 12 : 14,
        borderRadius: isRecording ? 2 : '50%',
        background: '#f85149',
        animation: isRecording ? 'pulse-rec 1s ease-in-out infinite' : 'none',
      }} />
      <style>{`@keyframes pulse-rec { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </button>
  )
}

function Btn({ children, onClick, title, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-sm transition-all hover:scale-105"
      style={{
        background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
        color: active ? 'var(--accent)' : 'var(--text-primary)',
        border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
        ...(active ? {} : {}),
      }}
    >
      {children}
    </button>
  )
}

function generateExportHTML(code, title, count, glow) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title || 'Particle Simulation'}</title>
<style>*{margin:0;padding:0}body{background:#0a0a0f;overflow:hidden}canvas{display:block}</style>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js"><\/script>
</head><body><script>
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,1000);
camera.position.set(0,5,15);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
document.body.appendChild(renderer.domElement);
const controls=new THREE.OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;

const COUNT=${count};
const positions=new Float32Array(COUNT*3);
const colors=new Float32Array(COUNT*3);
const geo=new THREE.BufferGeometry();
geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
const mat=new THREE.PointsMaterial({size:2.5,vertexColors:true,transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true});
const points=new THREE.Points(geo,mat);
scene.add(points);

const controlValues={};
const addControl=(id,label,min,max,initial)=>{controlValues[id]=initial};
const setInfo=()=>{};
const particleFn=new Function('i','count','target','color','time','THREE','addControl','setInfo','controls',${JSON.stringify(code)});
try{const _t=new THREE.Vector3(),_c=new THREE.Color();particleFn(0,COUNT,_t,_c,0,THREE,addControl,setInfo,controlValues)}catch(e){}

const _target=new THREE.Vector3(),_color=new THREE.Color();
let t=0;
function animate(){
  requestAnimationFrame(animate);
  t+=0.016;
  for(let i=0;i<COUNT;i++){
    _target.set(0,0,0);_color.setRGB(1,1,1);
    try{particleFn(i,COUNT,_target,_color,t,THREE,()=>{},()=>{},controlValues)}catch(e){break}
    const i3=i*3;
    positions[i3]=_target.x;positions[i3+1]=_target.y;positions[i3+2]=_target.z;
    colors[i3]=_color.r;colors[i3+1]=_color.g;colors[i3+2]=_color.b;
  }
  geo.attributes.position.needsUpdate=true;
  geo.attributes.color.needsUpdate=true;
  controls.update();
  renderer.render(scene,camera);
}
animate();
onresize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)};
<\/script></body></html>`
}
