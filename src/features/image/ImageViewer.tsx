import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Play, Square, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MediaFileRef } from '../../types'
import { TopBar } from '../../components/TopBar'

interface ImageViewerProps {
  onHome: () => void
}

interface Page {
  start: number
  end: number
}

const IMAGES_PER_PAGE = 3

export function ImageViewer({ onHome }: ImageViewerProps) {
  const [orderedFiles, setOrderedFiles] = useState<MediaFileRef[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(3)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const slideshowTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalImages = orderedFiles.length

  const buildPages = useCallback((root: string | null, refs: MediaFileRef[]) => {
    // Group by directory.
    const folders = new Map<string, MediaFileRef[]>()
    for (const f of refs) {
      if (!folders.has(f.dir)) folders.set(f.dir, [])
      folders.get(f.dir)!.push(f)
    }
    // Sort files in each folder: newest first.
    for (const list of folders.values()) list.sort((a, b) => b.mtimeMs - a.mtimeMs)

    const rootDir = root ?? refs[0]?.dir ?? ''
    const subPaths = [...folders.keys()].filter((d) => d !== rootDir)
    // Sort subfolders by their newest file, descending.
    subPaths.sort((a, b) => (folders.get(b)![0]?.mtimeMs ?? 0) - (folders.get(a)![0]?.mtimeMs ?? 0))

    const orderedPaths = [...subPaths]
    if (folders.has(rootDir) && folders.get(rootDir)!.length > 0) orderedPaths.push(rootDir)

    const ordered: MediaFileRef[] = []
    const nextPages: Page[] = []
    for (const p of orderedPaths) {
      const list = folders.get(p)!
      const folderStart = ordered.length
      ordered.push(...list)
      const folderEnd = ordered.length
      for (let i = folderStart; i < folderEnd; i += IMAGES_PER_PAGE) {
        nextPages.push({ start: i, end: Math.min(i + IMAGES_PER_PAGE - 1, folderEnd - 1) })
      }
    }
    setOrderedFiles(ordered)
    setPages(nextPages)
    setPageIndex(0)
    if (ordered.length > 0) document.title = root ? root.split(/[\\/]/).pop() || 'Image Viewer' : 'Image Viewer'
  }, [])

  const handlePickFolder = async () => {
    const { root, files } = await window.api.pickFolder('image')
    buildPages(root, files)
  }

  const goNext = useCallback(() => {
    setPageIndex((i) => (pages.length === 0 ? 0 : (i + 1) % pages.length))
  }, [pages.length])

  const goPrev = useCallback(() => {
    setPageIndex((i) => (pages.length === 0 ? 0 : (i - 1 + pages.length) % pages.length))
  }, [pages.length])

  // slideshow
  useEffect(() => {
    if (playing && pages.length > 0) {
      slideshowTimer.current = setInterval(goNext, speed * 1000)
      return () => {
        if (slideshowTimer.current) clearInterval(slideshowTimer.current)
      }
    }
  }, [playing, speed, pages.length, goNext])

  // wheel + keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pages.length === 0) return
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages.length, goNext, goPrev])

  const jumpToImage = () => {
    if (totalImages === 0) return
    const input = window.prompt(`表示したい画像番号を入力してください (1 - ${totalImages})`)
    if (input == null) return
    const num = parseInt(input, 10)
    if (!isNaN(num) && num >= 1 && num <= totalImages) {
      const targetIdx = num - 1
      const newPage = pages.findIndex((p) => targetIdx >= p.start && targetIdx <= p.end)
      if (newPage !== -1) setPageIndex(newPage)
    }
  }

  const currentPage = pages[pageIndex]
  const counterText = useMemo(() => {
    if (pages.length === 0 || !currentPage) return '0 / 0'
    return `${currentPage.start + 1} / ${totalImages}`
  }, [pages.length, currentPage, totalImages])

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Image Viewer"
        subtitle={`${totalImages} images`}
        onHome={onHome}
        accent="amber"
        right={
          <>
            <button
              onClick={handlePickFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-amber-500 hover:bg-amber-600 text-white"
            >
              <FolderOpen size={15} /> フォルダを選択
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPlaying((p) => !p)}
                disabled={pages.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors disabled:opacity-40 ${
                  playing ? 'bg-rose-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                }`}
              >
                {playing ? <Square size={14} /> : <Play size={14} />}
                {playing ? 'STOP' : 'PLAY'}
              </button>
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="w-7 text-right tabular-nums">{speed}s</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-24 accent-amber-500 cursor-pointer"
                />
              </label>
            </div>
          </>
        }
      />

      <div
        ref={containerRef}
        className="flex-1 relative bg-zinc-900 overflow-hidden"
        onWheel={(e) => {
          if (pages.length === 0) return
          e.preventDefault()
          if (e.deltaY > 0) goNext()
          else goPrev()
        }}
      >
        {pages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <FolderOpen size={64} className="mx-auto mb-4 opacity-40" />
              <p>「フォルダを選択」から画像フォルダを選んでください。</p>
            </div>
          </div>
        ) : (
          <div className="h-full flex p-3 gap-2">
            {currentPage &&
              orderedFiles.slice(currentPage.start, currentPage.end + 1).map((file, i) => (
                <div
                  key={file.path}
                  className="flex-1 min-w-0 relative flex items-center justify-center group"
                >
                  <img
                    src={window.api.toMediaUrl(file.path)}
                    alt={`画像 ${currentPage.start + i + 1}`}
                    className="max-w-full max-h-full object-contain rounded-lg border-2 border-zinc-700 shadow-lg"
                  />
                  <div className="absolute bottom-3 left-3 right-3 bg-black/70 text-white text-xs text-center px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity truncate pointer-events-none">
                    {file.name}
                  </div>
                </div>
              ))}
          </div>
        )}

        {pages.length > 0 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-0 top-0 h-full px-2 flex items-center text-white/60 hover:text-white hover:bg-black/30 transition-colors"
            >
              <ChevronLeft size={36} />
            </button>
            <button
              onClick={goNext}
              className="absolute right-0 top-0 h-full px-2 flex items-center text-white/60 hover:text-white hover:bg-black/30 transition-colors"
            >
              <ChevronRight size={36} />
            </button>
            <button
              onClick={jumpToImage}
              title="番号でジャンプ"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/60 text-white text-sm font-semibold hover:bg-black/80 transition-colors tabular-nums"
            >
              {counterText}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
