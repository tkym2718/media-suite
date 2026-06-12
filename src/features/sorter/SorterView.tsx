import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  FolderOpen,
  Star,
  Trash2,
  Pencil,
  X,
  Plus,
  Image as ImageIcon,
  Film,
  Music,
  CheckSquare,
  Square,
  Clock,
  Flame,
} from 'lucide-react'
import type { MediaKind, TaggedFile, TagInfo, TagFilterMode } from '../../types'
import { TopBar } from '../../components/TopBar'
import { LoadingOverlay } from '../../components/LoadingOverlay'
import { MediaThumb } from './MediaThumb'

interface SorterViewProps {
  onHome: () => void
}

const PAGE_SIZE = 60
const LAST_ROOT_KEY = 'sorter:lastRoot'

interface ScanState {
  active: boolean
  scanned: number
  total: number
  currentDir?: string
}

const KIND_META: Record<MediaKind, { label: string; icon: typeof ImageIcon }> = {
  image: { label: '画像', icon: ImageIcon },
  video: { label: '動画', icon: Film },
  audio: { label: '音声', icon: Music },
}

// Small inline input with autocomplete suggestions from existing tags.
function AddTagInput({
  tags,
  onAdd,
  placeholder = 'タグを追加',
  autoFocus,
}: {
  tags: string[]
  onAdd: (name: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [value, setValue] = useState('')
  const listId = useRef(`taglist-${Math.random().toString(36).slice(2)}`)
  return (
    <>
      <input
        list={listId.current}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = value.trim()
            if (v) {
              onAdd(v)
              setValue('')
            }
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
      />
      <datalist id={listId.current}>
        {tags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  )
}

export function SorterView({ onHome }: SorterViewProps) {
  const [root, setRoot] = useState<string | null>(null)
  const [files, setFiles] = useState<TaggedFile[]>([])
  const [tags, setTags] = useState<TagInfo[]>([])
  const [scan, setScan] = useState<ScanState>({ active: false, scanned: 0, total: -1 })

  const [include, setInclude] = useState<Set<string>>(new Set())
  const [exclude, setExclude] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<TagFilterMode>('and')
  const [kinds, setKinds] = useState<Set<MediaKind>>(new Set())
  const [untaggedOnly, setUntaggedOnly] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagSearch, setTagSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [lightbox, setLightbox] = useState<TaggedFile | null>(null)

  const scanIdRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const hasLastRoot = typeof localStorage !== 'undefined' && !!localStorage.getItem(LAST_ROOT_KEY)

  const tagNames = useMemo(() => tags.map((t) => t.name).sort((a, b) => a.localeCompare(b)), [tags])

  // ---- Scanning ---------------------------------------------------------
  const runScan = useCallback(async (target: string) => {
    const id = ++scanIdRef.current
    setScan({ active: true, scanned: 0, total: -1 })
    setFiles([])
    setSelected(new Set())
    setRoot(target)

    const off = window.api.onSorterScanProgress((p) => {
      if (p.scanId !== id) return
      setScan({
        active: !p.done,
        scanned: p.scanned,
        total: p.total,
        currentDir: p.currentDir,
      })
    })

    try {
      const res = await window.api.sorterScan(target, id)
      if (scanIdRef.current !== id) return
      setFiles(res.files)
      setTags(res.tags)
      try {
        localStorage.setItem(LAST_ROOT_KEY, target)
      } catch {
        /* ignore */
      }
    } finally {
      off()
      setScan((s) => ({ ...s, active: false }))
    }
  }, [])

  const pickFolder = useCallback(async () => {
    const target = await window.api.sorterPickRoot()
    if (target) runScan(target)
  }, [runScan])

  const reloadLast = useCallback(() => {
    const last = localStorage.getItem(LAST_ROOT_KEY)
    if (last) runScan(last)
  }, [runScan])

  // ---- Filtering --------------------------------------------------------
  const filtered = useMemo(() => {
    const inc = [...include]
    const exc = exclude
    return files.filter((f) => {
      if (kinds.size > 0 && !kinds.has(f.kind)) return false
      if (untaggedOnly && f.tags.length > 0) return false
      if (exc.size > 0 && f.tags.some((t) => exc.has(t))) return false
      if (inc.length > 0) {
        if (mode === 'and') {
          if (!inc.every((t) => f.tags.includes(t))) return false
        } else {
          if (!inc.some((t) => f.tags.includes(t))) return false
        }
      }
      return true
    })
  }, [files, include, exclude, mode, kinds, untaggedOnly])

  // Reset window when the filtered set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [include, exclude, mode, kinds, untaggedOnly, files])

  // Infinite scroll sentinel.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))
        }
      },
      { rootMargin: '600px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [filtered.length])

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  // ---- Tag list ordering ------------------------------------------------
  const sidebarTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase()
    const list = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags
    return [...list].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name)
    })
  }, [tags, tagSearch])

  const pinnedTags = useMemo(() => tags.filter((t) => t.pinned).map((t) => t.name), [tags])
  const recentTags = useMemo(
    () =>
      [...tags]
        .filter((t) => t.lastUsed > 0)
        .sort((a, b) => b.lastUsed - a.lastUsed)
        .slice(0, 8)
        .map((t) => t.name),
    [tags],
  )
  const frequentTags = useMemo(
    () =>
      [...tags]
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((t) => t.name),
    [tags],
  )

  // ---- Local file mutation helpers --------------------------------------
  const mutateFiles = useCallback((rels: Set<string>, fn: (tags: string[]) => string[]) => {
    setFiles((prev) =>
      prev.map((f) => (rels.has(f.rel) ? { ...f, tags: fn(f.tags) } : f)),
    )
  }, [])

  // ---- Tag operations ---------------------------------------------------
  const applyTagToSelection = useCallback(
    async (name: string) => {
      if (!root || selected.size === 0) return
      const rels = [...selected]
      mutateFiles(selected, (t) => (t.includes(name) ? t : [...t, name]))
      const next = await window.api.sorterAddTag(root, rels, name)
      setTags(next)
    },
    [root, selected, mutateFiles],
  )

  const removeTagFromFile = useCallback(
    async (rel: string, name: string) => {
      if (!root) return
      mutateFiles(new Set([rel]), (t) => t.filter((x) => x !== name))
      const next = await window.api.sorterRemoveTag(root, [rel], name)
      setTags(next)
    },
    [root, mutateFiles],
  )

  const addTagToFile = useCallback(
    async (rel: string, name: string) => {
      if (!root) return
      mutateFiles(new Set([rel]), (t) => (t.includes(name) ? t : [...t, name]))
      const next = await window.api.sorterAddTag(root, [rel], name)
      setTags(next)
    },
    [root, mutateFiles],
  )

  const createTag = useCallback(
    async (name: string) => {
      if (!root) return
      const next = await window.api.sorterCreateTag(root, name)
      setTags(next)
    },
    [root],
  )

  const togglePin = useCallback(
    async (name: string, pinned: boolean) => {
      if (!root) return
      const next = await window.api.sorterSetPinned(root, name, pinned)
      setTags(next)
    },
    [root],
  )

  const renameTag = useCallback(
    async (name: string) => {
      if (!root) return
      const to = window.prompt(`「${name}」の新しい名前`, name)
      if (!to || to.trim() === name) return
      const next = await window.api.sorterRenameTag(root, name, to.trim())
      setTags(next)
      setFiles((prev) =>
        prev.map((f) =>
          f.tags.includes(name)
            ? { ...f, tags: [...new Set(f.tags.map((x) => (x === name ? to.trim() : x)))] }
            : f,
        ),
      )
      setInclude((s) => renameInSet(s, name, to.trim()))
      setExclude((s) => renameInSet(s, name, to.trim()))
    },
    [root],
  )

  const deleteTag = useCallback(
    async (name: string) => {
      if (!root) return
      if (!window.confirm(`タグ「${name}」を全ファイルから削除しますか？`)) return
      const next = await window.api.sorterDeleteTag(root, name)
      setTags(next)
      setFiles((prev) =>
        prev.map((f) => (f.tags.includes(name) ? { ...f, tags: f.tags.filter((x) => x !== name) } : f)),
      )
      setInclude((s) => removeFromSet(s, name))
      setExclude((s) => removeFromSet(s, name))
    },
    [root],
  )

  // ---- Filter toggles ---------------------------------------------------
  const toggleInclude = (name: string) =>
    setInclude((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else {
        n.add(name)
        setExclude((e) => removeFromSet(e, name))
      }
      return n
    })

  const toggleExclude = (name: string) =>
    setExclude((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else {
        n.add(name)
        setInclude((i) => removeFromSet(i, name))
      }
      return n
    })

  const clearFilters = () => {
    setInclude(new Set())
    setExclude(new Set())
    setKinds(new Set())
    setUntaggedOnly(false)
  }

  // ---- Selection --------------------------------------------------------
  const toggleSelect = (rel: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(rel)) n.delete(rel)
      else n.add(rel)
      return n
    })

  const selectAllVisible = () => setSelected(new Set(visible.map((f) => f.rel)))
  const clearSelection = () => setSelected(new Set())

  const filterCount = include.size + exclude.size + kinds.size + (untaggedOnly ? 1 : 0)

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="仕分け (Sorter)"
        subtitle={
          root
            ? `${root}  ·  ${filtered.length.toLocaleString()} / ${files.length.toLocaleString()} 件`
            : 'フォルダを選択してタグ付け'
        }
        onHome={onHome}
        accent="emerald"
        right={
          <>
            {hasLastRoot && !root && (
              <button
                onClick={reloadLast}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                <Clock size={15} /> 前回のフォルダ
              </button>
            )}
            <button
              onClick={pickFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <FolderOpen size={15} /> フォルダを選択
            </button>
          </>
        }
      />

      {/* Filter toolbar */}
      {root && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 text-sm">
          <div className="flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 p-0.5">
            {(['and', 'or'] as TagFilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-full text-xs font-semibold uppercase transition-colors ${
                  mode === m
                    ? 'bg-emerald-500 text-white'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {(Object.keys(KIND_META) as MediaKind[]).map((k) => {
              const Icon = KIND_META[k].icon
              const active = kinds.has(k)
              return (
                <button
                  key={k}
                  onClick={() =>
                    setKinds((s) => {
                      const n = new Set(s)
                      if (n.has(k)) n.delete(k)
                      else n.add(k)
                      return n
                    })
                  }
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
                    active
                      ? 'bg-emerald-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon size={13} /> {KIND_META[k].label}
                </button>
              )
            })}
            <button
              onClick={() => setUntaggedOnly((v) => !v)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                untaggedOnly
                  ? 'bg-amber-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              未タグのみ
            </button>
          </div>

          {/* active include/exclude chips */}
          <div className="flex flex-wrap items-center gap-1">
            {[...include].map((t) => (
              <span
                key={`i-${t}`}
                className="flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs"
              >
                {t}
                <button onClick={() => toggleInclude(t)}>
                  <X size={11} />
                </button>
              </span>
            ))}
            {[...exclude].map((t) => (
              <span
                key={`e-${t}`}
                className="flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-xs line-through"
              >
                {t}
                <button onClick={() => toggleExclude(t)}>
                  <X size={11} />
                </button>
              </span>
            ))}
            {filterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline"
              >
                クリア
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative bg-zinc-50 dark:bg-zinc-950">
        {scan.active && (
          <LoadingOverlay
            title="メディアを読み込み中"
            current={scan.scanned}
            total={scan.total}
            detail={scan.currentDir}
          />
        )}

        {!root ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <FolderOpen size={64} className="mx-auto mb-4 opacity-40" />
              <p>「フォルダを選択」からメディアフォルダを選んでタグ付けを始めましょう。</p>
              <p className="text-xs mt-2 text-zinc-400">
                タグは選択フォルダ直下の <code>.media-suite/tags.json</code> に保存されます。
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Sidebar: tags */}
            <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-white/70 dark:bg-zinc-900/50">
              <div className="p-3 space-y-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-1">
                  <AddTagInput tags={tagNames} onAdd={createTag} placeholder="＋ 新規タグを作成" />
                </div>
                <input
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="タグを検索"
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {sidebarTags.length === 0 && (
                  <p className="text-xs text-zinc-400 p-2">タグがありません。上の欄から作成できます。</p>
                )}
                {sidebarTags.map((t) => {
                  const inc = include.has(t.name)
                  const exc = exclude.has(t.name)
                  return (
                    <div
                      key={t.name}
                      className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                        inc
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : exc
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      <button
                        onClick={() => togglePin(t.name, !t.pinned)}
                        title={t.pinned ? 'ピン解除' : 'ピン留め'}
                        className={t.pinned ? 'text-amber-400' : 'text-zinc-400 hover:text-amber-400'}
                      >
                        <Star size={13} fill={t.pinned ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => toggleInclude(t.name)}
                        className="flex-1 min-w-0 text-left truncate"
                        title={`${t.name} (${t.count})`}
                      >
                        {t.name}
                      </button>
                      <span className="text-[10px] tabular-nums text-zinc-400">{t.count}</span>
                      <button
                        onClick={() => toggleExclude(t.name)}
                        title="除外"
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-500"
                      >
                        <X size={13} />
                      </button>
                      <button
                        onClick={() => renameTag(t.name)}
                        title="名前を変更"
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => deleteTag(t.name)}
                        title="削除"
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </aside>

            {/* Main: quick-apply bar + grid */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Quick-apply bar */}
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40">
                <button
                  onClick={selected.size === visible.length && visible.length > 0 ? clearSelection : selectAllVisible}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  {selected.size > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                  {selected.size > 0 ? `選択 ${selected.size} 件` : '選択なし'}
                </button>

                {selected.size > 0 ? (
                  <>
                    <div className="flex items-center gap-1 min-w-[160px]">
                      <AddTagInput
                        tags={tagNames}
                        onAdd={applyTagToSelection}
                        placeholder="選択にタグを付与"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {pinnedTags.length > 0 && (
                        <QuickRow icon={<Star size={11} />} names={pinnedTags} onPick={applyTagToSelection} />
                      )}
                      {recentTags.length > 0 && (
                        <QuickRow icon={<Clock size={11} />} names={recentTags} onPick={applyTagToSelection} />
                      )}
                      {frequentTags.length > 0 && (
                        <QuickRow icon={<Flame size={11} />} names={frequentTags} onPick={applyTagToSelection} />
                      )}
                    </div>
                    <button onClick={clearSelection} className="text-xs text-zinc-400 hover:text-zinc-600 underline ml-auto">
                      選択解除
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-zinc-400">
                    カード左上のチェックで選択 → まとめてタグ付与できます
                  </span>
                )}
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto p-3">
                {filtered.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                    条件に一致するメディアがありません。
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                      {visible.map((f) => {
                        const sel = selected.has(f.rel)
                        return (
                          <div
                            key={f.rel}
                            className={`group rounded-xl border bg-white dark:bg-zinc-900 p-2 transition-colors ${
                              sel
                                ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                                : 'border-zinc-200 dark:border-zinc-800'
                            }`}
                          >
                            <div className="relative">
                              <MediaThumb file={f} onOpen={setLightbox} />
                              <button
                                onClick={() => toggleSelect(f.rel)}
                                title="選択"
                                className={`absolute top-1.5 left-1.5 rounded-md p-0.5 ${
                                  sel ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white/90 hover:bg-black/70'
                                }`}
                              >
                                {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                              </button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-zinc-600 dark:text-zinc-300 truncate" title={f.name}>
                              {f.name}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {f.tags.map((t) => (
                                <span
                                  key={t}
                                  className="flex items-center gap-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 text-[10px]"
                                >
                                  {t}
                                  <button onClick={() => removeTagFromFile(f.rel, t)}>
                                    <X size={9} />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="mt-1 flex items-center gap-1">
                              <Plus size={11} className="text-zinc-400" />
                              <AddTagInput tags={tagNames} onAdd={(name) => addTagToFile(f.rel, name)} placeholder="タグ" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {visibleCount < filtered.length && (
                      <div ref={sentinelRef} className="h-16 flex items-center justify-center text-xs text-zinc-400">
                        さらに読み込み中… ({visibleCount.toLocaleString()} / {filtered.length.toLocaleString()})
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X size={28} />
          </button>
          {lightbox.kind === 'image' ? (
            <img src={window.api.toMediaUrl(lightbox.path)} alt={lightbox.name} className="max-h-full max-w-full object-contain" />
          ) : lightbox.kind === 'video' ? (
            <video
              src={window.api.toMediaUrl(lightbox.path)}
              controls
              autoPlay
              className="max-h-full max-w-full"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-4 text-white">
              <Music size={64} />
              <p className="text-sm">{lightbox.name}</p>
              <audio src={window.api.toMediaUrl(lightbox.path)} controls autoPlay />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compact row of quick-pick tag chips with a leading icon.
function QuickRow({
  icon,
  names,
  onPick,
}: {
  icon: ReactNode
  names: string[]
  onPick: (name: string) => void
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-zinc-400">{icon}</span>
      {names.map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-200 hover:bg-emerald-500 hover:text-white transition-colors"
        >
          {n}
        </button>
      ))}
    </span>
  )
}

function removeFromSet(s: Set<string>, name: string): Set<string> {
  if (!s.has(name)) return s
  const n = new Set(s)
  n.delete(name)
  return n
}

function renameInSet(s: Set<string>, from: string, to: string): Set<string> {
  if (!s.has(from)) return s
  const n = new Set(s)
  n.delete(from)
  n.add(to)
  return n
}
