'use strict'

const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const { spawn, execFile } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const tagStore = require('./tagStore.cjs')

const isDev = process.env.NODE_ENV === 'development'
const DEV_URL = 'http://127.0.0.1:5173'

// ---------------------------------------------------------------------------
// Persistent settings (tool overrides, last output dir, ...)
// ---------------------------------------------------------------------------
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(next) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to persist settings', e)
  }
}

let settings = {}

// ---------------------------------------------------------------------------
// Native binary resolution (ffmpeg / ffprobe / yt-dlp)
// ---------------------------------------------------------------------------
const WIN = process.platform === 'win32'
const EXE = WIN ? '.exe' : ''

const COMMON_DIRS = ['/usr/local/bin', '/usr/bin', '/opt/homebrew/bin', '/opt/local/bin']

// Build a realistic list of common Windows install locations.
function commonWindowsDirs() {
  const dirs = []
  const pf = process.env['ProgramFiles']
  const pf86 = process.env['ProgramFiles(x86)']
  const localApp = process.env['LOCALAPPDATA']
  const userProfile = process.env['USERPROFILE']
  const candidates = [
    'C:\\ffmpeg\\bin',
    'C:\\Program Files\\ffmpeg\\bin',
    pf && path.join(pf, 'ffmpeg', 'bin'),
    pf86 && path.join(pf86, 'ffmpeg', 'bin'),
    localApp && path.join(localApp, 'Microsoft', 'WinGet', 'Links'),
    localApp && path.join(localApp, 'Programs', 'Python', 'Scripts'),
    userProfile && path.join(userProfile, 'scoop', 'shims'),
    userProfile && path.join(userProfile, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links'),
    'C:\\ProgramData\\chocolatey\\bin',
  ].filter(Boolean)
  for (const c of candidates) dirs.push(c)
  return dirs
}

const binCache = {}

/**
 * Resolve the absolute path (or bare command) for a native tool.
 * Order: explicit setting -> PATH (bare command) -> common install dirs.
 * Returns null if nothing is found.
 */
function resolveBin(name) {
  if (binCache[name] !== undefined) return binCache[name]

  const override = settings.toolPaths && settings.toolPaths[name]
  if (override && fs.existsSync(override)) {
    binCache[name] = override
    return override
  }

  // Search common directories for an explicit file we can verify exists.
  const dirs = WIN ? commonWindowsDirs() : COMMON_DIRS
  for (const dir of dirs) {
    const full = path.join(dir, name + EXE)
    if (fs.existsSync(full)) {
      binCache[name] = full
      return full
    }
  }

  // Fall back to the bare command name and rely on PATH at spawn time.
  binCache[name] = name
  return name
}

function clearBinCache() {
  for (const k of Object.keys(binCache)) delete binCache[k]
}

function getToolVersion(name) {
  return new Promise((resolve) => {
    const bin = resolveBin(name)
    const arg = name === 'yt-dlp' ? '--version' : '-version'
    execFile(bin, [arg], { windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve({ name, available: false, path: bin, version: null })
        return
      }
      const firstLine = String(stdout).split(/\r?\n/)[0].trim()
      resolve({ name, available: true, path: bin, version: firstLine })
    })
  })
}

// ---------------------------------------------------------------------------
// Custom protocol so the renderer can load arbitrary local files securely.
// Usage from renderer: media://m/<encodeURIComponent(absolutePath)>
// ---------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])

function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url)
      // pathname looks like "/<encoded absolute path>"
      const encoded = url.pathname.replace(/^\/+/, '')
      const filePath = decodeURIComponent(encoded)
      return await net.fetch(pathToFileURL(filePath).href, {
        headers: request.headers,
        method: request.method,
      })
    } catch (e) {
      console.error('media protocol error', e)
      return new Response('Not found', { status: 404 })
    }
  })
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    title: 'Media Suite',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------
const MEDIA_EXTS = {
  audio: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wma'],
  video: ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.ts'],
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'],
}

// Reverse lookup: extension -> media kind ('audio' | 'video' | 'image').
const EXT_TO_KIND = (() => {
  const map = new Map()
  for (const [kind, exts] of Object.entries(MEDIA_EXTS)) {
    for (const e of exts) map.set(e, kind)
  }
  return map
})()

function kindForExt(ext) {
  return EXT_TO_KIND.get(ext.toLowerCase()) || null
}

async function walkDir(dir, exts, out, depth) {
  if (depth > 12) return
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(full, exts, out, depth + 1)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (exts.includes(ext)) {
        let mtimeMs = 0
        try {
          mtimeMs = (await fsp.stat(full)).mtimeMs
        } catch {
          /* ignore */
        }
        out.push({ path: full, name: entry.name, dir, mtimeMs })
      }
    }
  }
}

