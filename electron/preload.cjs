'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Build a media:// URL the renderer can use as a <video>/<audio>/<img> src.
 * The main process maps it back to the absolute file on disk.
 */
function toMediaUrl(absPath) {
  return `media://m/${encodeURIComponent(absPath)}`
}

const api = {
  toMediaUrl,

  // Tools / settings
  checkTools: () => ipcRenderer.invoke('tools:check'),
  setToolPath: (name, filePath) => ipcRenderer.invoke('tools:setPath', { name, filePath }),
  getSettings: () => ipcRenderer.invoke('settings:get'),

  // Dialogs
  pickFiles: (kind) => ipcRenderer.invoke('dialog:pickFiles', { kind }),
  pickFolder: (kind) => ipcRenderer.invoke('dialog:pickFolder', { kind }),
  pickBinary: () => ipcRenderer.invoke('dialog:pickBinary'),
  saveAs: (defaultPath, filters) => ipcRenderer.invoke('dialog:saveAs', { defaultPath, filters }),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItem', { filePath }),

  // Probe
  probeInfo: (filePath) => ipcRenderer.invoke('probe:info', { filePath }),
  probeCover: (filePath) => ipcRenderer.invoke('probe:cover', { filePath }),

  // Clip
  clip: (opts) => ipcRenderer.invoke('ffmpeg:clip', opts),

  // yt-dlp
  download: (opts) => ipcRenderer.invoke('ytdlp:download', opts),
  cancelDownload: (id) => ipcRenderer.invoke('ytdlp:cancel', { id }),
  onDownloadProgress: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('ytdlp:progress', listener)
    return () => ipcRenderer.removeListener('ytdlp:progress', listener)
  },
  onDownloadLog: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('ytdlp:log', listener)
    return () => ipcRenderer.removeListener('ytdlp:log', listener)
  },
  onDownloadDone: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('ytdlp:done', listener)
    return () => ipcRenderer.removeListener('ytdlp:done', listener)
  },

  // Sorter (tagging)
  sorterPickRoot: () => ipcRenderer.invoke('sorter:pickRoot'),
  sorterScan: (root, scanId) => ipcRenderer.invoke('sorter:scan', { root, scanId }),
  onSorterScanProgress: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('sorter:scanProgress', listener)
    return () => ipcRenderer.removeListener('sorter:scanProgress', listener)
  },
  sorterLoadTags: (root) => ipcRenderer.invoke('sorter:loadTags', { root }),
  sorterSetFileTags: (root, rel, tags) =>
    ipcRenderer.invoke('sorter:setFileTags', { root, rel, tags }),
  sorterAddTag: (root, rels, tag) => ipcRenderer.invoke('sorter:addTag', { root, rels, tag }),
  sorterRemoveTag: (root, rels, tag) => ipcRenderer.invoke('sorter:removeTag', { root, rels, tag }),
  sorterCreateTag: (root, name) => ipcRenderer.invoke('sorter:createTag', { root, name }),
  sorterRenameTag: (root, oldName, newName) =>
    ipcRenderer.invoke('sorter:renameTag', { root, oldName, newName }),
  sorterDeleteTag: (root, name) => ipcRenderer.invoke('sorter:deleteTag', { root, name }),
  sorterSetPinned: (root, name, pinned) =>
    ipcRenderer.invoke('sorter:setPinned', { root, name, pinned }),
  sorterFlush: (root) => ipcRenderer.invoke('sorter:flush', { root }),
}

contextBridge.exposeInMainWorld('api', api)
