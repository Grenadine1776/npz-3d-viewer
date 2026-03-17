import { useEffect, useMemo, useRef, useState } from 'react'
import { parseNpz } from './npz.js'
import { createMotion, describeNpz, getFramePose, getTrajectoryPoints } from './smplMotion.js'
import { createViewer } from './viewer.js'

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2]

export default function App() {
  const stageRef = useRef(null)
  const viewerRef = useRef(null)
  const playbackRef = useRef(null)
  const anchorTimeRef = useRef(0)
  const anchorFrameRef = useRef(0)

  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('')
  const [motion, setMotion] = useState(null)
  const [arraySummary, setArraySummary] = useState([])
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    if (!stageRef.current) {
      return undefined
    }

    viewerRef.current = createViewer(stageRef.current)

    return () => {
      if (playbackRef.current !== null) {
        window.cancelAnimationFrame(playbackRef.current)
      }

      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!viewerRef.current) {
      return
    }

    if (!motion) {
      viewerRef.current.clear()
      return
    }

    const firstFrame = getFramePose(motion, 0)
    viewerRef.current.fitToPoints(firstFrame.positions)
    viewerRef.current.setTrajectory(getTrajectoryPoints(motion))
  }, [motion])

  useEffect(() => {
    if (!viewerRef.current || !motion) {
      return
    }

    viewerRef.current.setFrame(getFramePose(motion, currentFrame))
  }, [motion, currentFrame])

  useEffect(() => {
    if (!isPlaying || !motion) {
      return undefined
    }

    const step = (now) => {
      const elapsedSeconds = (now - anchorTimeRef.current) / 1000
      const nextFrame =
        (anchorFrameRef.current +
          Math.floor(elapsedSeconds * motion.fps * speed)) %
        motion.frameCount

      setCurrentFrame((previousFrame) =>
        previousFrame === nextFrame ? previousFrame : nextFrame,
      )
      playbackRef.current = window.requestAnimationFrame(step)
    }

    playbackRef.current = window.requestAnimationFrame(step)

    return () => {
      if (playbackRef.current !== null) {
        window.cancelAnimationFrame(playbackRef.current)
        playbackRef.current = null
      }
    }
  }, [isPlaying, motion, speed])

  const frameLabel = useMemo(() => {
    if (!motion) {
      return '0 / 0'
    }

    return `${currentFrame + 1} / ${motion.frameCount}`
  }, [currentFrame, motion])

  function syncPlaybackAnchor(frame) {
    anchorTimeRef.current = performance.now()
    anchorFrameRef.current = frame
  }

  function stopPlayback() {
    setIsPlaying(false)

    if (playbackRef.current !== null) {
      window.cancelAnimationFrame(playbackRef.current)
      playbackRef.current = null
    }
  }

  function resetMotionState(nextStatus = '') {
    stopPlayback()
    setMotion(null)
    setArraySummary([])
    setCurrentFrame(0)
    setFileName('')
    setStatus(nextStatus)
  }

  async function loadFile(file) {
    stopPlayback()
    setStatus('Loading')

    try {
      const buffer = await file.arrayBuffer()
      const npzData = await parseNpz(buffer)
      const nextMotion = createMotion(npzData)

      setFileName(file.name)
      setStatus(`${nextMotion.frameCount} frames`)
      setMotion(nextMotion)
      setArraySummary(describeNpz(npzData))
      setCurrentFrame(0)
      syncPlaybackAnchor(0)
    } catch (error) {
      resetMotionState(error instanceof Error ? error.message : 'Load failed')
    }
  }

  async function handleInputChange(event) {
    const file = event.target.files?.[0]
    if (file) {
      await loadFile(file)
    }
  }

  async function handleDrop(event) {
    event.preventDefault()
    const file = [...event.dataTransfer.files].find((candidate) =>
      candidate.name.toLowerCase().endsWith('.npz'),
    )

    if (file) {
      await loadFile(file)
    }
  }

  function handleFrameChange(event) {
    if (!motion) {
      return
    }

    const nextFrame = Number(event.target.value)
    setCurrentFrame(nextFrame)

    if (isPlaying) {
      syncPlaybackAnchor(nextFrame)
    }
  }

  function handlePlayToggle() {
    if (!motion) {
      return
    }

    if (isPlaying) {
      stopPlayback()
      return
    }

    syncPlaybackAnchor(currentFrame)
    setIsPlaying(true)
  }

  function handleSpeedChange(event) {
    const nextSpeed = Number(event.target.value)
    setSpeed(nextSpeed)

    if (isPlaying) {
      syncPlaybackAnchor(currentFrame)
    }
  }

  return (
    <div
      className="app-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <aside className="sidebar">
        <div className="title-row">
          <h1>NPZ Viewer</h1>
          <div className="subtle-text">SMPL-family motion</div>
          <div className="subtle-text">{fileName || ' '}</div>
        </div>

        <section className="panel controls-panel">
          <label className="file-button">
            <span>Open NPZ</span>
            <input type="file" accept=".npz" onChange={handleInputChange} />
          </label>

          <div className="meta-row">
            <span>{status || ' '}</span>
            <span>{motion ? `${motion.fps} fps` : ' '}</span>
          </div>

          <div className="control-grid">
            <button
              type="button"
              className="control-button"
              onClick={handlePlayToggle}
              disabled={!motion}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <select value={speed} onChange={handleSpeedChange} disabled={!motion}>
              {SPEED_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}x
                </option>
              ))}
            </select>
          </div>

          <input
            type="range"
            min="0"
            max={motion ? motion.frameCount - 1 : 0}
            step="1"
            value={currentFrame}
            onChange={handleFrameChange}
            disabled={!motion}
          />

          <div className="frame-row">
            <span>{frameLabel}</span>
          </div>
        </section>

        <section className="panel arrays-panel">
          <div className="section-label">Arrays</div>
          {arraySummary.length > 0 ? (
            <div className="array-list">
              {arraySummary.map((entry) => (
                <article key={entry.key} className="array-item">
                  <div className="array-top">
                    <span>{entry.key}</span>
                    <span>{entry.dtype}</span>
                  </div>
                  <div className="array-shape">[{entry.shape.join(', ')}]</div>
                  <pre className="array-preview">
                    {entry.preview
                      .map((value) =>
                        typeof value === 'number' ? value.toFixed(4) : String(value),
                      )
                      .join(', ')}
                  </pre>
                </article>
              ))}
            </div>
          ) : (
            <div className="subtle-text"> </div>
          )}
        </section>
      </aside>

      <main className="stage-panel">
        <div ref={stageRef} className="stage" />
      </main>
    </div>
  )
}
