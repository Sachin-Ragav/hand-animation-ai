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
  [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],     // Index
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17],                            // Palm
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

  // Camera & Tracking State
  const [cameraRunning, setCameraRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [error, setError] = useState('')
  const [detectedHandCount, setDetectedHandCount] = useState(0)

  // Primary Mode
  const [primaryMode, setPrimaryMode] = useState(INTERACTION_MODES.STANDARD_FX)

  // Sub-Effect Selections
  const [standardSubEffect, setStandardSubEffect] = useState('AUTO')
  const [twoHandSubEffect, setTwoHandSubEffect] = useState('BEAM')
  const [enablePinchSize, setEnablePinchSize] = useState(true)
  const [enableGrabRelease, setEnableGrabRelease] = useState(true)

  // Appearance & Tuning
  const [primaryColor, setPrimaryColor] = useState('#00e5ff')
  const [secondaryColor, setSecondaryColor] = useState('#8a2be2')
  const [intensity, setIntensity] = useState(65)
  const [trailLength, setTrailLength] = useState(20)
  const [glowStrength, setGlowStrength] = useState(12)
  const [particleDensity, setParticleDensity] = useState(50)

  // Diagnostics Performance State
  const [fps, setFps] = useState(0)
  const [latencyMs, setLatencyMs] = useState(0)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const [fingerState, setFingerState] = useState({
    thumb: false, index: false, middle: false, ring: false, pinky: false,
  })
  const [currentGesture, setCurrentGesture] = useState(GESTURE_TYPES.UNKNOWN)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')

  // Synchronization refs for rapid animation frames
  const gesturesRef = useRef([])
  const primaryModeRef = useRef(primaryMode)
  const standardSubEffectRef = useRef(standardSubEffect)
  const twoHandSubEffectRef = useRef(twoHandSubEffect)
  const enablePinchSizeRef = useRef(enablePinchSize)
  const enableGrabReleaseRef = useRef(enableGrabRelease)
  const primaryColorRef = useRef(primaryColor)
  const secondaryColorRef = useRef(secondaryColor)
  const intensityRef = useRef(intensity)
  const trailLengthRef = useRef(trailLength)
  const glowStrengthRef = useRef(glowStrength)
  const particleDensityRef = useRef(particleDensity)

  // FPS calculation references
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(performance.now())

  useEffect(() => { primaryModeRef.current = primaryMode }, [primaryMode])
  useEffect(() => { standardSubEffectRef.current = standardSubEffect }, [standardSubEffect])
  useEffect(() => { twoHandSubEffectRef.current = twoHandSubEffect }, [twoHandSubEffect])
  useEffect(() => { enablePinchSizeRef.current = enablePinchSize }, [enablePinchSize])
  useEffect(() => { enableGrabReleaseRef.current = enableGrabRelease }, [enableGrabRelease])
  useEffect(() => { primaryColorRef.current = primaryColor }, [primaryColor])
  useEffect(() => { secondaryColorRef.current = secondaryColor }, [secondaryColor])
  useEffect(() => { intensityRef.current = intensity }, [intensity])
  useEffect(() => { trailLengthRef.current = trailLength }, [trailLength])
  useEffect(() => { glowStrengthRef.current = glowStrength }, [glowStrength])
  useEffect(() => { particleDensityRef.current = particleDensity }, [particleDensity])

  const resizeCanvases = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const effectsCanvas = effectsCanvasRef.current

    if (!video || !canvas || !effectsCanvas || !video.videoWidth) return

    const rect = video.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    const width = Math.round(rect.width * dpr)
    const height = Math.round(rect.height * dpr)

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

    const containerWidth = rect.width
    const containerHeight = rect.height

    const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight)
    const displayedWidth = videoWidth * scale
    const displayedHeight = videoHeight * scale
    const offsetX = (containerWidth - displayedWidth) / 2
    const offsetY = (containerHeight - displayedHeight) / 2

    context.save()

    allLandmarks.forEach((landmarks, handIndex) => {
      const points = landmarks.map((landmark) => ({
        x: (1 - landmark.x) * displayedWidth + offsetX,
        y: landmark.y * displayedHeight + offsetY,
      }))

      const strokeColor = handIndex === 0 ? primaryColorRef.current : secondaryColorRef.current

      context.beginPath()
      context.lineWidth = 5
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.strokeStyle = 'rgba(0, 0, 0, 0.85)'

      for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
        const start = points[startIndex]
        const end = points[endIndex]
        if (!start || !end) continue
        context.moveTo(start.x, start.y)
        context.lineTo(end.x, end.y)
      }
      context.stroke()

      context.beginPath()
      context.lineWidth = 3
      context.lineCap = 'round'
      context.lineJoin = 'round'
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
        context.arc(point.x, point.y, 7, 0, Math.PI * 2)
        context.fillStyle = handIndex === 0 ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255, 0, 128, 0.25)'
        context.fill()

        context.beginPath()
        context.arc(point.x, point.y, 5, 0, Math.PI * 2)
        context.fillStyle = '#05070a'
        context.fill()

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
        const procTime = Math.round(performance.now() - startTime)
        setLatencyMs(procTime)

        lastVideoTimeRef.current = video.currentTime
        allLandmarks = result.landmarks || []
        const count = allLandmarks.length
        setDetectedHandCount(count)

        if (count > 0) {
          drawHands(allLandmarks)

          const currentGestures = allLandmarks.map((landmarks) => {
            const fingers = detectFingers(landmarks)
            return detectGesture(fingers)
          })

          gesturesRef.current = currentGestures

          const primaryFingers = detectFingers(allLandmarks[0])
          setFingerState(primaryFingers)
          setCurrentGesture(currentGestures[0])
        } else {
          gesturesRef.current = []
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
          }
          setFingerState({ thumb: false, index: false, middle: false, ring: false, pinky: false })
          setCurrentGesture(GESTURE_TYPES.UNKNOWN)
        }
      }

      // Render Active Mode via Interaction Manager Engine
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

      // FPS Diagnostics Counter
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
    setStatus('Loading MediaPipe model...')
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH)

    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    return landmarker
  }, [])

  const startCamera = useCallback(
    async (cameraId = selectedCamera) => {
      if (cameraRunning || loading) return

      setLoading(true)
      setError('')
      setDetectedHandCount(0)

      try {
        setStatus('Requesting permission...')

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not available in this browser.')
        }

        const videoConstraints = cameraId
          ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })

        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error('Camera element missing.')

        video.srcObject = stream
        await video.play()

        resizeCanvases()
        setCameraRunning(true)

        try {
          if (!landmarkerRef.current) {
            landmarkerRef.current = await createLandmarker()
          }

          setStatus('Hand FX Studio Active')
          setLoading(false)
          lastVideoTimeRef.current = -1
          animationFrameRef.current = requestAnimationFrame(detectFrame)
        } catch (modelError) {
          console.error('MediaPipe model error:', modelError)
          stream.getTracks().forEach((track) => track.stop())
          streamRef.current = null
          video.pause()
          video.srcObject = null

          setCameraRunning(false)
          setLoading(false)
          setStatus('Camera works, model failed')
          setError(`MediaPipe model error: ${modelError?.message || modelError}`)
        }
      } catch (cameraError) {
        console.error('Camera error:', cameraError)
        setLoading(false)
        setCameraRunning(false)
        setDetectedHandCount(0)
        setError(cameraError?.message || 'Failed to start camera.')
        setStatus('Camera failed')
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
    setFingerState({ thumb: false, index: false, middle: false, ring: false, pinky: false })
    setCurrentGesture(GESTURE_TYPES.UNKNOWN)
    setLoading(false)
    setStatus('Camera stopped')
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

  useEffect(() => {
    const handleResize = () => resizeCanvases()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [resizeCanvases])

  useEffect(() => {
    loadCameras()
  }, [loadCameras])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close() } catch (err) { console.error(err) }
      }
      effectsEngineRef.current.resetAllState()
    }
  }, [])

  return (
    <main className="app">
      <section className="app-shell">
        {/* TOP TOOLBAR */}
        <header className="top-toolbar">
          <div className="brand-group">
            <span className="eyebrow">HAND FX STUDIO</span>
            <h1>Gesture AI Canvas</h1>
          </div>

          <div className="toolbar-status-group">
            <div className={`status-pill ${cameraRunning ? 'status-live' : 'status-idle'}`}>
              <span className="status-dot" />
              {cameraRunning ? 'CAMERA ONLINE' : 'OFFLINE'}
            </div>
            <div className={`status-pill ${detectedHandCount > 0 ? 'status-live' : 'status-idle'}`}>
              <span className="status-dot" />
              {detectedHandCount > 0 ? `${detectedHandCount} HANDS TRACKED` : 'SEARCHING'}
            </div>
          </div>
        </header>

        <section className="dashboard-grid">
          {/* CAMERA PREVIEW STAGE */}
          <div className="preview-stage">
            <div className="camera-container">
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

              {cameraRunning && (
                <div className="stage-overlay-badge">
                  <span className={detectedHandCount > 0 ? 'indicator-dot detected' : 'indicator-dot'} />
                  MODE: {primaryMode.replace('_', ' ')} | GESTURE: {currentGesture.name}
                </div>
              )}
            </div>

            <div className="camera-quick-bar">
              <select
                className="camera-selector"
                value={selectedCamera}
                onChange={handleCameraChange}
                disabled={loading}
              >
                {cameras.length === 0 ? (
                  <option value="">No cameras detected</option>
                ) : (
                  cameras.map((camera, idx) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Camera ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>

              <div className="camera-action-buttons">
                <button
                  className="btn-primary"
                  onClick={() => startCamera()}
                  disabled={cameraRunning || loading}
                >
                  {loading ? 'Starting...' : 'Start Camera'}
                </button>

                <button
                  className="btn-secondary"
                  onClick={stopCamera}
                  disabled={!cameraRunning && !loading}
                >
                  Stop Camera
                </button>
              </div>
            </div>
          </div>

          {/* STUDIO CONTROLS PANEL */}
          <aside className="control-sidebar">
            {/* PRIMARY MODE SELECTOR */}
            <div className="studio-card">
              <div className="card-header">
                <h2>Primary Mode</h2>
              </div>
              <div className="mode-selector-grid">
                {[
                  { id: INTERACTION_MODES.STANDARD_FX, label: 'Standard FX', icon: '✨' },
                  { id: INTERACTION_MODES.ENERGY_ORB, label: 'Energy Orb', icon: '🔮' },
                  { id: INTERACTION_MODES.TWO_HAND, label: 'Two-Hand', icon: '👐' },
                  { id: INTERACTION_MODES.AIR_DRAWING, label: 'Air Drawing', icon: '✏️' },
                  { id: INTERACTION_MODES.TRACKING_ONLY, label: 'Tracking Only', icon: '🎯' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    className={`mode-btn ${primaryMode === mode.id ? 'active' : ''}`}
                    onClick={() => handleModeChange(mode.id)}
                  >
                    <span className="mode-icon">{mode.icon}</span>
                    <span className="mode-label">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* DYNAMIC SUB-EFFECT CONTROLS */}
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
                      <button
                        key={eff.id}
                        className={`sub-btn ${standardSubEffect === eff.id ? 'active' : ''}`}
                        onClick={() => setStandardSubEffect(eff.id)}
                      >
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
                    <input
                      type="checkbox"
                      checked={enablePinchSize}
                      onChange={(e) => setEnablePinchSize(e.target.checked)}
                    />
                  </label>
                  <label className="toggle-row">
                    <span>Grab & Release Burst</span>
                    <input
                      type="checkbox"
                      checked={enableGrabRelease}
                      onChange={(e) => setEnableGrabRelease(e.target.checked)}
                    />
                  </label>
                </div>
              )}

              {primaryMode === INTERACTION_MODES.TWO_HAND && (
                <div className="sub-controls-group">
                  <label className="input-label">Two-Hand Interaction Sub-Effect</label>
                  <div className="sub-btn-grid">
                    {[
                      { id: 'BEAM', label: 'Energy Beam' },
                      { id: 'PORTAL', label: 'Portal Mode' },
                      { id: 'DUAL_BURST', label: 'Dual Burst' },
                    ].map((sub) => (
                      <button
                        key={sub.id}
                        className={`sub-btn ${twoHandSubEffect === sub.id ? 'active' : ''}`}
                        onClick={() => setTwoHandSubEffect(sub.id)}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {primaryMode === INTERACTION_MODES.AIR_DRAWING && (
                <div className="sub-controls-group">
                  <p className="instruction-text">
                    Point index finger to draw glowing lines. Use the button above to clear paths.
                  </p>
                </div>
              )}

              {primaryMode === INTERACTION_MODES.TRACKING_ONLY && (
                <div className="sub-controls-group">
                  <p className="instruction-text">
                    Visual effects are disabled. Landmark skeleton and gesture detection stay active.
                  </p>
                </div>
              )}
            </div>

            {/* COLLAPSIBLE APPEARANCE ACCORDION */}
            <div className="studio-card accordion-card">
              <button
                className="accordion-header"
                onClick={() => setShowAppearance(!showAppearance)}
              >
                <span>Appearance & Tuning</span>
                <span className="accordion-arrow">{showAppearance ? '▲' : '▼'}</span>
              </button>

              {showAppearance && (
                <div className="accordion-body">
                  <div className="color-inputs-row">
                    <div className="color-field">
                      <label>Primary Color</label>
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                    </div>
                    <div className="color-field">
                      <label>Secondary Color</label>
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="slider-field">
                    <div className="slider-label">
                      <span>Intensity</span>
                      <span>{intensity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={intensity}
                      onChange={(e) => setIntensity(Number(e.target.value))}
                    />
                  </div>

                  <div className="slider-field">
                    <div className="slider-label">
                      <span>Trail Length</span>
                      <span>{trailLength} pts</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={trailLength}
                      onChange={(e) => setTrailLength(Number(e.target.value))}
                    />
                  </div>

                  <div className="slider-field">
                    <div className="slider-label">
                      <span>Glow Strength</span>
                      <span>{glowStrength} px</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="30"
                      value={glowStrength}
                      onChange={(e) => setGlowStrength(Number(e.target.value))}
                    />
                  </div>

                  <div className="slider-field">
                    <div className="slider-label">
                      <span>Particle Density</span>
                      <span>{particleDensity}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={particleDensity}
                      onChange={(e) => setParticleDensity(Number(e.target.value))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* COLLAPSIBLE DIAGNOSTICS ACCORDION */}
            <div className="studio-card accordion-card">
              <button
                className="accordion-header"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
              >
                <span>Diagnostics & Metrics</span>
                <span className="accordion-arrow">{showDiagnostics ? '▲' : '▼'}</span>
              </button>

              {showDiagnostics && (
                <div className="accordion-body diagnostics-body">
                  <div className="diag-row">
                    <span>FPS:</span>
                    <strong>{fps}</strong>
                  </div>
                  <div className="diag-row">
                    <span>Detection Latency:</span>
                    <strong>{latencyMs} ms</strong>
                  </div>
                  <div className="diag-row">
                    <span>Hands Detected:</span>
                    <strong>{detectedHandCount} / 2</strong>
                  </div>
                  <div className="diag-row">
                    <span>Primary Gesture:</span>
                    <strong>{currentGesture.name}</strong>
                  </div>
                  <div className="diag-row">
                    <span>Active Mode:</span>
                    <strong>{primaryMode}</strong>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </section>

        {error && (
          <section className="error-card">
            <div className="error-title">System Error</div>
            <p>{error}</p>
          </section>
        )}
      </section>
    </main>
  )
}

export default App