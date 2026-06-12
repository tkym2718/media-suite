import { useState } from 'react'
import type { ReactNode } from 'react'
import { Scissors, MapPin, FlagTriangleRight, FolderOpen, Loader2, RotateCcw } from 'lucide-react'
import { formatTimeLong } from '../lib/format'
import type { ClipMode } from '../types'

interface ClipPanelProps {
  inputPath: string | null
  type: 'audio' | 'video'
  currentTime: number
  duration: number
  onSeek: (t: number) => void
  accent?: 'indigo' | 'rose'
}

/**
 * Shared clip UI for the Music Player and Video Viewer.
 * The user marks an IN (start) and OUT (end) point, then encodes a brand new
 * file via native ffmpeg in the Electron main process.
 */
export function ClipPanel({
  inputPath,
  type,
  currentTime,
  duration,
  onSeek,
  accent = 'indigo',
}: ClipPanelProps) {
  const [start, setStart] = useState<number | null>(null)
  const [end, setEnd] = useState<number | null>(null)
  const [mode, setMode] = useState<ClipMode>('encode')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string; path?: string } | null>(
    null,
  )

  const accentBg = accent === 'rose' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
  const accentText = accent === 'rose' ? 'text-rose-500' : 'text-indigo-500'
  const accentRing = accent === 'rose' ? 'focus:ring-rose-500' : 'focus:ring-indigo-500'

  const canClip =
    inputPath != null && start != null && end != null && end > start && !busy

  const reset = () => {
    setStart(null)
    setEnd(null)
    setMessage(null)
  }

  const nudge = (which: 'start' | 'end', delta: number) => {
    if (which === 'start' && start != null) {
      setStart(Math.max(0, Math.min(duration, start + delta)))
    } else if (which === 'end' && end != null) {
      setEnd(Math.max(0, Math.min(duration, end + delta)))
    }
  }

  const doClip = async () => {
    if (!canClip || inputPath == null || start == null || end == null) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await window.api.clip({ input: inputPath, start, end, type, mode })
      if (res.ok) {
        setMessage({ kind: 'ok', text: '書き出しが完了しました。', path: res.outPath })
      } else {
        setMessage({ kind: 'err', text: res.error || '書き出しに失敗しました。' })
      }
    } catch (e) {
      setMessage({ kind: 'err', text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-[440px] rounded-2xl bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Scissors size={18} className={accentText} />
        <h3 className="font-semibold text-zinc-800 dark:text-zinc-100">クリップ作成</h3>
      </div>

      {/* IN / OUT markers */}
      <div className="grid grid-cols-2 gap-3">
        <MarkerCell
          label="開始 (IN)"
          icon={<MapPin size={14} />}
          value={start}
          duration={duration}
          onSet={() => setStart(currentTime)}
          onSeek={onSeek}
          onNudge={(d) => nudge('start', d)}
          accentText={accentText}
        />
        <MarkerCell
          label="終了 (OUT)"
          icon={<FlagTriangleRight size={14} />}
          value={end}
          duration={duration}
          onSet={() => setEnd(currentTime)}
          onSeek={onSeek}
          onNudge={(d) => nudge('end', d)}
          accentText={accentText}
        />
      </div>

      {start != null && end != null && end > start && (
        <p className="text-xs text-zinc-500 text-center">
          クリップ長: <span className="font-semibold">{formatTimeLong(end - start)}</span>
        </p>
      )}

      {/* Encode mode */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-zinc-500">出力:</span>
        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <button
            onClick={() => setMode('encode')}
            className={`px-3 py-1.5 transition-colors ${
              mode === 'encode'
                ? `${accentBg} text-white`
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'
            }`}
          >
            エンコード (正確)
          </button>
          <button
            onClick={() => setMode('copy')}
            className={`px-3 py-1.5 transition-colors ${
              mode === 'copy'
                ? `${accentBg} text-white`
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'
            }`}
          >
            コピー (高速)
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={doClip}
          disabled={!canClip}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-white transition-all ${accentRing} focus:outline-none focus:ring-2 ${
            canClip ? `${accentBg} active:scale-[0.98] shadow-sm` : 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed'
          }`}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Scissors size={18} />}
          {busy ? '書き出し中...' : 'クリップを書き出す'}
        </button>
        <button
          onClick={reset}
          disabled={busy}
          title="リセット"
          className="p-2.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {message && (
        <div
          className={`text-xs rounded-lg p-2.5 flex items-center justify-between gap-2 ${
            message.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
          }`}
        >
          <span className="truncate" title={message.path || message.text}>
            {message.kind === 'ok' && message.path ? message.path : message.text}
          </span>
          {message.kind === 'ok' && message.path && (
            <button
              onClick={() => window.api.showItemInFolder(message.path!)}
              className="flex items-center gap-1 shrink-0 font-medium hover:underline"
            >
              <FolderOpen size={14} /> 開く
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface MarkerCellProps {
  label: string
  icon: ReactNode
  value: number | null
  duration: number
  onSet: () => void
  onSeek: (t: number) => void
  onNudge: (delta: number) => void
  accentText: string
}

function MarkerCell({ label, icon, value, duration, onSet, onSeek, onNudge, accentText }: MarkerCellProps) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-400 font-semibold">{label}</span>
        <span className={`font-mono text-sm ${value != null ? accentText : 'text-zinc-300 dark:text-zinc-600'}`}>
          {value != null ? formatTimeLong(value) : '--:--'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onSet}
          className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 transition-colors"
        >
          {icon} ここに設定
        </button>
        <button
          onClick={() => value != null && onSeek(value)}
          disabled={value == null}
          title="この位置へ移動"
          className="px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 transition-colors"
        >
          ▶
        </button>
      </div>
      <div className="flex items-center justify-center gap-1">
        <NudgeBtn onClick={() => onNudge(-1)} disabled={value == null} label="-1s" />
        <NudgeBtn onClick={() => onNudge(-0.1)} disabled={value == null} label="-0.1" />
        <NudgeBtn onClick={() => onNudge(0.1)} disabled={value == null} label="+0.1" />
        <NudgeBtn onClick={() => onNudge(1)} disabled={value == null} label="+1s" />
      </div>
      <input
        type="range"
        min={0}
        max={duration || 100}
        step={0.05}
        value={value ?? 0}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={value == null}
        className="w-full h-1 accent-zinc-500 cursor-pointer disabled:opacity-40"
      />
    </div>
  )
}

function NudgeBtn({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-1.5 py-1 rounded text-[10px] font-mono text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-30 transition-colors"
    >
      {label}
    </button>
  )
}
