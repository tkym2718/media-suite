'use strict'

// ---------------------------------------------------------------------------
// Tag store: per-root tag database persisted as a sidecar JSON file directly
// inside the scanned media folder (<root>/.media-suite/tags.json).
//
// The on-disk format keeps file keys *relative* to the root so the folder can
// be moved/renamed without losing tags. Everything is held in memory while a
// root is open and written back with a debounced, atomic write for speed.
//
// The module is intentionally storage-agnostic behind this small API so the
// backing store could later be swapped for SQLite without touching callers.
// ---------------------------------------------------------------------------

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const STORE_DIRNAME = '.media-suite'
const STORE_FILENAME = 'tags.json'
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 800

/**
 * @typedef {Object} TagDb
 * @property {number} version
 * @property {Record<string, { lastUsed: number, pinned?: boolean }>} tags
 * @property {Record<string, string[]>} files  // rel -> tag names
 */

/** @type {Map<string, { db: TagDb, dirty: boolean, timer: NodeJS.Timeout | null }>} */
const cache = new Map()

function storePath(root) {
  return path.join(root, STORE_DIRNAME, STORE_FILENAME)
}

function emptyDb() {
  return { version: SCHEMA_VERSION, tags: {}, files: {} }
}

function normalizeDb(raw) {
  const db = emptyDb()
  if (raw && typeof raw === 'object') {
    if (raw.tags && typeof raw.tags === 'object') {
      for (const [name, meta] of Object.entries(raw.tags)) {
        db.tags[name] = {
          lastUsed: Number((meta && meta.lastUsed) || 0),
          pinned: !!(meta && meta.pinned),
        }
      }
    }
    if (raw.files && typeof raw.files === 'object') {
      for (const [rel, tags] of Object.entries(raw.files)) {
        if (Array.isArray(tags)) {
          const clean = [...new Set(tags.filter((t) => typeof t === 'string' && t))]
          if (clean.length) db.files[rel] = clean
        }
      }
    }
  }
  // Ensure every tag referenced by a file exists in the tags map.
  for (const tags of Object.values(db.files)) {
    for (const t of tags) {
      if (!db.tags[t]) db.tags[t] = { lastUsed: 0 }
    }
  }
  return db
}

async function getEntry(root) {
  let entry = cache.get(root)
  if (entry) return entry
  let db = emptyDb()
  try {
    const txt = await fsp.readFile(storePath(root), 'utf-8')
    db = normalizeDb(JSON.parse(txt))
  } catch {
    db = emptyDb()
  }
  entry = { db, dirty: false, timer: null }
  cache.set(root, entry)
  return entry
}

function scheduleSave(root, entry) {
  entry.dirty = true
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    flush(root).catch((e) => console.error('tagStore flush failed', e))
  }, SAVE_DEBOUNCE_MS)
}

async function flush(root) {
  const entry = cache.get(root)
  if (!entry || !entry.dirty) return
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  const dir = path.join(root, STORE_DIRNAME)
  const file = storePath(root)
  const tmp = file + '.tmp'
  const payload = JSON.stringify(entry.db)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(tmp, payload, 'utf-8')
  await fsp.rename(tmp, file)
  entry.dirty = false
}

async function flushAll() {
  await Promise.all([...cache.keys()].map((root) => flush(root).catch(() => {})))
}

// ---- Sanitization -------------------------------------------------------

function sanitizeTag(name) {
  if (typeof name !== 'string') return ''
  // Tags are metadata (not folder names) so we are permissive, but strip
  // control chars and collapse whitespace.
  return name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---- Public API ---------------------------------------------------------

/** Build the TagInfo[] (with live counts) for a root. */
function buildTagList(db) {
  const counts = new Map()
  for (const tags of Object.values(db.files)) {
    for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1)
  }
  return Object.entries(db.tags).map(([name, meta]) => ({
    name,
    count: counts.get(name) || 0,
    lastUsed: meta.lastUsed || 0,
    pinned: !!meta.pinned,
  }))
}

