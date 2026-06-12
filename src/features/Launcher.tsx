import { Music, Film, Images, Tags } from 'lucide-react'
import type { Feature } from '../types'
import { useTools } from '../lib/useTools'
import { ToolStatusBar } from '../components/ToolStatusBar'

interface LauncherProps {
  onSelect: (feature: Feature) => void
}

const CARDS: {
  id: Feature
  title: string
  desc: string
  icon: typeof Music
  gradient: string
  ring: string
}[] = [
  {
    id: 'music',
    title: 'Music Player',
    desc: 'ローカル音楽の再生・プレイリスト・クリップ書き出し',
    icon: Music,
    gradient: 'from-indigo-500 to-purple-600',
    ring: 'hover:ring-indigo-400',
  },
  {
    id: 'video',
    title: 'Video Viewer',
    desc: '高機能プレイヤー・見どころ解析・クリップ/ダウンロード',
    icon: Film,
    gradient: 'from-rose-500 to-pink-600',
    ring: 'hover:ring-rose-400',
  },
  {
    id: 'image',
    title: 'Image Viewer',
    desc: 'フォルダ閲覧・ページング・スライドショー',
    icon: Images,
    gradient: 'from-amber-500 to-orange-600',
    ring: 'hover:ring-amber-400',
  },
  {
    id: 'sorter',
    title: '仕分け (Sorter)',
    desc: '複数タグ付け・AND/OR絞り込み・画像/動画/音声をまとめて管理',
    icon: Tags,
    gradient: 'from-emerald-500 to-teal-600',
    ring: 'hover:ring-emerald-400',
  },
]

export function Launcher({ onSelect }: LauncherProps) {
  const { tools, setPath } = useTools()

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-950 dark:to-zinc-900">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-rose-500 to-amber-500">
          Media Suite
        </h1>
        <p className="text-zinc-500 mt-2">使いたい機能を選択してください</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {CARDS.map(({ id, title, desc, icon: Icon, gradient, ring }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`group relative flex flex-col items-start text-left p-6 rounded-3xl bg-white dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 ring-2 ring-transparent ${ring} focus:outline-none`}
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${gradient} text-white shadow-lg mb-4 group-hover:scale-105 transition-transform`}
            >
              <Icon size={28} />
            </div>
            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">{title}</h2>
            <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">{desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-2">
        <p className="text-xs text-zinc-400">外部ツールの状態 (クリックで実行ファイルを指定)</p>
        <ToolStatusBar tools={tools} onSetPath={setPath} />
      </div>
    </div>
  )
}
