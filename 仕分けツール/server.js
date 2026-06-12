const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// Root directory for image folders (same directory as server.js)
const ROOT_DIR = __dirname;

// Supported image extensions
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper Functions ───────────────────────────────────────────────

function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

// ─── API: Select Folder via Native OS Dialog ────────────────────────

app.post('/api/select-folder', (req, res) => {
  // PowerShell command to open FolderBrowserDialog
  const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $fbd = New-Object System.Windows.Forms.FolderBrowserDialog; $fbd.Description = '画像フォルダを選択してください'; $fbd.ShowNewFolderButton = $false; if ($fbd.ShowDialog() -eq 'OK') { Write-Output $fbd.SelectedPath }"`;
  
  exec(psCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: 'Failed to open folder picker' });
    }
    const selectedPath = stdout.trim();
    if (selectedPath) {
      res.json({ folderPath: selectedPath });
    } else {
      res.json({ folderPath: null }); // user canceled
    }
  });
});

// ─── API: Get list of folders (kept for backward compatibility, now just returns empty) ─────────────────────────

app.get('/api/folders', (req, res) => {
  res.json({ folders: [] });
});

// ─── API: List images in a folder (sorted by mtime descending) ─────

app.get('/api/images', (req, res) => {
  try {
    const folderName = req.query.folder;
    if (!folderName) return res.status(400).json({ error: 'folder is required' });

    const folderPath = folderName;
    if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Folder not found' });

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const images = entries
      .filter(e => e.isFile() && isImageFile(e.name))
      .map(e => {
        const filePath = path.join(folderPath, e.name);
        const stat = fs.statSync(filePath);
        return {
          name: e.name,
          size: stat.size,
          mtime: stat.mtimeMs,
          mtimeISO: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first

    res.json({ images, folder: folderName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: List tags (subdirectories) in a folder ────────────────────

app.get('/api/tags', (req, res) => {
  try {
    const folderName = req.query.folder;
    if (!folderName) return res.status(400).json({ error: 'folder is required' });

    const folderPath = folderName;
    if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Folder not found' });

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const tags = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const tagPath = path.join(folderPath, e.name);
        const tagEntries = fs.readdirSync(tagPath);
        const imageCount = tagEntries.filter(f => isImageFile(f)).length;
        return { name: e.name, count: imageCount };
      });

    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Create a new tag (subfolder) ──────────────────────────────

app.post('/api/tags', (req, res) => {
  try {
    const { folder, tagName } = req.body;
    if (!folder || !tagName) return res.status(400).json({ error: 'folder and tagName are required' });

    // Sanitize tag name
    const safeName = tagName.replace(/[<>:"/\\|?*]/g, '_').trim();
    if (!safeName) return res.status(400).json({ error: 'Invalid tag name' });

    const folderPath = folder;
    const tagPath = path.join(folderPath, safeName);

    if (fs.existsSync(tagPath)) {
      return res.status(409).json({ error: 'Tag already exists', tagName: safeName });
    }

    fs.mkdirSync(tagPath, { recursive: true });
    res.json({ success: true, tagName: safeName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Move image to tag folder with rename ─────────────────────

app.post('/api/move', (req, res) => {
  try {
    const { folder, fileName, tagName } = req.body;
    if (!folder || !fileName || !tagName) {
      return res.status(400).json({ error: 'folder, fileName, and tagName are required' });
    }

    const folderPath = folder;
    const srcPath = path.join(folderPath, fileName);
    const tagPath = path.join(folderPath, tagName);

    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'Source file not found' });
    if (!fs.existsSync(tagPath)) return res.status(404).json({ error: 'Tag folder not found' });

    // Count existing images in tag folder to determine next ID
    const existing = fs.readdirSync(tagPath).filter(f => isImageFile(f));
    const nextId = existing.length + 1;

    const ext = path.extname(fileName);
    const newName = `${tagName}_${nextId}${ext}`;
    const destPath = path.join(tagPath, newName);

    // Check for collision (shouldn't happen normally)
    if (fs.existsSync(destPath)) {
      // Find next available ID
      let id = nextId;
      let dest;
      do {
        id++;
        dest = path.join(tagPath, `${tagName}_${id}${ext}`);
      } while (fs.existsSync(dest));
      fs.renameSync(srcPath, dest);
      res.json({ success: true, newName: `${tagName}_${id}${ext}` });
    } else {
      fs.renameSync(srcPath, destPath);
      res.json({ success: true, newName });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Bulk move images ──────────────────────────────────────────

app.post('/api/move-batch', (req, res) => {
  try {
    const { folder, moves } = req.body;
    if (!folder || !Array.isArray(moves)) {
      return res.status(400).json({ error: 'folder and moves array are required' });
    }

    const folderPath = folder;
    const results = [];

    for (const move of moves) {
      const { fileName, tagName } = move;
      const srcPath = path.join(folderPath, fileName);
      const tagPath = path.join(folderPath, tagName);

      if (!fs.existsSync(srcPath) || !fs.existsSync(tagPath)) {
        results.push({ fileName, success: false, error: 'File or tag not found' });
        continue;
      }

      const existing = fs.readdirSync(tagPath).filter(f => isImageFile(f));
      let id = existing.length + 1;
      const ext = path.extname(fileName);
      let destPath;

      do {
        destPath = path.join(tagPath, `${tagName}_${id}${ext}`);
        if (!fs.existsSync(destPath)) break;
        id++;
      } while (true);

      fs.renameSync(srcPath, destPath);
      results.push({ fileName, success: true, newName: `${tagName}_${id}${ext}` });
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve specific image by absolute path ──────────────────────────────

app.get('/api/image', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !path.isAbsolute(filePath)) {
    return res.status(400).send('Invalid or missing path parameter');
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Image not found');
  }
  res.sendFile(filePath);
});

// ─── Start Server ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ■ 画像仕分けツール`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Root: ${ROOT_DIR}\n`);
});
