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
}

contextBridge.exposeInMainWorld('api', api)
