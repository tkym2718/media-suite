export type Feature = 'home' | 'music' | 'video' | 'image' | 'sorter'

export type MediaKind = 'audio' | 'video' | 'image'

export interface MediaFileRef {
  path: string
  name: string
  dir: string
  mtimeMs: number
}

// ---------------------------------------------------------------------------
// Sorter (tagging) types
// ---------------------------------------------------------------------------

/** A media file enriched with its tags, used by the Sorter view. */
export interface TaggedFile {
  /** Absolute path on disk. */
  path: string
  /** Path relative to the scanned root (stable key used for storage). */
  rel: string
  name: string
  dir: string
  mtimeMs: number
  size: number
  kind: MediaKind
  tags: string[]
}

export interface TagInfo {
  name: string
  /** Number of files currently carrying this tag. */
  count: number
  /** Last time this tag was applied (ms epoch). */
  lastUsed: number
  /** Whether the user pinned this tag for quick access. */
  pinned?: boolean
}

export interface SorterScanProgress {
  scanId: number
  scanned: number
  /** -1 when the total is not yet known. */
  total: number
  done: boolean
  currentDir?: string
}

export interface SorterLoadResult {
  root: string
  files: TaggedFile[]
  tags: TagInfo[]
}

export type TagFilterMode = 'and' | 'or'

export interface ProbeInfo {
  ok: boolean
  error?: string
  duration?: number
  title?: string | null
  artist?: string | null
  album?: string | null
  width?: number | null
  height?: number | null
  hasAudio?: boolean
  hasVideo?: boolean
}

export interface Track {
  id: string
  path: string
  name: string
  dir: string
  mtimeMs: number
  title: string
  artist: string
  album: string
  duration: number
  coverUrl: string | null
}

export interface ToolStatus {
  name: string
  available: boolean
  path: string
  version: string | null
}

export interface ToolsReport {
  ffmpeg: ToolStatus
  ffprobe: ToolStatus
  ytdlp: ToolStatus
}

export type ClipMode = 'copy' | 'encode'

export interface ClipOptions {
  input: string
  start: number
  end: number
  type: 'audio' | 'video'
  mode: ClipMode
  outPath?: string
}

export interface ClipResult {
  ok: boolean
  outPath?: string
  error?: string
}

export interface DownloadOptions {
  url: string
  outDir?: string
  audioOnly?: boolean
  audioFormat?: string
}

export interface DownloadProgress {
  id: number
  percent: number
  line: string
}

export interface DownloadLog {
  id: number
  line: string
}

export interface DownloadDone {
  id: number
  ok: boolean
  code?: number
  error?: string
  outPath?: string | null
  dir?: string
}
