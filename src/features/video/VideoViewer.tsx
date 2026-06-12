import { useCallback, useEffect, useRef, useState } from 'react'
import type { WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from 'react'
import {
  FolderOpen,
  FilePlus2,
  Play,
  Pause,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  Maximize,
  Download,
  ChevronLeft,
  ChevronRight,
  Gauge,
} from 'lucide-react'
import type { MediaFileRef } from '../../types'
import { formatTimeLong } from '../../lib/format'
import { TopBar } from '../../components/TopBar'
import { Toggle } from '../../components/Toggle'
import { ClipPanel } from '../../components/ClipPanel'
import { DownloadPanel } from './DownloadPanel'
import { useTools } from '../../lib/useTools'

const SKIP_TIME = 10
const WHEEL_COOLDOWN_MS = 700
const CONTROLS_TIMEOUT_MS = 3000
const SPEED_RATES = [1.0, 1.5, 2.0, 0.5, 0.75]
const LOUDNESS_SEGMENTS = 200

interface VideoViewerProps {
  onHome: () => void
}

export function VideoViewer({ onHome }: VideoViewerProps) {
  const { tools } = useTools()

  const [files, setFiles] = useState<MediaFileRef[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [clipMode, setClipMode] = useState(false)
  const [showDownload, setShowDownload] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const seekBarRef = useRef<HTMLInputElement | null>(null)

  // wheel cooldown guards
  const lastWheelRef = useRef(0)
  const loadingRef = useRef(false)

  // controls auto-hide
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // seek preview
  const previewVideoRef = useRef<HTMLVideoElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewWrapRef = useRef<HTMLDivElement | null>(null)
  const [previewTime, setPreviewTime] = useState(0)
  const [previewVisible, setPreviewVisible] = useState(false)
  const previewSeekTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // audio highlight
  const highlightCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loudnessRef = useRef<Float32Array | null>(null)
  const [draggingSeek, setDraggingSeek] = useState(false)
  const analyzeToken = useRef(0)

  const currentFile = currentIndex >= 0 ? files[currentIndex] : null

  // ----- create the off-DOM preview video element once -----
  useEffect(() => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'metadata'
    previewVideoRef.current = v
    const onSeeked = () => {
      const canvas = previewCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      try {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      } catch {
        /* not ready yet */
      }
    }
    v.addEventListener('seeked', onSeeked)
    return () => v.removeEventListener('seeked', onSeeked)
  }, [])

  const loadVideo = useCallback(
    (index: number) => {
      if (index < 0 || index >= files.length) return
      const file = files[index]
      const url = window.api.toMediaUrl(file.path)
      loadingRef.current = true
      setCurrentIndex(index)
      const video = videoRef.current
      if (video) {
        video.src = url
        video.playbackRate = speed
        video.play().catch(() => {})
      }
      if (previewVideoRef.current) previewVideoRef.current.src = url
      document.title = file.name
      analyzeLoudness(url)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, speed],
  )

  const next = useCallback(() => {
    if (files.length === 0) return
    loadVideo((currentIndex + 1) % files.length)
  }, [files.length, currentIndex, loadVideo])

  const prev = useCallback(() => {
    if (files.length === 0) return
    loadVideo((currentIndex - 1 + files.length) % files.length)
  }, [files.length, currentIndex, loadVideo])

  // ----- wheel navigation with cooldown + loading guard -----
  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (files.length === 0) return
      e.preventDefault()
      if (loadingRef.current) return // still loading current video
      const now = Date.now()
      if (now - lastWheelRef.current < WHEEL_COOLDOWN_MS) return
      lastWheelRef.current = now
      if (e.deltaY > 0) next()
      else prev()
    },
    [files.length, next, prev],
  )

  const loadRefs = (refs: MediaFileRef[]) => {
    if (refs.length === 0) return
    refs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    setFiles(refs)
    setCurrentIndex(-1)
    // load first after state set
    setTimeout(() => {
      setCurrentIndex(0)
      const url = window.api.toMediaUrl(refs[0].path)
      loadingRef.current = true
      const video = videoRef.current
      if (video) {
        video.src = url
        video.play().catch(() => {})
      }
      if (previewVideoRef.current) previewVideoRef.current.src = url
      document.title = refs[0].name
      analyzeLoudness(url)
    }, 0)
  }

  const handlePickFolder = async () => {
    const { files: refs } = await window.api.pickFolder('video')
    loadRefs(refs)
  }
  const handlePickFiles = async () => {
    const refs = await window.api.pickFiles('video')
    loadRefs(refs)
  }

  // ----- playback -----
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.src) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }, [])

  const skip = (delta: number) => {
    const video = videoRef.current
    if (video) video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta))
  }

  const seekTo = (t: number) => {
    const video = videoRef.current
    if (video) {
      video.currentTime = t
      setProgress(t)
    }
  }

  const cycleSpeed = () => {
    const idx = SPEED_RATES.indexOf(speed)
    const nextRate = SPEED_RATES[(idx + 1) % SPEED_RATES.length]
    setSpeed(nextRate)
    if (videoRef.current) videoRef.current.playbackRate = nextRate
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const changeVolume = (v: number) => {
    setVolume(v)
    const video = videoRef.current
    if (video) {
      video.volume = v
      video.muted = v === 0
      setMuted(v === 0)
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(() => {})
    else document.exitFullscreen()
  }

  // ----- controls auto hide -----
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current)
    controlsTimeout.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false)
    }, CONTROLS_TIMEOUT_MS)
  }, [])

  // ----- seek preview -----
  const handleSeekHover = (e: ReactMouseEvent) => {
    const video = videoRef.current
    const bar = seekBarRef.current
    if (!video || !video.duration || !bar) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const hoverTime = ratio * video.duration
    setPreviewTime(hoverTime)
    setPreviewVisible(true)
    if (previewWrapRef.current) {
      const w = previewWrapRef.current.offsetWidth
      const left = Math.max(0, Math.min(rect.width - w, e.clientX - rect.left - w / 2))
      previewWrapRef.current.style.left = `${left}px`
    }
    if (previewSeekTimeout.current) clearTimeout(previewSeekTimeout.current)
    previewSeekTimeout.current = setTimeout(() => {
      if (previewVideoRef.current) previewVideoRef.current.currentTime = hoverTime
    }, 80)
  }

  // ----- audio loudness highlight -----
  const analyzeLoudness = async (url: string) => {
    const token = ++analyzeToken.current
    loudnessRef.current = null
    try {
      const res = await fetch(url)
      const buf = await res.arrayBuffer()
      if (token !== analyzeToken.current) return
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      const audioBuffer = await ctx.decodeAudioData(buf)
      await ctx.close()
      if (token !== analyzeToken.current) return

      const total = audioBuffer.length
      const channels = audioBuffer.numberOfChannels
      const segSize = Math.max(1, Math.floor(total / LOUDNESS_SEGMENTS))
      const rms = new Float32Array(LOUDNESS_SEGMENTS)
      let maxRms = 0
      for (let seg = 0; seg < LOUDNESS_SEGMENTS; seg++) {
        const start = seg * segSize
        const end = Math.min(start + segSize, total)
        let sum = 0
        for (let ch = 0; ch < channels; ch++) {
          const data = audioBuffer.getChannelData(ch)
          for (let i = start; i < end; i++) sum += data[i] * data[i]
        }
        const val = Math.sqrt(sum / Math.max(1, (end - start) * channels))
        rms[seg] = val
        if (val > maxRms) maxRms = val
      }
      if (maxRms > 0) for (let i = 0; i < LOUDNESS_SEGMENTS; i++) rms[i] /= maxRms
      loudnessRef.current = rms
      drawHighlight()
    } catch {
      loudnessRef.current = null
    }
  }

  const drawHighlight = (withPlayhead = false) => {
    const canvas = highlightCanvasRef.current
    const data = loudnessRef.current
    if (!canvas || !data) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const barW = w / data.length
    ctx.clearRect(0, 0, w, h)
    for (let i = 0; i < data.length; i++) {
      const v = data[i]
      const hue = (1 - v) * 240
      const light = 20 + v * 35
      ctx.fillStyle = `hsl(${hue}, 90%, ${light}%)`
      const barH = Math.max(1, v * h)
      ctx.fillRect(i * barW, h - barH, barW + 0.5, barH)
    }
    if (withPlayhead && videoRef.current?.duration) {
      const x = (videoRef.current.currentTime / videoRef.current.duration) * w
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
  }

  // ----- keyboard shortcuts -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          skip(SKIP_TIME)
          break
        case 'ArrowLeft':
          skip(-SKIP_TIME)
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(Math.min(1, volume + 0.1))
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(Math.max(0, volume - 0.1))
          break
        case 'KeyM':
          toggleMute()
          break
        case 'KeyF':
          toggleFullscreen()
          break
        case 'KeyN':
          next()
          break
        case 'KeyP':
          prev()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, volume, next, prev])

  const hasVideos = files.length > 0

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Video Viewer"
        subtitle={hasVideos ? `${currentIndex + 1} / ${files.length} ・ ${currentFile?.name ?? ''}` : '動画が読み込まれていません'}
        onHome={onHome}
        accent="rose"
        right={
          <>
            <button
              onClick={handlePickFiles}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
            >
              <FilePlus2 size={15} /> ファイル
            </button>
            <button
              onClick={handlePickFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-rose-600 hover:bg-rose-700 text-white"
            >
              <FolderOpen size={15} /> フォルダ
            </button>
            <button
              onClick={() => setShowDownload(true)}
              title="yt-dlp でダウンロード"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
            >
              <Download size={15} /> DL
            </button>
            <Toggle checked={clipMode} onChange={setClipMode} label="クリップ" activeColor="bg-rose-600" />
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Video stage */}
        <div
          ref={containerRef}
          className="relative flex-1 bg-black flex items-center justify-center overflow-hidden"
          onWheel={handleWheel}
          onMouseMove={showControls}
        >
          {!hasVideos && (
            <div className="text-center text-zinc-500">
              <FolderOpen size={64} className="mx-auto mb-4 opacity-40" />
              <p className="text-lg">フォルダまたはファイルを選択してください</p>
            </div>
          )}

          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="max-w-full max-h-full outline-none cursor-pointer"
            onClick={togglePlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => {
              setIsPlaying(false)
              setControlsVisible(true)
            }}
            onEnded={next}
            onLoadedMetadata={() => {
              const v = videoRef.current
              if (v) {
                setDuration(v.duration || 0)
                v.volume = volume
              }
            }}
            onCanPlay={() => {
              loadingRef.current = false
            }}
            onError={() => {
              loadingRef.current = false
            }}
            onTimeUpdate={() => {
              const v = videoRef.current
              if (v) setProgress(v.currentTime)
            }}
          />

          {hasVideos && (
            <>
              <button
                onClick={prev}
                className="absolute left-0 top-0 h-full px-3 flex items-center text-white/70 hover:text-white bg-black/0 hover:bg-black/30 transition-colors"
              >
                <ChevronLeft size={40} />
              </button>
              <button
                onClick={next}
                className="absolute right-0 top-0 h-full px-3 flex items-center text-white/70 hover:text-white bg-black/0 hover:bg-black/30 transition-colors"
              >
                <ChevronRight size={40} />
              </button>
            </>
          )}

          {/* Controls bar */}
          <div
            className={`absolute bottom-0 left-0 right-0 px-5 py-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity ${
              controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* seek preview thumbnail */}
            {previewVisible && (
              <div
                ref={previewWrapRef}
                className="absolute bottom-24 flex flex-col items-center bg-black/85 border border-zinc-600 rounded p-1 pointer-events-none"
              >
                <canvas ref={previewCanvasRef} width={160} height={90} className="w-40 h-[90px]" />
                <span className="text-xs text-white mt-1">{formatTimeLong(previewTime)}</span>
              </div>
            )}

            {/* audio highlight (visible while dragging) */}
            <div className={`px-2 mb-1 ${draggingSeek ? 'block' : 'hidden'}`}>
              <canvas ref={highlightCanvasRef} className="w-full h-[30px] rounded block" />
            </div>

            <input
              ref={seekBarRef}
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={progress}
              onChange={(e) => seekTo(Number(e.target.value))}
              onMouseMove={handleSeekHover}
              onMouseLeave={() => setPreviewVisible(false)}
              onMouseDown={() => {
                setDraggingSeek(true)
                if (loudnessRef.current) requestAnimationFrame(() => drawHighlight(true))
              }}
              onMouseUp={() => setDraggingSeek(false)}
              className="w-full cursor-pointer accent-rose-500"
            />

            <div className="flex items-center gap-3 mt-2 text-white">
              {!clipMode && (
                <>
                  <button onClick={() => skip(-SKIP_TIME)} className="px-2 py-1 rounded hover:bg-white/20 text-sm" title="-10s">
                    <Rewind size={18} />
                  </button>
                  <button onClick={togglePlay} className="px-2 py-1 rounded hover:bg-white/20" title="再生/一時停止">
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button onClick={() => skip(SKIP_TIME)} className="px-2 py-1 rounded hover:bg-white/20 text-sm" title="+10s">
                    <FastForward size={18} />
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={toggleMute} className="px-1 hover:opacity-80">
                      {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={muted ? 0 : volume}
                      onChange={(e) => changeVolume(Number(e.target.value))}
                      className="w-20 cursor-pointer accent-white"
                    />
                  </div>
                </>
              )}

              <span className="text-sm font-mono">
                {formatTimeLong(progress)} / {formatTimeLong(duration)}
              </span>
              <div className="flex-1" />
              <button onClick={cycleSpeed} className="px-2 py-1 rounded hover:bg-white/20 text-sm flex items-center gap-1" title="再生速度">
                <Gauge size={16} /> {speed.toFixed(2)}x
              </button>
              <button onClick={toggleFullscreen} className="px-2 py-1 rounded hover:bg-white/20" title="フルスクリーン">
                <Maximize size={18} />
              </button>
            </div>
          </div>

          <DownloadPanel
            open={showDownload}
            onClose={() => setShowDownload(false)}
            ytdlpAvailable={!!tools?.ytdlp.available}
          />
        </div>

        {/* Clip side panel */}
        {clipMode && (
          <div className="w-[380px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5 overflow-y-auto flex flex-col items-center">
            <p className="text-sm text-zinc-500 mb-4 text-center">
              シークバーで位置を合わせ、開始(IN)と終了(OUT)を設定してクリップを書き出します。
            </p>
            <ClipPanel
              inputPath={currentFile?.path ?? null}
              type="video"
              currentTime={progress}
              duration={duration}
              onSeek={seekTo}
              accent="rose"
            />
          </div>
        )}
      </div>
    </div>
  )
}
