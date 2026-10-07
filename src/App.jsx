import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { detectFingers, detectGesture, GESTURE_TYPES } from './utils/handHelpers'
import './App.css'

const WASM_PATH = '/mediapipe-wasm'

const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [0, 17],
]

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const animationFrameRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)

  const [cameraRunning, setCameraRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [error, setError] = useState('')
  const [handDetected, setHandDetected] = useState(false)

  const [fingerState, setFingerState] = useState({
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false,
  })

  const [currentGesture, setCurrentGesture] = useState(GESTURE_TYPES.UNKNOWN)

  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')

  const resizeCanvas = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) return

    const rect = video.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)

    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const context = canvas.getContext('2d')
    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const rect = canvas.getBoundingClientRect()
    context.clearRect(0, 0, rect.width, rect.height)
  }, [])

  const drawHand = useCallback((landmarks) => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !landmarks) return

    const context = canvas.getContext('2d')
    if (!context) return

    const rect = canvas.getBoundingClientRect()
    context.clearRect(0, 0, rect.width, rect.height)

    const videoWidth = video.videoWidth
    const videoHeight = video.videoHeight
    if (!videoWidth || !videoHeight) return

    const containerWidth = rect.width
    const containerHeight = rect.height

    const scale = Math.max(
      containerWidth / videoWidth,
      containerHeight / videoHeight
    )

    const displayedWidth = videoWidth * scale
    const displayedHeight = videoHeight * scale

    const offsetX = (containerWidth - displayedWidth) / 2
    const offsetY = (containerHeight - displayedHeight) / 2

    const points = landmarks.map((landmark) => ({
      x: (1 - landmark.x) * displayedWidth + offsetX,
      y: landmark.y * displayedHeight + offsetY,
    }))

    context.save()

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
    context.strokeStyle = '#00e5ff'

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
      context.arc(point.x, point.y, 8, 0, Math.PI * 2)
      context.fillStyle = 'rgba(0, 229, 255, 0.25)'
      context.fill()

      context.beginPath()
      context.arc(point.x, point.y, 6, 0, Math.PI * 2)
      context.fillStyle = '#05070a'
      context.fill()

      context.beginPath()
      context.arc(point.x, point.y, 4, 0, Math.PI * 2)
      context.fillStyle = index === 0 ? '#ffffff' : '#00e5ff'
      context.fill()

      context.lineWidth = 1.5
      context.strokeStyle = '#ffffff'
      context.stroke()
    }

    context.restore()
  }, [])

  const detectFrame = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current

    if (!video || !landmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectFrame)
      return
    }

    try {
      if (video.currentTime !== lastVideoTimeRef.current) {
        const result = landmarker.detectForVideo(video, performance.now())
        lastVideoTimeRef.current = video.currentTime

        const landmarks = result.landmarks?.[0]

        if (landmarks) {
          setHandDetected(true)
          drawHand(landmarks)

          const detectedFingers = detectFingers(landmarks)
          setFingerState(detectedFingers)

          const gesture = detectGesture(detectedFingers)
          setCurrentGesture(gesture)
        } else {
          setHandDetected(false)
          clearCanvas()
          setFingerState({
            thumb: false,
            index: false,
            middle: false,
            ring: false,
            pinky: false,
          })
          setCurrentGesture(GESTURE_TYPES.UNKNOWN)
        }
      }
    } catch (detectionError) {
      console.error('Hand detection error:', detectionError)
    }

    animationFrameRef.current = requestAnimationFrame(detectFrame)
  }, [clearCanvas, drawHand])

  const loadCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(
        (device) => device.kind === 'videoinput'
      )
      setCameras(videoDevices)

      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId)
      }
    } catch (deviceError) {
      console.error('Could not list cameras:', deviceError)
    }
  }, [selectedCamera])

  const createLandmarker = useCallback(async () => {
    setStatus('Loading MediaPipe hand model...')
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH)

    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH },
      runningMode: 'VIDEO',
      numHands: 1,
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
      setHandDetected(false)

      try {
        setStatus('Requesting camera permission...')

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not available in this browser.')
        }

        const videoConstraints = cameraId
          ? {
              deviceId: { exact: cameraId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })

        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          throw new Error('Camera video element could not be found.')
        }

        video.srcObject = stream
        await video.play()

        resizeCanvas()
        setCameraRunning(true)

        try {
          if (!landmarkerRef.current) {
            landmarkerRef.current = await createLandmarker()
          }

          setStatus('Hand tracking is active')
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
          setStatus('Camera works, but MediaPipe failed')
          setError(`MediaPipe model error: ${modelError?.message || modelError}`)
        }
      } catch (cameraError) {
        console.error('Camera error:', cameraError)
        setLoading(false)
        setCameraRunning(false)
        setHandDetected(false)

        if (cameraError?.name === 'NotAllowedError') {
          setError('Camera permission was denied.')
          setStatus('Camera permission denied')
        } else {
          setError(cameraError?.message || 'Failed to start camera.')
          setStatus('Camera failed')
        }
      }
    },
    [
      cameraRunning,
      createLandmarker,
      detectFrame,
      loading,
      resizeCanvas,
      selectedCamera,
    ]
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

    clearCanvas()
    lastVideoTimeRef.current = -1
    setCameraRunning(false)
    setHandDetected(false)
    setFingerState({
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
    })
    setCurrentGesture(GESTURE_TYPES.UNKNOWN)
    setLoading(false)
    setStatus('Camera stopped')
  }, [clearCanvas])

  const handleCameraChange = async (event) => {
    const newCameraId = event.target.value
    setSelectedCamera(newCameraId)

    if (cameraRunning) {
      stopCamera()
      setTimeout(() => {
        startCamera(newCameraId)
      }, 150)
    }
  }

  useEffect(() => {
    const handleResize = () => resizeCanvas()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [resizeCanvas])

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
    }
  }, [])

  const extendedCount = Object.values(fingerState).filter(Boolean).length

  return (
    <main className="app">
      <section className="app-shell">
        <header className="header">
          <div>
            <span className="eyebrow">REAL-TIME COMPUTER VISION</span>
            <h1>Hand Animation AI</h1>
            <p className="subtitle">
              Step 4: Rule-based gesture recognition system.
            </p>
          </div>

          <div className={`status-pill ${cameraRunning ? 'status-live' : 'status-idle'}`}>
            <span className="status-dot" />
            {cameraRunning ? 'LIVE' : 'OFFLINE'}
          </div>
        </header>

        <section className="dashboard-grid">
          <div className="camera-card">
            <div className="camera-container">
              <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
              <canvas ref={canvasRef} className="hand-canvas" />

              {!cameraRunning && (
                <div className="camera-placeholder">
                  <div className="camera-icon">✋</div>
                  <h2>Camera is off</h2>
                  <p>Select a camera and start tracking.</p>
                </div>
              )}

              {cameraRunning && (
                <div className="tracking-indicator">
                  <span className={handDetected ? 'indicator-dot detected' : 'indicator-dot'} />
                  {handDetected ? '21 points detected' : 'Searching for hand...'}
                </div>
              )}
            </div>

            <div className="camera-settings">
              <label htmlFor="camera-select">Camera device</label>
              <select
                id="camera-select"
                value={selectedCamera}
                onChange={handleCameraChange}
                disabled={loading}
              >
                {cameras.length === 0 ? (
                  <option value="">No cameras detected</option>
                ) : (
                  cameras.map((camera, index) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Camera ${index + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="controls">
              <button
                className="primary-button"
                onClick={() => startCamera()}
                disabled={cameraRunning || loading}
              >
                {loading ? 'Starting...' : 'Start Camera'}
              </button>

              <button
                className="secondary-button"
                onClick={stopCamera}
                disabled={!cameraRunning && !loading}
              >
                Stop Camera
              </button>
            </div>
          </div>

          <aside className="sidebar-panels">
            <div className="gesture-panel">
              <span className="panel-label">CURRENT GESTURE</span>
              <div className={`gesture-badge ${currentGesture.id.toLowerCase()}`}>
                {currentGesture.name}
              </div>
            </div>

            <div className="debug-panel">
              <div className="panel-header">
                <h2>Finger Status</h2>
                <div className="extended-badge">
                  Extended: <strong>{extendedCount} / 5</strong>
                </div>
              </div>

              <ul className="finger-list">
                {[
                  { name: 'Thumb', key: 'thumb' },
                  { name: 'Index', key: 'index' },
                  { name: 'Middle', key: 'middle' },
                  { name: 'Ring', key: 'ring' },
                  { name: 'Pinky', key: 'pinky' },
                ].map(({ name, key }) => {
                  const isExtended = fingerState[key]
                  return (
                    <li key={key} className={`finger-row ${isExtended ? 'extended' : 'folded'}`}>
                      <span className="finger-name">{name}</span>
                      <span className="finger-badge">
                        {isExtended ? 'EXTENDED' : 'FOLDED'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </aside>
        </section>

        <section className="info-grid">
          <div className="info-card">
            <span className="card-label">STATUS</span>
            <strong>{status}</strong>
          </div>

          <div className="info-card">
            <span className="card-label">CAMERA</span>
            <strong>{cameras.length > 0 ? `${cameras.length} available` : 'None detected'}</strong>
          </div>

          <div className="info-card">
            <span className="card-label">LANDMARKS</span>
            <strong>{handDetected ? '21 / 21' : '0 / 21'}</strong>
          </div>
        </section>

        {error && (
          <section className="error-card">
            <div className="error-title">Something went wrong</div>
            <p>{error}</p>
          </section>
        )}
      </section>
    </main>
  )
}

export default App