function uniqueOutPath(desired) {
  if (!fs.existsSync(desired)) return desired
  const ext = path.extname(desired)
  const base = desired.slice(0, -ext.length)
  let i = 1
  let candidate
  do {
    candidate = `${base} (${i})${ext}`
    i += 1
  } while (fs.existsSync(candidate))
  return candidate
}

// ---------------------------------------------------------------------------
// IPC: settings & tools
// ---------------------------------------------------------------------------
ipcMain.handle('tools:check', async () => {
  const [ffmpeg, ffprobe, ytdlp] = await Promise.all([
    getToolVersion('ffmpeg'),
    getToolVersion('ffprobe'),
    getToolVersion('yt-dlp'),
  ])
  return { ffmpeg, ffprobe, ytdlp }
})

ipcMain.handle('tools:setPath', async (_e, { name, filePath }) => {
  settings.toolPaths = settings.toolPaths || {}
  if (filePath) settings.toolPaths[name] = filePath
  else delete settings.toolPaths[name]
  writeSettings(settings)
  clearBinCache()
  return getToolVersion(name)
})

ipcMain.handle('settings:get', async () => settings)

// ---------------------------------------------------------------------------
// IPC: dialogs
// ---------------------------------------------------------------------------
ipcMain.handle('dialog:pickFiles', async (_e, { kind }) => {
  const exts = (MEDIA_EXTS[kind] || []).map((e) => e.slice(1))
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'ファイルを選択',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: kind, extensions: exts }],
  })
  if (result.canceled) return []
  const files = []
  for (const p of result.filePaths) {
    let mtimeMs = 0
    try {
      mtimeMs = (await fsp.stat(p)).mtimeMs
    } catch {
      /* ignore */
    }
    files.push({ path: p, name: path.basename(p), dir: path.dirname(p), mtimeMs })
  }
  return files
})

ipcMain.handle('dialog:pickFolder', async (_e, { kind }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'フォルダを選択',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return { root: null, files: [] }
  const root = result.filePaths[0]
  const exts = MEDIA_EXTS[kind] || []
  const out = []
  await walkDir(root, exts, out, 0)
  return { root, files: out }
})

ipcMain.handle('dialog:pickBinary', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '実行ファイルを選択',
    properties: ['openFile'],
    filters: WIN ? [{ name: 'Executable', extensions: ['exe'] }] : [],
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:saveAs', async (_e, { defaultPath, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存先を選択',
    defaultPath,
    filters,
  })
  if (result.canceled) return null
  return result.filePath
})

ipcMain.handle('shell:showItem', async (_e, { filePath }) => {
  shell.showItemInFolder(filePath)
})

// ---------------------------------------------------------------------------
// IPC: ffprobe (metadata + duration)
// ---------------------------------------------------------------------------
ipcMain.handle('probe:info', async (_e, { filePath }) => {
  const bin = resolveBin('ffprobe')
  return new Promise((resolve) => {
    execFile(
      bin,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 16 },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: String(err.message || err) })
          return
        }
        try {
          const data = JSON.parse(stdout)
          const tags = (data.format && data.format.tags) || {}
          const audio = (data.streams || []).find((s) => s.codec_type === 'audio')
          const video = (data.streams || []).find((s) => s.codec_type === 'video')
          resolve({
            ok: true,
            duration: data.format ? parseFloat(data.format.duration) || 0 : 0,
            title: tags.title || tags.TITLE || null,
            artist: tags.artist || tags.ARTIST || null,
            album: tags.album || tags.ALBUM || null,
            width: video ? video.width : null,
            height: video ? video.height : null,
            hasAudio: !!audio,
            hasVideo: !!video,
          })
        } catch (e) {
          resolve({ ok: false, error: String(e) })
        }
      },
    )
  })
})

