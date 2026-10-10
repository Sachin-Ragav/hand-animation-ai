import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import {
  detectFingers,
  detectGesture,
  GESTURE_TYPES,
} from './utils/handHelpers'
import { EffectsEngine, INTERACTION_MODES } from './utils/effectsEngine'
import './App.css'

const WASM_PATH = '/mediapipe-wasm'
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const DEMO_STEPS = [
  { mode: INTERACTION_MODES.STANDARD_FX, sub: 'AURA', title: 'Step 1: Magic Aura', text: 'Open your palm fully to summon a glowing energy aura.' },
  { mode: INTERACTION_MODES.STANDARD_FX, sub: 'LIGHTNING', title: 'Step 2: Lightning Trail', text: 'Extend your index finger and point to generate electric neon trails.' },
  { mode: INTERACTION_MODES.STANDARD_FX, sub: 'BURST', title: 'Step 3: Energy Burst', text: 'Make a closed Fist to trigger a shockwave explosion.' },
  { mode: INTERACTION_MODES.STANDARD_FX, sub: 'DUAL_TRAILS', title: 'Step 4: Dual Trails', text: 'Show a Peace sign (Index + Middle) for dual finger energy paths.' },
  { mode: INTERACTION_MODES.ENERGY_ORB, title: 'Step 5: Energy Orb', text: 'Control a glowing orb with your palm. Pinch to resize, close fist and open to release!' },
  { mode: INTERACTION_MODES.TWO_HAND, sub: 'PORTAL', title: 'Step 6: Two-Hand Portal', text: 'Bring two hands into frame to summon a scalable energy portal.' },
]

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const effectsCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const animationFrameRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)

  const effectsEngineRef = useRef(new EffectsEngine())

  const [cameraRunning, setCameraRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [error, setError] = useState('')
  const [detectedHandCount, setDetectedHandCount] = useState(0)

  // Studio Settings State
  const [primaryMode, setPrimaryMode] = useState(INTERACTION_MODES.STANDARD_FX)
  const [standardSubEffect, setStandardSubEffect] = useState('AUTO')
  const [twoHandSubEffect, setTwoHandSubEffect] = useState('BEAM')
  const [backgroundOption, setBackgroundOption] = useState('GRADIENT')
  const [performancePreset, setPerformancePreset] = useState('BALANCED')
  const [enablePinchSize, setEnablePinchSize] = useState(true)
  const [enableGrabRelease, setEnableGrabRelease] = useState(true)

  const [primaryColor, setPrimaryColor] = useState('#00e5ff')
  const [secondaryColor, setSecondaryColor] = useState('#8a2be2')
  const [intensity, setIntensity] = useState(65)
  const [trailLength, setTrailLength] = useState(20)
  const [glowStrength, setGlowStrength] = useState(12)
  const [particleDensity, setParticleDensity] = useState(50)

  // Immersive, Demo & Presets State
  const [isImmersive, setIsImmersive] = useState(false)
  const [demoModeActive, setDemoModeActive] = useState(false)
  const [demoStepIndex, setDemoStepIndex] = useState(0)
  const [presets, setPresets] = useState([])
  const [presetNameInput, setPresetNameInput] = useState('')
  const [showPresetsModal, setShowPresetsModal] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const [fps, setFps] = useState(0)
  const [latencyMs, setLatencyMs] = useState(0)
  const [currentGesture, setCurrentGesture] = useState(GESTURE_TYPES.UNKNOWN)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')

  // Sync refs for animation frame performance
  const gesturesRef = useRef([])
  const primaryModeRef = useRef(primaryMode)
  const standardSubEffectRef = useRef(standardSubEffect)
  const twoHandSubEffectRef = useRef(twoHandSubEffect)
  const backgroundOptionRef = useRef(backgroundOption)
  const enablePinchSizeRef = useRef(enablePinchSize)
  const enableGrabReleaseRef = useRef(enableGrabRelease)
  const primaryColorRef = useRef(primaryColor)
  const secondaryColorRef = useRef(secondaryColor)
  const intensityRef = useRef(intensity)
  const trailLengthRef = useRef(trailLength)
  const glowStrengthRef = useRef(glowStrength)
  const particleDensityRef = useRef(particleDensity)

  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(performance.now())

  useEffect(() => { primaryModeRef.current = primaryMode }, [primaryMode])
  useEffect(() => { standardSubEffectRef.current = standardSubEffect }, [standardSubEffect])
  useEffect(() => { twoHandSubEffectRef.current = twoHandSubEffect }, [twoHandSubEffect])
  useEffect(() => { backgroundOptionRef.current = backgroundOption }, [backgroundOption])
  useEffect(() => { enablePinchSizeRef.current = enablePinchSize }, [enablePinchSize])
  useEffect(() => { enableGrabReleaseRef.current = enableGrabRelease }, [enableGrabRelease])
  useEffect(() => { primaryColorRef.current = primaryColor }, [primaryColor])
  useEffect(() => { secondaryColorRef.current = secondaryColor }, [secondaryColor])
  useEffect(() => { intensityRef.current = intensity }, [intensity])
  useEffect(() => { trailLengthRef.current = trailLength }, [trailLength])
  useEffect(() => { glowStrengthRef.current = glowStrength }, [glowStrength])
  useEffect(() => { particleDensityRef.current = particleDensity }, [particleDensity])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hand_fx_studio_presets')
      if (saved) setPresets(JSON.parse(saved))
    } catch (e) { console.error(e) }
  }, [])

  const savePreset = () => {
    if (!presetNameInput.trim()) return
    const newPreset = {
      id: Date.now(),
      name: presetNameInput.trim(),
      settings: {
        primaryMode, standardSubEffect, twoHandSubEffect, backgroundOption,
        primaryColor, secondaryColor, intensity, trailLength, glowStrength, particleDensity
      }
    }
    const updated = [...presets, newPreset]
    setPresets(updated)
    setPresetNameInput('')
    try { localStorage.setItem('hand_fx_studio_presets', JSON.stringify(updated)) } catch (e) { console.error(e) }
  }

  const loadPreset = (preset) => {
    const s = preset.settings
    if (s.primaryMode) { setPrimaryMode(s.primaryMode); effectsEngineRef.current.setPrimaryMode(s.primaryMode) }
    if (s.standardSubEffect) setStandardSubEffect(s.standardSubEffect)
    if (s.twoHandSubEffect) setTwoHandSubEffect(s.twoHandSubEffect)
    if (s.backgroundOption) { setBackgroundOption(s.backgroundOption); effectsEngineRef.current.setBackground(s.backgroundOption) }
    if (s.primaryColor) setPrimaryColor(s.primaryColor)
    if (s.secondaryColor) setSecondaryColor(s.secondaryColor)
    if (s.intensity !== undefined) setIntensity(s.intensity)
    if (s.trailLength !== undefined) setTrailLength(s.trailLength)
    if (s.glowStrength !== undefined) setGlowStrength(s.glowStrength)
    if (s.particleDensity !== undefined) setParticleDensity(s.particleDensity)
  }

  const deletePreset = (id) => {
    const updated = presets.filter(p => p.id !== id)
    setPresets(updated)
    try { localStorage.setItem('hand_fx_studio_presets', JSON.stringify(updated)) } catch (e) { console.error(e) }
  }

  const handlePerformanceChange = (preset) => {
    setPerformancePreset(preset)
    effectsEngineRef.current.setPerformanceLevel(preset)
    if (preset === 'PERFORMANCE') setParticleDensity(30)
    else if (preset === 'BALANCED') setParticleDensity(50)
    else if (preset === 'QUALITY') setParticleDensity(90)
  }

  const resizeCanvases = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const effectsCanvas = effectsCanvasRef.current

    if (!video || !canvas || !effectsCanvas || !video.videoWidth) return

    const rect = video.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    const width = Math.round(rect.width * dpr)
    const height = Math.round(rect.height * dpr)

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      effectsCanvas.width = width
      effectsCanvas.height = height
      effectsCanvas.style.width = `${rect.width}px`
      effectsCanvas.style.height = `${rect.height}px`

      const context = canvas.getContext('2d')
      if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const effectsContext = effectsCanvas.getContext('2d')
      if (effectsContext) effectsContext.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }, [])

  const clearCanvases = useCallback(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
    if (effectsCanvasRef.current) {
      const ctx = effectsCanvasRef.current.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, effectsCanvasRef.current.width, effectsCanvasRef.current.height)
    }
    effectsEngineRef.current.clearParticles()
  }, [])

  const drawHands = useCallback((allLandmarks) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !allLandmarks) return

    const context = canvas.getContext('2d')
    if (!context) return

    const rect = canvas.getBoundingClientRect()
    context.clearRect(0, 0, rect.width, rect.height)

    const videoWidth = video.videoWidth
    const videoHeight = video.videoHeight
    if (!videoWidth || !videoHeight) return

    const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight)
    const displayedWidth = videoWidth * scale
    const displayedHeight = videoHeight * scale
    const offsetX = (rect.width - displayedWidth) / 2
    const offsetY = (rect.height - displayedHeight) / 2

    context.save()
    allLandmarks.forEach((landmarks, handIndex) => {
      const points = landmarks.map((landmark) => ({
        x: (1 - landmark.x) * displayedWidth + offsetX,
        y: landmark.y * displayedHeight + offsetY,
      }))
      const strokeColor = handIndex === 0 ? primaryColorRef.current : secondaryColorRef.current

      context.beginPath()
      context.lineWidth = 3
      context.lineCap = 'round'
      context.strokeStyle = strokeColor

      for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
        const start = points[startIndex]
        const end = points[endIndex]
        if (!start || !end) continue
        context.moveTo(start.x, start.y)
        context.lineTo(end.x, end.y)
      }
      context.stroke()

      for (let index = 0; index < points.length; index += 1) {
        const point = points[index]
        context.beginPath()
        context.arc(point.x, point.y, 3, 0, Math.PI * 2)
        context.fillStyle = index === 0 ? '#ffffff' : strokeColor
        context.fill()
      }
    })
    context.restore()
  }, [])

  const detectFrame = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    const effectsCanvas = effectsCanvasRef.current

    if (!video || !landmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectFrame)
      return
    }

    try {
      const now = performance.now()
      let allLandmarks = []

      if (video.currentTime !== lastVideoTimeRef.current) {
        const startTime = performance.now()
        const result = landmarker.detectForVideo(video, now)
        setLatencyMs(Math.round(performance.now() - startTime))

        lastVideoTimeRef.current = video.currentTime
        allLandmarks = result.landmarks || []
        const count = allLandmarks.length

        setDetectedHandCount((prev) => (prev !== count ? count : prev))

        if (count > 0) {
          drawHands(allLandmarks)
          const currentGestures = allLandmarks.map((landmarks) => {
            const fingers = detectFingers(landmarks)
            return detectGesture(fingers)
          })
          gesturesRef.current = currentGestures
          setCurrentGesture((prev) => (prev.id !== currentGestures[0].id ? currentGestures[0] : prev))
        } else {
          gesturesRef.current = []
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
          }
          setCurrentGesture((prev) => (prev.id !== GESTURE_TYPES.UNKNOWN.id ? GESTURE_TYPES.UNKNOWN : prev))
        }
      }

      if (effectsCanvas) {
        const effectsContext = effectsCanvas.getContext('2d')
        if (effectsContext) {
          const rect = effectsCanvas.getBoundingClientRect()
          effectsEngineRef.current.updateAndDraw({
            context: effectsContext,
            width: rect.width,
            height: rect.height,
            allLandmarks,
            gestures: gesturesRef.current,
            primaryMode: primaryModeRef.current,
            standardSubEffect: standardSubEffectRef.current,
            twoHandSubEffect: twoHandSubEffectRef.current,
            backgroundOption: backgroundOptionRef.current,
            enablePinchSize: enablePinchSizeRef.current,
            enableGrabRelease: enableGrabReleaseRef.current,
            intensity: intensityRef.current,
            primaryColor: primaryColorRef.current,
            secondaryColor: secondaryColorRef.current,
            trailLength: trailLengthRef.current,
            glowStrength: glowStrengthRef.current,
            particleDensity: particleDensityRef.current,
          })
        }
      }

      frameCountRef.current += 1
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current)))
        frameCountRef.current = 0
        lastFpsTimeRef.current = now
      }
    } catch (detectionError) {
      console.error('Hand detection error:', detectionError)
    }

    animationFrameRef.current = requestAnimationFrame(detectFrame)
  }, [drawHands])

  const loadCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')
      setCameras(videoDevices)
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId)
      }
    } catch (deviceError) {
      console.error('Could not list cameras:', deviceError)
    }
  }, [selectedCamera])

  const createLandmarker = useCallback(async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  }, [])

  const startCamera = useCallback(
    async (cameraId = selectedCamera) => {
      if (cameraRunning || loading) return
      setLoading(true)
      setError('')
      setDetectedHandCount(0)

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access not available in this browser.')
        }

        const videoConstraints = cameraId
          ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }

        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error('Camera element missing.')

        video.srcObject = stream
        await video.play()

        resizeCanvases()
        setCameraRunning(true)

        if (!landmarkerRef.current) {
          landmarkerRef.current = await createLandmarker()
        }

        setLoading(false)
        lastVideoTimeRef.current = -1
        animationFrameRef.current = requestAnimationFrame(detectFrame)
      } catch (cameraError) {
        setLoading(false)
        setCameraRunning(false)
        setError(cameraError?.message || 'Failed to start camera.')
      }
    },
    [cameraRunning, createLandmarker, detectFrame, loading, resizeCanvases, selectedCamera]
  )

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
    clearCanvases()
    lastVideoTimeRef.current = -1
    setCameraRunning(false)
    setDetectedHandCount(0)
    setCurrentGesture(GESTURE_TYPES.UNKNOWN)
    setLoading(false)
  }, [clearCanvases])

  const handleCameraChange = async (event) => {
    const newCameraId = event.target.value
    setSelectedCamera(newCameraId)
    if (cameraRunning) {
      stopCamera()
      setTimeout(() => startCamera(newCameraId), 150)
    }
  }

  const handleModeChange = (mode) => {
    setPrimaryMode(mode)
    effectsEngineRef.current.setPrimaryMode(mode)
  }

  const handleBackgroundChange = (bg) => {
    setBackgroundOption(bg)
    effectsEngineRef.current.setBackground(bg)
  }

  const startDemoStep = (index) => {
    const step = DEMO_STEPS[index]
    handleModeChange(step.mode)
    if (step.sub) setStandardSubEffect(step.sub)
    if (step.mode === INTERACTION_MODES.TWO_HAND) setTwoHandSubEffect('PORTAL')
  }

  useEffect(() => {
    const handleResize = () => resizeCanvases()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [resizeCanvases])

  useEffect(() => { loadCameras() }, [loadCameras])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close() } catch (e) { console.error(e) }
      }
    }
  }, [])

  return (
    <main className={`app ${isImmersive ? 'immersive-active' : ''}`}>
      <section className="app-shell">
        {!isImmersive && (
          <header className="top-toolbar">
            <div className="brand-group">
              <span className="eyebrow">HAND FX STUDIO</span>
              <h1>Gesture AI Canvas</h1>
            </div>

            <div className="toolbar-status-group">
              <button
                className={`sub-btn ${performancePreset === 'PERFORMANCE' ? 'active' : ''}`}
                onClick={() => handlePerformanceChange('PERFORMANCE')}
              >
                ⚡ Perf
              </button>
              <button
                className={`sub-btn ${performancePreset === 'BALANCED' ? 'active' : ''}`}
                onClick={() => handlePerformanceChange('BALANCED')}
              >
                ⚖️ Balanced
              </button>
              <button
                className={`sub-btn ${performancePreset === 'QUALITY' ? 'active' : ''}`}
                onClick={() => handlePerformanceChange('QUALITY')}
              >
                💎 Quality
              </button>
              <button
                className="btn-accent-glow"
                onClick={() => { setDemoModeActive(true); setDemoStepIndex(0); startDemoStep(0); }}
              >
                ✨ Demo
              </button>
              <button className="btn-secondary" onClick={() => setShowPresetsModal(true)}>
                💾 Presets ({presets.length})
              </button>
              <button className="btn-primary" onClick={() => setIsImmersive(true)}>
                ⤢ Immersive
              </button>
            </div>
          </header>
        )}

        <section className={`dashboard-grid ${isImmersive ? 'immersive-grid' : ''}`}>
          <div className="preview-stage">
            <div className={`camera-container ${isImmersive ? 'fullscreen-container' : ''}`}>
              <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
              <canvas ref={canvasRef} className="hand-canvas" />
              <canvas ref={effectsCanvasRef} className="effects-canvas" />

              {!cameraRunning && (
                <div className="camera-placeholder">
                  <div className="placeholder-icon">🔮</div>
                  <h2>Hand FX Studio Ready</h2>
                  <p>Click Start Camera to initialize real-time interaction.</p>
                </div>
              )}

              {cameraRunning && !isImmersive && (
                <div className="stage-overlay-badge">
                  <span className={detectedHandCount > 0 ? 'indicator-dot detected' : 'indicator-dot'} />
                  MODE: {primaryMode} | GESTURE: {currentGesture.name} | FPS: {fps}
                </div>
              )}

              {isImmersive && (
                <div className="immersive-floating-hud">
                  <div className="hud-badge">FPS: {fps} | Latency: {latencyMs}ms</div>
                  <button className="btn-exit-immersive" onClick={() => setIsImmersive(false)}>Exit Immersive</button>
                </div>
              )}

              {demoModeActive && (
                <div className="demo-banner">
                  <div className="demo-content">
                    <span className="demo-step-counter">Demo Step {demoStepIndex + 1} of {DEMO_STEPS.length}</span>
                    <h3>{DEMO_STEPS[demoStepIndex].title}</h3>
                    <p>{DEMO_STEPS[demoStepIndex].text}</p>
                  </div>
                  <div className="demo-buttons">
                    {demoStepIndex > 0 && (
                      <button className="btn-secondary" onClick={() => { const next = demoStepIndex - 1; setDemoStepIndex(next); startDemoStep(next); }}>Previous</button>
                    )}
                    {demoStepIndex < DEMO_STEPS.length - 1 ? (
                      <button className="btn-primary" onClick={() => { const next = demoStepIndex + 1; setDemoStepIndex(next); startDemoStep(next); }}>Next</button>
                    ) : (
                      <button className="btn-primary" onClick={() => setDemoModeActive(false)}>Finish</button>
                    )}
                    <button className="btn-link-danger" onClick={() => setDemoModeActive(false)}>Exit</button>
                  </div>
                </div>
              )}
            </div>

            {!isImmersive && (
              <div className="camera-quick-bar">
                <select className="camera-selector" value={selectedCamera} onChange={handleCameraChange} disabled={loading}>
                  {cameras.length === 0 ? <option value="">No cameras</option> : cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
                </select>
                <div className="camera-action-buttons">
                  <button className="btn-primary" onClick={() => startCamera()} disabled={cameraRunning || loading}>Start Camera</button>
                  <button className="btn-secondary" onClick={stopCamera} disabled={!cameraRunning && !loading}>Stop Camera</button>
                </div>
              </div>
            )}
          </div>

          {!isImmersive && (
            <aside className="control-sidebar">
              {/* PRIMARY MODE */}
              <div className="studio-card">
                <div className="card-header"><h2>Primary Mode</h2></div>
                <div className="mode-selector-grid">
                  {[
                    { id: INTERACTION_MODES.STANDARD_FX, label: 'Standard FX', icon: '✨' },
                    { id: INTERACTION_MODES.ENERGY_ORB, label: 'Energy Orb', icon: '🔮' },
                    { id: INTERACTION_MODES.TWO_HAND, label: 'Two-Hand', icon: '👐' },
                    { id: INTERACTION_MODES.AIR_DRAWING, label: 'Air Drawing', icon: '✏️' },
                    { id: INTERACTION_MODES.TRACKING_ONLY, label: 'Tracking Only', icon: '🎯' },
                  ].map((mode) => (
                    <button key={mode.id} className={`mode-btn ${primaryMode === mode.id ? 'active' : ''}`} onClick={() => handleModeChange(mode.id)}>
                      <span>{mode.icon}</span><span>{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* BACKGROUND SELECTOR */}
              <div className="studio-card">
                <div className="card-header"><h2>Background Theme</h2></div>
                <div className="sub-btn-grid">
                  {[
                    { id: 'GRADIENT', label: 'Dark Gradient' },
                    { id: 'BLACK', label: 'Pure Black' },
                    { id: 'STARFIELD', label: 'Starfield' },
                    { id: 'ENERGY_GRID', label: 'Energy Grid' },
                  ].map((bg) => (
                    <button key={bg.id} className={`sub-btn ${backgroundOption === bg.id ? 'active' : ''}`} onClick={() => handleBackgroundChange(bg.id)}>
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* MODE CONTROLS */}
              <div className="studio-card">
                <div className="card-header">
                  <h2>Mode Controls</h2>
                  {(primaryMode === INTERACTION_MODES.AIR_DRAWING || primaryMode === INTERACTION_MODES.STANDARD_FX) && (
                    <button
                      className="btn-link-danger"
                      onClick={() =>
                        primaryMode === INTERACTION_MODES.AIR_DRAWING
                          ? effectsEngineRef.current.clearDrawing()
                          : effectsEngineRef.current.clearParticles()
                      }
                    >
                      Clear Canvas
                    </button>
                  )}
                </div>

                {primaryMode === INTERACTION_MODES.STANDARD_FX && (
                  <div className="sub-controls-group">
                    <label className="input-label">Standard FX Effect</label>
                    <div className="sub-btn-grid">
                      {[
                        { id: 'AUTO', label: 'Auto Mode' },
                        { id: 'AURA', label: 'Magic Aura' },
                        { id: 'LIGHTNING', label: 'Lightning' },
                        { id: 'BURST', label: 'Burst' },
                        { id: 'DUAL_TRAILS', label: 'Dual Trails' },
                        { id: 'OFF', label: 'Off' },
                      ].map((eff) => (
                        <button key={eff.id} className={`sub-btn ${standardSubEffect === eff.id ? 'active' : ''}`} onClick={() => setStandardSubEffect(eff.id)}>
                          {eff.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {primaryMode === INTERACTION_MODES.ENERGY_ORB && (
                  <div className="sub-controls-group">
                    <label className="toggle-row">
                      <span>Pinch-to-Resize</span>
                      <input type="checkbox" checked={enablePinchSize} onChange={(e) => setEnablePinchSize(e.target.checked)} />
                    </label>
                    <label className="toggle-row">
                      <span>Grab & Release Burst</span>
                      <input type="checkbox" checked={enableGrabRelease} onChange={(e) => setEnableGrabRelease(e.target.checked)} />
                    </label>
                  </div>
                )}

                {primaryMode === INTERACTION_MODES.TWO_HAND && (
                  <div className="sub-controls-group">
                    <label className="input-label">Two-Hand Sub-Effect</label>
                    <div className="sub-btn-grid">
                      {[
                        { id: 'BEAM', label: 'Energy Beam' },
                        { id: 'PORTAL', label: 'Portal Mode' },
                        { id: 'DUAL_BURST', label: 'Dual Burst' },
                      ].map((sub) => (
                        <button key={sub.id} className={`sub-btn ${twoHandSubEffect === sub.id ? 'active' : ''}`} onClick={() => setTwoHandSubEffect(sub.id)}>
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {primaryMode === INTERACTION_MODES.AIR_DRAWING && (
                  <p className="instruction-text">Point index finger to draw glowing lines.</p>
                )}
                {primaryMode === INTERACTION_MODES.TRACKING_ONLY && (
                  <p className="instruction-text">Visual effects disabled. Skeleton tracking active.</p>
                )}
              </div>

              {/* APPEARANCE ACCORDION */}
              <div className="studio-card accordion-card">
                <button className="accordion-header" onClick={() => setShowAppearance(!showAppearance)}>
                  <span>Appearance & Tuning</span><span>{showAppearance ? '▲' : '▼'}</span>
                </button>
                {showAppearance && (
                  <div className="accordion-body">
                    <div className="color-inputs-row">
                      <div className="color-field">
                        <label>Primary Color</label>
                        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
                      </div>
                      <div className="color-field">
                        <label>Secondary Color</label>
                        <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
                      </div>
                    </div>
                    <div className="slider-field">
                      <div className="slider-label"><span>Intensity</span><span>{intensity}%</span></div>
                      <input type="range" min="0" max="100" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
                    </div>
                    <div className="slider-field">
                      <div className="slider-label"><span>Trail Length</span><span>{trailLength} pts</span></div>
                      <input type="range" min="5" max="40" value={trailLength} onChange={(e) => setTrailLength(Number(e.target.value))} />
                    </div>
                    <div className="slider-field">
                      <div className="slider-label"><span>Glow Strength</span><span>{glowStrength} px</span></div>
                      <input type="range" min="4" max="30" value={glowStrength} onChange={(e) => setGlowStrength(Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>

              {/* DIAGNOSTICS ACCORDION */}
              <div className="studio-card accordion-card">
                <button className="accordion-header" onClick={() => setShowDiagnostics(!showDiagnostics)}>
                  <span>Diagnostics & Metrics</span><span>{showDiagnostics ? '▲' : '▼'}</span>
                </button>
                {showDiagnostics && (
                  <div className="accordion-body diagnostics-body">
                    <div className="diag-row"><span>FPS:</span><strong>{fps}</strong></div>
                    <div className="diag-row"><span>Latency:</span><strong>{latencyMs} ms</strong></div>
                    <div className="diag-row"><span>Hands:</span><strong>{detectedHandCount} / 2</strong></div>
                    <div className="diag-row"><span>Gesture:</span><strong>{currentGesture.name}</strong></div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </section>

        {/* PRESETS MODAL */}
        {showPresetsModal && (
          <div className="modal-backdrop" onClick={() => setShowPresetsModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Studio Presets</h2>
                <button className="btn-link-danger" onClick={() => setShowPresetsModal(false)}>✕</button>
              </div>
              <div className="preset-save-row">
                <input type="text" placeholder="Preset name..." value={presetNameInput} onChange={(e) => setPresetNameInput(e.target.value)} />
                <button className="btn-primary" onClick={savePreset}>Save</button>
              </div>
              <div className="presets-list">
                {presets.length === 0 ? <p className="empty-text">No saved presets.</p> : presets.map(p => (
                  <div key={p.id} className="preset-item">
                    <span>{p.name}</span>
                    <div className="preset-actions">
                      <button className="sub-btn" onClick={() => { loadPreset(p); setShowPresetsModal(false); }}>Load</button>
                      <button className="btn-link-danger" onClick={() => deletePreset(p.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default App