import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface TopBarProps {
  title: string
  subtitle?: string
  onHome: () => void
  right?: ReactNode
  accent?: 'indigo' | 'rose' | 'amber' | 'emerald'
}

const ACCENTS: Record<string, string> = {
  indigo: 'from-indigo-500 to-purple-600',
  rose: 'from-rose-500 to-pink-600',
  amber: 'from-amber-500 to-orange-600',
  emerald: 'from-emerald-500 to-teal-600',
}

export function TopBar({ title, subtitle, onHome, right, accent = 'indigo' }: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onHome}
          title="ホームに戻る"
          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1
            className={`text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r ${ACCENTS[accent]} leading-tight`}
          >
            {title}
          </h1>
          {subtitle && <p className="text-xs text-zinc-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </header>
  )
}