// Extract embedded cover art to a data URL (lazy, on demand).
ipcMain.handle('probe:cover', async (_e, { filePath }) => {
  const bin = resolveBin('ffmpeg')
  const tmp = path.join(os.tmpdir(), `mscover-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-v', 'quiet', '-y', '-i', filePath, '-an', '-vcodec', 'mjpeg', '-frames:v', '1', tmp],
      { windowsHide: true },
      async (err) => {
        if (err) {
          resolve(null)
          return
        }
        try {
          const buf = await fsp.readFile(tmp)
          await fsp.unlink(tmp).catch(() => {})
          if (!buf || buf.length === 0) {
            resolve(null)
            return
          }
          resolve(`data:image/jpeg;base64,${buf.toString('base64')}`)
        } catch {
          resolve(null)
        }
      },
    )
  })
})

// ---------------------------------------------------------------------------
// IPC: ffmpeg clip (audio + video)
// ---------------------------------------------------------------------------
function runFfmpeg(args) {
  const bin = resolveBin('ffmpeg')
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (e) => resolve({ ok: false, error: String(e.message || e) }))
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: stderr.slice(-2000) || `ffmpeg exited with code ${code}` })
    })
  })
}

/**
 * Clip a media file between [start, end].
 * type: 'audio' | 'video'
 * mode: 'copy' (fast, stream copy) | 'encode' (re-encode, frame accurate)
 */
ipcMain.handle('ffmpeg:clip', async (_e, opts) => {
  const { input, start, end, type, mode } = opts
  const duration = Math.max(0, Number(end) - Number(start))
  if (!(duration > 0)) return { ok: false, error: '終了位置は開始位置より後にしてください。' }

  const ext = path.extname(input) || (type === 'audio' ? '.m4a' : '.mp4')
  let outPath = opts.outPath
  if (!outPath) {
    const dir = settings.lastClipDir || path.dirname(input)
    const base = path.basename(input, path.extname(input))
    const stamp = `${formatStamp(start)}-${formatStamp(end)}`
    outPath = uniqueOutPath(path.join(dir, `${base}_clip_${stamp}${ext}`))
  }

  const args = ['-y', '-ss', String(start), '-i', input, '-t', String(duration)]
  if (mode === 'copy') {
    args.push('-c', 'copy')
  } else if (type === 'audio') {
    // Re-encode audio. Choose codec by extension.
    if (ext === '.mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2')
    else if (ext === '.flac') args.push('-c:a', 'flac')
    else if (ext === '.wav') args.push('-c:a', 'pcm_s16le')
    else if (ext === '.ogg' || ext === '.opus') args.push('-c:a', 'libopus', '-b:a', '192k')
    else args.push('-c:a', 'aac', '-b:a', '256k')
    args.push('-vn')
  } else {
    // Re-encode video (frame accurate)
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '256k')
  }
  args.push(outPath)

  const res = await runFfmpeg(args)
  if (!res.ok) return res

  settings.lastClipDir = path.dirname(outPath)
  writeSettings(settings)
  return { ok: true, outPath }
})

function formatStamp(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds)))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}m${String(sec).padStart(2, '0')}s`
}

// ---------------------------------------------------------------------------
// IPC: yt-dlp download (with progress streaming)
// ---------------------------------------------------------------------------
let jobSeq = 0
const activeJobs = new Map()

ipcMain.handle('ytdlp:download', async (_e, opts) => {
  const { url, outDir, audioOnly, audioFormat } = opts
  const bin = resolveBin('yt-dlp')
  const id = ++jobSeq

  const targetDir = outDir || settings.lastDownloadDir || app.getPath('downloads')
  settings.lastDownloadDir = targetDir
  writeSettings(settings)

  const outTemplate = path.join(targetDir, '%(title).200B [%(id)s].%(ext)s')
  const args = ['--newline', '--no-playlist', '-o', outTemplate]

  // Prefer using ffmpeg that we resolved (for merge/extract).
  const ffmpegBin = resolveBin('ffmpeg')
  if (ffmpegBin && ffmpegBin !== 'ffmpeg') {
    args.push('--ffmpeg-location', ffmpegBin)
  }

  if (audioOnly) {
    args.push('-x', '--audio-format', audioFormat || 'mp3', '--audio-quality', '0')
  } else {
    args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4')
  }
  args.push(url)

  const child = spawn(bin, args, { windowsHide: true })
  activeJobs.set(id, child)

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, { id, ...payload })
    }
  }

  let lastDest = null
  child.stdout.on('data', (d) => {
    const text = d.toString()
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue
      const m = line.match(/\[download\]\s+([\d.]+)%/)
      if (m) {
        send('ytdlp:progress', { percent: parseFloat(m[1]), line })
      } else {
        const dest = line.match(/\[(?:download|ExtractAudio|Merger)\]\s+(?:Destination|Merging formats into|Destination:)?\s*"?(.+?)"?$/)
        if (dest && dest[1] && /\.[a-z0-9]{2,4}$/i.test(dest[1])) lastDest = dest[1]
        send('ytdlp:log', { line })
      }
    }
  })
  child.stderr.on('data', (d) => {
    send('ytdlp:log', { line: d.toString().trim() })
  })
  child.on('error', (e) => {
    activeJobs.delete(id)
    send('ytdlp:done', { ok: false, error: String(e.message || e) })
  })
  child.on('close', (code) => {
    activeJobs.delete(id)
    send('ytdlp:done', { ok: code === 0, code, outPath: lastDest, dir: targetDir })
  })

  return { id, dir: targetDir }
})

