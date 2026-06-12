import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Play } from 'lucide-react'
import type { Track } from '../../types'

interface SortableTrackItemProps {
  track: Track
  index: number
  isActive: boolean
  onPlay: () => void
}

export function SortableTrackItem({ track, index, isActive, onPlay }: SortableTrackItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 mb-2 rounded-xl transition-colors ${
        isActive
          ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
          : 'bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
      } ${isDragging ? 'shadow-lg opacity-80' : 'shadow-sm'}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab hover:text-indigo-500 text-zinc-400 p-1 flex-shrink-0"
      >
        <GripVertical size={20} />
      </div>

      <div className="text-zinc-400 font-medium w-6 text-right text-sm">{index + 1}</div>

      <div className="flex-grow min-w-0 flex items-center gap-3">
        {track.coverUrl ? (
          <img src={track.coverUrl} className="w-10 h-10 rounded-md object-cover flex-shrink-0" alt="Cover" />
        ) : (
          <div className="w-10 h-10 rounded-md bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">IMG</span>
          </div>
        )}
        <div className="truncate">
          <div
            className={`font-semibold truncate ${
              isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-800 dark:text-zinc-200'
            }`}
          >
            {track.title}
          </div>
          <div className="text-xs text-zinc-500 truncate">
            {track.artist} • {track.album}
          </div>
        </div>
      </div>

      <button
        onClick={onPlay}
        className={`p-2 rounded-full flex-shrink-0 transition-colors ${
          isActive
            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400'
            : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200'
        }`}
      >
        <Play size={18} fill={isActive ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}
