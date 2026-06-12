import { useEffect, useRef, useState } from 'react'
import { Music, Film } from 'lucide-react'
import type { TaggedFile } from '../../types'

interface MediaThumbProps {
  file: TaggedFile
  onOpen?: (file: TaggedFile) => void
}

/**
 * Lazily renders a thumbnail only once it scrolls near the viewport. This keeps
 * the DOM and decode cost low when browsing very large folders (0.5TB).
 */
export function MediaThumb({ file, onOpen }: MediaThumbProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            obs.disconnect()
            break
          }
        }
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  return (
    <div
      ref={ref}
      className="relative w-full aspect-square overflow-hidden rounded-lg bg-zinc-800 cursor-zoom-in"
      onClick={() => onOpen?.(file)}
    >
      {!visible ? (
        <div className="absolute inset-0 animate-pulse bg-zinc-800" />
      ) : file.kind === 'image' ? (
        <img
          src={window.api.toMediaUrl(file.path)}
          alt={file.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : file.kind === 'video' ? (
        <>
          <video
            src={`${window.api.toMediaUrl(file.path)}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute bottom-1 right-1 rounded bg-black/60 p-1 text-white">
            <Film size={12} />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-900/40 to-purple-900/40 text-indigo-300">
          <Music size={32} />
        </div>
      )}
    </div>
  )
}