ipcMain.handle('ytdlp:cancel', async (_e, { id }) => {
  const child = activeJobs.get(id)
  if (child) {
    child.kill()
    activeJobs.delete(id)
    return true
  }
  return false
})

// ---------------------------------------------------------------------------
// IPC: Sorter (recursive media scan with progress + tag database)
// ---------------------------------------------------------------------------

// Pick a root folder for the sorter (any media kind).
ipcMain.handle('sorter:pickRoot', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '仕分けするフォルダを選択',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

/**
 * Recursively walk `root`, collecting every supported media file and streaming
 * progress back to the renderer. Tag data from the sidecar store is merged in
 * so the renderer gets everything in a single round-trip.
 */
ipcMain.handle('sorter:scan', async (_e, { root, scanId }) => {
  if (!root || !fs.existsSync(root)) {
    return { root, files: [], tags: [] }
  }

  const out = []
  let scanned = 0
  let lastEmit = 0
  const send = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sorter:scanProgress', { scanId, ...payload })
    }
  }

  async function walk(dir, depth) {
    if (depth > 24) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      // Skip our own sidecar directory and common hidden/system folders.
      if (entry.isDirectory()) {
        if (entry.name === tagStore.STORE_DIRNAME) continue
        if (entry.name.startsWith('$') || entry.name === 'System Volume Information') continue
        await walk(path.join(dir, entry.name), depth + 1)
      } else if (entry.isFile()) {
        const kind = kindForExt(path.extname(entry.name))
        if (!kind) continue
        const full = path.join(dir, entry.name)
        let mtimeMs = 0
        let size = 0
        try {
          const st = await fsp.stat(full)
          mtimeMs = st.mtimeMs
          size = st.size
        } catch {
          /* ignore */
        }
        out.push({
          path: full,
          rel: path.relative(root, full).split(path.sep).join('/'),
          name: entry.name,
          dir,
          mtimeMs,
          size,
          kind,
        })
        scanned += 1
        const now = Date.now()
        if (now - lastEmit > 120) {
          lastEmit = now
          send({ scanned, total: -1, done: false, currentDir: dir })
        }
      }
    }
  }

  await walk(root, 0)

  // Merge stored tags.
  let tagList = []
  try {
    const loaded = await tagStore.load(root)
    tagList = loaded.tags
    const fileTags = loaded.files
    for (const f of out) {
      f.tags = fileTags[f.rel] || []
    }
  } catch (e) {
    console.error('tagStore.load failed', e)
    for (const f of out) f.tags = []
  }

  send({ scanned, total: scanned, done: true })
  return { root, files: out, tags: tagList }
})

// ---- Tag mutations ------------------------------------------------------
ipcMain.handle('sorter:loadTags', async (_e, { root }) => tagStore.load(root))
ipcMain.handle('sorter:setFileTags', async (_e, { root, rel, tags }) =>
  tagStore.setFileTags(root, rel, tags),
)
ipcMain.handle('sorter:addTag', async (_e, { root, rels, tag }) =>
  tagStore.addTagToFiles(root, rels, tag),
)
ipcMain.handle('sorter:removeTag', async (_e, { root, rels, tag }) =>
  tagStore.removeTagFromFiles(root, rels, tag),
)
ipcMain.handle('sorter:createTag', async (_e, { root, name }) => tagStore.createTag(root, name))
ipcMain.handle('sorter:renameTag', async (_e, { root, oldName, newName }) =>
  tagStore.renameTag(root, oldName, newName),
)
ipcMain.handle('sorter:deleteTag', async (_e, { root, name }) => tagStore.deleteTag(root, name))
ipcMain.handle('sorter:setPinned', async (_e, { root, name, pinned }) =>
  tagStore.setPinned(root, name, pinned),
)
ipcMain.handle('sorter:flush', async (_e, { root }) => {
  if (root) await tagStore.flush(root)
  else await tagStore.flushAll()
  return true
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  settings = readSettings()
  registerMediaProtocol()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Persist any pending tag changes before the app exits.
app.on('before-quit', (e) => {
  e.preventDefault()
  tagStore
    .flushAll()
    .catch((err) => console.error('flushAll on quit failed', err))
    .finally(() => {
      app.removeAllListeners('before-quit')
      app.quit()
    })
})