async function load(root) {
  const entry = await getEntry(root)
  return { tags: buildTagList(entry.db), files: entry.db.files }
}

async function getTagsForFiles(root, rels) {
  const entry = await getEntry(root)
  const out = {}
  for (const rel of rels) out[rel] = entry.db.files[rel] || []
  return out
}

/** Replace the full tag set for a single file. */
async function setFileTags(root, rel, tags) {
  const entry = await getEntry(root)
  const clean = [...new Set((tags || []).map(sanitizeTag).filter(Boolean))]
  const now = Date.now()
  if (clean.length) entry.db.files[rel] = clean
  else delete entry.db.files[rel]
  for (const t of clean) {
    if (!entry.db.tags[t]) entry.db.tags[t] = { lastUsed: now }
    else entry.db.tags[t].lastUsed = now
  }
  scheduleSave(root, entry)
  return buildTagList(entry.db)
}

/** Add one tag to many files (bulk). */
async function addTagToFiles(root, rels, tag) {
  const entry = await getEntry(root)
  const t = sanitizeTag(tag)
  if (!t) return buildTagList(entry.db)
  const now = Date.now()
  for (const rel of rels) {
    const cur = entry.db.files[rel] || []
    if (!cur.includes(t)) {
      cur.push(t)
      entry.db.files[rel] = cur
    }
  }
  entry.db.tags[t] = { ...(entry.db.tags[t] || {}), lastUsed: now }
  scheduleSave(root, entry)
  return buildTagList(entry.db)
}

/** Remove one tag from many files (bulk). */
async function removeTagFromFiles(root, rels, tag) {
  const entry = await getEntry(root)
  const t = sanitizeTag(tag)
  for (const rel of rels) {
    const cur = entry.db.files[rel]
    if (cur) {
      const next = cur.filter((x) => x !== t)
      if (next.length) entry.db.files[rel] = next
      else delete entry.db.files[rel]
    }
  }
  scheduleSave(root, entry)
  return buildTagList(entry.db)
}

async function createTag(root, name) {
  const entry = await getEntry(root)
  const t = sanitizeTag(name)
  if (!t) return buildTagList(entry.db)
  if (!entry.db.tags[t]) entry.db.tags[t] = { lastUsed: Date.now() }
  scheduleSave(root, entry)
  return buildTagList(entry.db)
}

async function renameTag(root, oldName, newName) {
  const entry = await getEntry(root)
  const from = sanitizeTag(oldName)
  const to = sanitizeTag(newName)
  if (!from || !to || from === to) return buildTagList(entry.db)
  if (entry.db.tags[from]) {
    entry.db.tags[to] = { ...(entry.db.tags[to] || {}), ...entry.db.tags[from], lastUsed: Date.now() }
    delete entry.db.tags[from]
  }
  for (const [rel, tags] of Object.entries(entry.db.files)) {
    if (tags.includes(from)) {
      entry.db.files[rel] = [...new Set(tags.map((x) => (x === from ? to : x)))]
    }
  }
  scheduleSave(root, entry)
  return buildTagList(entry.db)
}

async function deleteTag(root, name) {
  const entry = await getEntry(root)
  const t = sanitizeTag(name)
  delete entry.db.tags[t]
  for (const [rel, tags] of Object.entries(entry.db.files)) {
    if (tags.includes(t)) {
      const next = tags.filter((x) => x !== t)
      if (next.length) entry.db.files[rel] = next
      else delete entry.db.files[rel]
    }
  }
  scheduleSave(root, entry)
  return buildTagList(entry.db)
}

async function setPinned(root, name, pinned) {
  const entry = await getEntry(root)
  const t = sanitizeTag(name)
  if (entry.db.tags[t]) {
    entry.db.tags[t].pinned = !!pinned
    scheduleSave(root, entry)
  }
  return buildTagList(entry.db)
}

module.exports = {
  STORE_DIRNAME,
  load,
  getTagsForFiles,
  setFileTags,
  addTagToFiles,
  removeTagFromFiles,
  createTag,
  renameTag,
  deleteTag,
  setPinned,
  flush,
  flushAll,
}
