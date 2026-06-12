/// <reference types="vite/client" />

import type {
  MediaFileRef,
  MediaKind,
  ProbeInfo,
  ToolsReport,
  ToolStatus,
  ClipOptions,
  ClipResult,
  DownloadOptions,
  DownloadProgress,
  DownloadLog,
  DownloadDone,
} from './types'

export interface MediaSuiteApi {
  toMediaUrl: (absPath: string) => string

  checkTools: () => Promise<ToolsReport>
  setToolPath: (name: string, filePath: string | null) => Promise<ToolStatus>
  getSettings: () => Promise<Record<string, unknown>>

  pickFiles: (kind: MediaKind) => Promise<MediaFileRef[]>
  pickFolder: (kind: MediaKind) => Promise<{ root: string | null; files: MediaFileRef[] }>
  pickBinary: () => Promise<string | null>
  saveAs: (
    defaultPath: string,
    filters?: { name: string; extensions: string[] }[],
  ) => Promise<string | null>
  showItemInFolder: (filePath: string) => Promise<void>

  probeInfo: (filePath: string) => Promise<ProbeInfo>
  probeCover: (filePath: string) => Promise<string | null>

  clip: (opts: ClipOptions) => Promise<ClipResult>

  download: (opts: DownloadOptions) => Promise<{ id: number; dir: string }>
  cancelDownload: (id: number) => Promise<boolean>
  onDownloadProgress: (cb: (p: DownloadProgress) => void) => () => void
  onDownloadLog: (cb: (p: DownloadLog) => void) => () => void
  onDownloadDone: (cb: (p: DownloadDone) => void) => () => void
}

declare global {
  interface Window {
    api: MediaSuiteApi
  }
}
