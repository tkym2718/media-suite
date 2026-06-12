import { useEffect, useRef, useState } from 'react'
import { Download, X, Loader2, FolderOpen, StopCircle, Music2, Video as VideoIcon } from 'lucide-react'

interface DownloadPanelProps {
  open: boolean
  onClose: () => void
  ytdlpAvailable: boolean
}

interface JobState {
  id: number | null
  running: boolean
  percent: number
  log: string[]
  done: { ok: boolean; outPath?: string | null; dir?: string; error?: string } | null
}

const initialJob: JobState = { id: null, running: false, percent: 0, log: [], done: null }

export function DownloadPanel({ open, onClose, ytdlpAvailable }: DownloadPanelProps) {
  const [url, setUrl] = useState('')
  const [audioOnly, setAudioOnly] = useState(false)
  const [audioFormat, setAudioFormat] = useState('mp3')
  const [job, setJob] = useState<JobState>(initialJob)
  const jobIdRef = useRef<number | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const offProgress = window.api.onDownloadProgress((p) => {
      if (p.id !== jobIdRef.current) return
      setJob((j) => ({ ...j, percent: p.percent }))
    })
    const offLog = window.api.onDownloadLog((p) => {
      if (p.id !== jobIdRef.current) return
      setJob((j) => ({ ...j, log: [...j.log.slice(-200), p.line] }))
    })
    const offDone = window.api.onDownloadDone((p) => {
      if (p.id !== jobIdRef.current) return
      setJob((j) => ({ ...j, running: false, done: p, percent: p.ok ? 100 : j.percent }))
    })
    return () => {
      offProgress()
      offLog()
      offDone()
    }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [job.log])

  const start = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setJob({ ...initialJob, running: true })
    const { id } = await window.api.download({ url: trimmed, audioOnly, audioFormat })
    jobIdRef.current = id
    setJob((j) => ({ ...j, id }))
  }

  const cancel = async () => {
    if (jobIdRef.current != null) {
      await window.api.cancelDownload(jobIdRef.current)
      setJob((j) => ({ ...j, running: false }))
    }
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 font-bold text-zinc-800 dark:text-zinc-100">
            <Download size={18} className="text-rose-500" /> 動画をダウンロード (yt-dlp)
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!ytdlpAvailable && (
            <div className="text-xs rounded-lg p-2.5 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
              yt-dlp が見つかりません。ホーム画面の外部ツール設定で実行ファイルを指定してください。
            </div>
          )}

          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="動画の URL を貼り付け"
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAudioOnly(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                !audioOnly ? 'bg-rose-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <VideoIcon size={16} /> 動画 (mp4)
            </button>
            <button
              onClick={() => setAudioOnly(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                audioOnly ? 'bg-rose-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <Music2 size={16} /> 音声のみ
            </button>
          </div>

          {audioOnly && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500">形式:</span>
              {['mp3', 'm4a', 'flac', 'wav'].map((f) => (
                <button
                  key={f}
                  onClick={() => setAudioFormat(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs ${
                    audioFormat === f ? 'bg-rose-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {(job.running || job.done) && (
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${job.percent}%` }}
                />
              </div>
              <div
                ref={logRef}
                className="h-28 overflow-y-auto rounded-lg bg-zinc-900 text-zinc-300 text-[11px] font-mono p-2 leading-relaxed"
              >
                {job.log.map((l, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {l}
                  </div>
                ))}
              </div>
              {job.done && (
                <div
                  className={`text-xs rounded-lg p-2.5 flex items-center justify-between gap-2 ${
                    job.done.ok
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                  }`}
                >
                  <span className="truncate">
                    {job.done.ok ? '完了しました。' : `失敗: ${job.done.error || 'エラー'}`}
                  </span>
                  {job.done.ok && (job.done.outPath || job.done.dir) && (
                    <button
                      onClick={() => window.api.showItemInFolder(job.done!.outPath || job.done!.dir!)}
                      className="flex items-center gap-1 shrink-0 font-medium hover:underline"
                    >
                      <FolderOpen size={14} /> 開く
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {job.running ? (
              <button
                onClick={cancel}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600"
              >
                <StopCircle size={18} /> キャンセル
              </button>
            ) : (
              <button
                onClick={start}
                disabled={!url.trim() || !ytdlpAvailable}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-white transition-all ${
                  url.trim() && ytdlpAvailable ? 'bg-rose-600 hover:bg-rose-700 active:scale-[0.98]' : 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed'
                }`}
              >
                {job.running ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                ダウンロード開始
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
