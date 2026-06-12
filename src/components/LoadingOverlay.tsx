import { Loader2 } from 'lucide-react'

interface LoadingOverlayProps {
  /** Title shown above the bar, e.g. "メディアを読み込み中". */
  title: string
  /** Number of items processed so far. */
  current: number
  /** Total items, or -1 when not yet known (renders an indeterminate bar). */
  total: number
  /** Optional secondary line, e.g. the current directory. */
  detail?: string
}

export function LoadingOverlay({ title, current, total, detail }: LoadingOverlayProps) {
  const known = total >= 0
  const pct = known && total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-6 rounded-2xl border border-zinc-700/60 bg-zinc-900/90 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Loader2 className="animate-spin text-emerald-400" size={22} />
          <div className="min-w-0">
            <p className="text-zinc-100 font-semibold leading-tight">{title}</p>
            <p className="text-xs text-zinc-400 tabular-nums">
              {known ? `${current.toLocaleString()} / ${total.toLocaleString()} 件` : `${current.toLocaleString()} 件をスキャン中…`}
            </p>
          </div>
          {known && (
            <span className="ml-auto text-emerald-400 font-bold tabular-nums text-lg">{pct}%</span>
          )}
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
          {known ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="indeterminate-bar h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" />
          )}
        </div>

        {detail && (
          <p className="mt-3 text-[11px] text-zinc-500 truncate" title={detail}>
            {detail}
          </p>
        )}
      </div>
    </div>
  )
}
