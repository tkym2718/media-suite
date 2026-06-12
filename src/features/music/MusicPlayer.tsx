import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FolderOpen,
  FilePlus2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  VolumeX,
  Rewind,
  FastForward,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import type { MediaFileRef, Track } from '../../types'
import { basenameNoExt, formatTime } from '../../lib/format'
import { SortableTrackItem } from './SortableTrackItem'
import { TopBar } from '../../components/TopBar'
import { Toggle } from '../../components/Toggle'
import { ClipPanel } from '../../components/ClipPanel'

type RepeatMode = 'none' | 'all' | 'one'

interface MusicPlayerProps {
  onHome: () => void
}

function makeTrack(ref: MediaFileRef): Track {
  return {
    id: `${ref.path}::${ref.mtimeMs}`,
    path: ref.path,
    name: ref.name,
    dir: ref.dir,
    mtimeMs: ref.mtimeMs,
    title: basenameNoExt(ref.name),
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    duration: 0,
    coverUrl: null,
  }
}

export function MusicPlayer({ onHome }: MusicPlayerProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none')
  const [isLoading, setIsLoading] = useState(false)
  const [clipMode, setClipMode] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const coverTried = useRef<Set<string>>(new Set())
  const enrichToken = useRef(0)

  const currentTrack =
    currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Load source when current track changes.
  useEffect(() => {
    const audio = audioRef.current
    if (audio && currentTrack) {
      audio.src = window.api.toMediaUrl(currentTrack.path)
      audio.volume = volume
      if (isPlaying) audio.play().catch((e) => console.error('Play failed', e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.path])

  // Lazily fetch cover art for the current track.
  useEffect(() => {
    if (!currentTrack || currentTrack.coverUrl || coverTried.current.has(currentTrack.path)) return
    coverTried.current.add(currentTrack.path)
    let cancelled = false
    window.api.probeCover(currentTrack.path).then((cover) => {
      if (cancelled || !cover) return
      setTracks((prev) => prev.map((t) => (t.path === currentTrack.path ? { ...t, coverUrl: cover } : t)))
    })
    return () => {
      cancelled = true
    }
  }, [currentTrack?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  const enrichMetadata = useCallback(async (list: Track[]) => {
    const token = ++enrichToken.current
    for (const t of list) {
      const info = await window.api.probeInfo(t.path)
      if (token !== enrichToken.current) return
      if (info.ok) {
        setTracks((prev) =>
          prev.map((x) =>
            x.path === t.path
              ? {
                  ...x,
                  title: info.title || x.title,
                  artist: info.artist || x.artist,
                  album: info.album || x.album,
                  duration: info.duration || x.duration,
                }
              : x,
          ),
        )
      }
    }
  }, [])

  const loadRefs = useCallback(
    (refs: MediaFileRef[]) => {
      if (refs.length === 0) return
      refs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      const next = refs.map(makeTrack)
      coverTried.current = new Set()
      setTracks(next)
      setCurrentIndex(0)
      setIsPlaying(false)
      void enrichMetadata(next)
    },
    [enrichMetadata],
  )

  const handlePickFolder = async () => {
    setIsLoading(true)
    try {
      const { files } = await window.api.pickFolder('audio')
      loadRefs(files)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePickFiles = async () => {
    setIsLoading(true)
    try {
      const files = await window.api.pickFiles('audio')
      loadRefs(files)
    } finally {
      setIsLoading(false)
    }
  }

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return
    if (audio.paused) {
      audio.play().catch((e) => console.error('Play failed', e))
      setIsPlaying(true)
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }, [currentTrack])

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      return
    }
    if (currentIndex < tracks.length - 1) setCurrentIndex(currentIndex + 1)
    else if (repeatMode === 'all') setCurrentIndex(0)
    else {
      setIsPlaying(false)
      setCurrentIndex(0)
    }
  }, [tracks.length, repeatMode, currentIndex])

  const handlePrev = () => {
    if (tracks.length === 0) return
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
    else if (repeatMode === 'all') setCurrentIndex(tracks.length - 1)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime)
      setDuration(audioRef.current.duration || 0)
    }
  }

  const seekTo = (val: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = val
      setProgress(val)
    }
  }

  const skip = (delta: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(
        0,
        Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + delta),
      )
    }
  }

  const handleVolumeChange = (val: number) => {
    setVolume(val)
    if (audioRef.current) audioRef.current.volume = val
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setTracks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        if (oldIndex === currentIndex) setCurrentIndex(newIndex)
        else if (oldIndex < currentIndex && newIndex >= currentIndex) setCurrentIndex(currentIndex - 1)
        else if (oldIndex > currentIndex && newIndex <= currentIndex) setCurrentIndex(currentIndex + 1)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none'))
  }

  // Spacebar toggles playback (works in clip mode where the button is hidden).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Music Player"
        subtitle={`${tracks.length} tracks`}
        onHome={onHome}
        accent="indigo"
        right={
          <Toggle checked={clipMode} onChange={setClipMode} label="クリップモード" />
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <audio
          ref={audioRef}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleNext}
          onLoadedMetadata={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Left: Playlist */}
        <div className="w-[60%] h-full flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
            <button
              onClick={handlePickFiles}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors disabled:opacity-50"
            >
              <FilePlus2 size={16} /> ファイル
            </button>
            <button
              onClick={handlePickFolder}
              disabled={isLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all shadow-sm ${
                isLoading
                  ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
              }`}
            >
              <FolderOpen size={16} />
              {isLoading ? '読み込み中...' : 'フォルダを選択'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tracks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                <FolderOpen size={64} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">音楽が読み込まれていません</p>
                <p className="text-sm mt-2">フォルダまたはファイルを選択してください。</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {tracks.map((track, i) => (
                    <SortableTrackItem
                      key={track.id}
                      track={track}
                      index={i}
                      isActive={i === currentIndex}
                      onPlay={() => {
                        setCurrentIndex(i)
                        setIsPlaying(true)
                        setTimeout(() => audioRef.current?.play(), 0)
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Right: Now playing / clip */}
        <div className="w-[40%] h-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 overflow-y-auto">
          <div className="w-full aspect-square max-w-[260px] rounded-3xl shadow-2xl overflow-hidden mb-6 bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
            {currentTrack?.coverUrl ? (
              <img src={currentTrack.coverUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="text-zinc-400 font-medium tracking-widest text-xl">NO ART</div>
            )}
          </div>

          <div className="text-center w-full px-2 mb-5">
            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 truncate" title={currentTrack?.title}>
              {currentTrack?.title || 'No Track'}
            </h2>
            <p className="text-sm text-indigo-500 truncate font-medium">{currentTrack?.artist}</p>
            <p className="text-xs text-zinc-500 truncate">{currentTrack?.album}</p>
          </div>

          {/* Scrub bar (always available, also used to find clip points) */}
          <div className="w-full max-w-[440px] mb-5">
            <div className="flex justify-between text-xs text-zinc-500 font-medium mb-1.5">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={progress}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer outline-none"
              style={{
                background: `linear-gradient(to right, #4f46e5 ${(progress / (duration || 1)) * 100}%, #e5e7eb 0)`,
              }}
            />
          </div>

          {clipMode ? (
            <ClipPanel
              inputPath={currentTrack?.path ?? null}
              type="audio"
              currentTime={progress}
              duration={duration}
              onSeek={seekTo}
              accent="indigo"
            />
          ) : (
            <>
              <div className="flex items-center justify-center gap-4 mb-6">
                <button onClick={() => skip(-10)} className="text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 p-2" title="-10s">
                  <Rewind size={20} />
                </button>
                <button onClick={handlePrev} className="p-3 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors">
                  <SkipBack size={24} fill="currentColor" />
                </button>
                <button
                  onClick={togglePlay}
                  className="p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-transform hover:scale-105 shadow-lg shadow-indigo-600/30"
                >
                  {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                </button>
                <button onClick={handleNext} className="p-3 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors">
                  <SkipForward size={24} fill="currentColor" />
                </button>
                <button onClick={() => skip(10)} className="text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 p-2" title="+10s">
                  <FastForward size={20} />
                </button>
              </div>

              <div className="w-full max-w-[440px] flex items-center justify-between gap-4 px-4 bg-white dark:bg-zinc-800 p-3 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700">
                <button
                  onClick={toggleRepeat}
                  className={`p-2.5 rounded-full transition-colors relative flex items-center justify-center ${
                    repeatMode !== 'none' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  <Repeat size={18} />
                  {repeatMode === 'one' && (
                    <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-indigo-100 text-indigo-700 w-4 h-4 rounded-full flex items-center justify-center">
                      1
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-3 flex-1 px-2">
                  <button onClick={() => handleVolumeChange(volume === 0 ? 1 : 0)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100">
                    {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-zinc-500"
                    style={{ background: `linear-gradient(to right, #71717a ${volume * 100}%, #e5e7eb 0)` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
