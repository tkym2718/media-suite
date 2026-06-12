import { CheckCircle2, XCircle, Settings2 } from 'lucide-react'
import type { ToolsReport } from '../types'

interface ToolStatusBarProps {
  tools: ToolsReport | null
  onSetPath: (name: 'ffmpeg' | 'ffprobe' | 'yt-dlp') => void
  compact?: boolean
}

const LABELS: { key: 'ffmpeg' | 'ffprobe' | 'ytdlp'; name: 'ffmpeg' | 'ffprobe' | 'yt-dlp'; label: string }[] = [
  { key: 'ffmpeg', name: 'ffmpeg', label: 'FFmpeg' },
  { key: 'ffprobe', name: 'ffprobe', label: 'FFprobe' },
  { key: 'ytdlp', name: 'yt-dlp', label: 'yt-dlp' },
]

export function ToolStatusBar({ tools, onSetPath, compact }: ToolStatusBarProps) {
  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-wrap' : 'flex-wrap justify-center'}`}>
      {LABELS.map(({ key, name, label }) => {
        const status = tools?.[key]
        const ok = !!status?.available
        return (
          <button
            key={key}
            onClick={() => onSetPath(name)}
            title={ok ? status?.version || '' : `${label} が見つかりません。クリックして実行ファイルを指定`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
            }`}
          >
            {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {label}
            <Settings2 size={12} className="opacity-50" />
          </button>
        )
      })}
    </div>
  )
}
