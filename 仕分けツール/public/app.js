// ============================================================
//  画像仕分けツール — Client Application
// ============================================================

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let currentFolder = '';
  let tags = [];
  let pendingTagCallback = null; // callback after creating a new tag

  // ── DOM References ─────────────────────────────────────
  const btnSelectFolder = document.getElementById('btn-select-folder');
  const currentFolderPathDisplay = document.getElementById('current-folder-path');
  const statsBar = document.getElementById('stats-bar');
  const statTotalCount = document.getElementById('stat-total-count');
  const statTagsCount = document.getElementById('stat-tags-count');
  const imageGrid = document.getElementById('image-grid');
  const emptyState = document.getElementById('empty-state');
  const btnBulkSave = document.getElementById('btn-bulk-save');
  const modalOverlay = document.getElementById('modal-overlay');
  const tagInput = document.getElementById('tag-input');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');
  const toastContainer = document.getElementById('toast-container');

  // ── Init ───────────────────────────────────────────────
  async function init() {
    btnSelectFolder.addEventListener('click', onSelectFolder);
    btnBulkSave.addEventListener('click', onBulkSave);
    modalCancel.addEventListener('click', closeModal);
    modalConfirm.addEventListener('click', onModalConfirm);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeLightbox();
      }
    });

    // Auto-select folder from URL params (e.g., ?folder=C:\Images)
    const params = new URLSearchParams(window.location.search);
    const folderParam = params.get('folder');
    if (folderParam) {
      currentFolder = folderParam;
      loadFolder();
    }
  }

  // ── API Helpers ────────────────────────────────────────
  async function api(url, options) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
  }

  // ── Folders ────────────────────────────────────────────
  async function onSelectFolder() {
    try {
      const data = await api('/api/select-folder', { method: 'POST' });
      if (data.folderPath) {
        currentFolder = data.folderPath;
        loadFolder();
      }
    } catch (err) {
      showToast('フォルダ選択に失敗しました', 'error');
    }
  }

  async function loadFolder() {
    if (!currentFolder) {
      imageGrid.classList.add('hidden');
      statsBar.classList.add('hidden');
      emptyState.classList.remove('hidden');
      btnBulkSave.classList.add('hidden');
      currentFolderPathDisplay.textContent = '未選択';
      currentFolderPathDisplay.title = '';
      return;
    }
    currentFolderPathDisplay.textContent = currentFolder;
    currentFolderPathDisplay.title = currentFolder;
    btnBulkSave.classList.remove('hidden');
    updateBulkSaveButton();
    await loadTags();
    await loadImages();
  }

  function updateBulkSaveButton() {
    const hasSelection = Array.from(imageGrid.querySelectorAll('.tag-select'))
      .some(sel => sel.value && sel.value !== '__new__');
    btnBulkSave.disabled = !hasSelection;
  }

  // ── Tags ───────────────────────────────────────────────
  async function loadTags() {
    try {
      const data = await api(`/api/tags?folder=${encodeURIComponent(currentFolder)}`);
      tags = data.tags;
      statTagsCount.textContent = tags.length;
    } catch (err) {
      showToast('タグの読み込みに失敗しました', 'error');
    }
  }

  async function createTag(name) {
    try {
      const data = await api('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: currentFolder, tagName: name })
      });
      showToast(`タグ「${data.tagName}」を作成しました`, 'success');
      await loadTags();
      refreshAllTagSelects();
      return data.tagName;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    }
  }

  // ── Images ─────────────────────────────────────────────
  async function loadImages() {
    try {
      const data = await api(`/api/images?folder=${encodeURIComponent(currentFolder)}`);
      renderImages(data.images);
      statTotalCount.textContent = data.images.length;
      statsBar.classList.remove('hidden');
      if (data.images.length > 0) {
        emptyState.classList.add('hidden');
        imageGrid.classList.remove('hidden');
      } else {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('.empty-text').textContent = '画像がありません';
        imageGrid.classList.add('hidden');
      }
    } catch (err) {
      showToast('画像の読み込みに失敗しました', 'error');
    }
  }

  function renderImages(images) {
    imageGrid.innerHTML = '';
    images.forEach((img, i) => {
      const card = createImageCard(img, i);
      imageGrid.appendChild(card);
    });
    updateBulkSaveButton();
  }

  function createImageCard(img, index) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.style.animationDelay = `${Math.min(index * 0.04, 1)}s`;
    card.dataset.fileName = img.name;

    const dateStr = formatDate(img.mtimeISO);
    const imgPath = currentFolder + '\\' + img.name;
    const imgUrl = `/api/image?path=${encodeURIComponent(imgPath)}`;

    card.innerHTML = `
      <div class="card-thumb-wrap" data-src="${imgUrl}">
        <img src="${imgUrl}" alt="${img.name}" loading="lazy">
        <span class="card-date">${dateStr}</span>
      </div>
      <div class="card-body">
        <div class="card-name" title="${img.name}">${img.name}</div>
        <div class="card-actions">
          <div class="select-wrapper">
            <select class="tag-select" data-file="${img.name}">
              <option value="">タグを選択</option>
              ${tags.map(t => `<option value="${t.name}">${t.name} (${t.count})</option>`).join('')}
              <option value="__new__">＋ 新規タグ</option>
            </select>
            <div class="select-arrow">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5L7 9L11 5" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <button class="btn-move" title="移動" disabled data-file="${img.name}">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 9H14M14 9L10 5M14 9L10 13" stroke="#2D2D2D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Lightbox
    const thumbWrap = card.querySelector('.card-thumb-wrap');
    thumbWrap.addEventListener('click', () => openLightbox(imgUrl));

    // Tag select change
    const tagSel = card.querySelector('.tag-select');
    const moveBtn = card.querySelector('.btn-move');

    tagSel.addEventListener('change', () => {
      if (tagSel.value === '__new__') {
        pendingTagCallback = (newTag) => {
          if (newTag) {
            tagSel.value = newTag;
            moveBtn.disabled = false;
          } else {
            tagSel.value = '';
            moveBtn.disabled = true;
          }
          updateBulkSaveButton();
        };
        openModal();
        tagSel.value = '';
      } else {
        moveBtn.disabled = !tagSel.value;
        updateBulkSaveButton();
      }
    });

    // Move button
    moveBtn.addEventListener('click', () => moveImage(card, img.name, tagSel.value));

    return card;
  }

  // ── Move Image ─────────────────────────────────────────
  async function moveImage(card, fileName, tagName) {
    if (!tagName) return;
    try {
      card.classList.add('moving');
      const data = await api('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: currentFolder, fileName, tagName })
      });
      showToast(`${tagName} → ${data.newName}`, 'success');
      // Wait for animation, then remove
      setTimeout(() => {
        card.remove();
        // Update counts
        const remaining = imageGrid.querySelectorAll('.image-card').length;
        statTotalCount.textContent = remaining;
        if (remaining === 0) {
          emptyState.classList.remove('hidden');
          emptyState.querySelector('.empty-text').textContent = '全ての画像を仕分けました！';
          imageGrid.classList.add('hidden');
        }
        // Update tag counts
        loadTags().then(refreshAllTagSelects);
      }, 450);
    } catch (err) {
      card.classList.remove('moving');
      showToast(`移動に失敗: ${err.message}`, 'error');
    }
  }

  // ── Bulk Save ──────────────────────────────────────────
  async function onBulkSave() {
    const moves = [];
    const cardsToMove = [];
    
    // Gather all valid selections
    const selects = imageGrid.querySelectorAll('.tag-select');
    selects.forEach(sel => {
      const val = sel.value;
      if (val && val !== '__new__') {
        const card = sel.closest('.image-card');
        const fileName = card.dataset.fileName;
        moves.push({ fileName, tagName: val });
        cardsToMove.push(card);
      }
    });

    if (moves.length === 0) return;

    try {
      btnBulkSave.disabled = true;
      btnBulkSave.innerHTML = `<span style="vertical-align: middle;">保存中...</span>`;
      
      const data = await api('/api/move-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: currentFolder, moves })
      });
      
      let successCount = 0;
      data.results.forEach((res, i) => {
        if (res.success) {
          successCount++;
          cardsToMove[i].classList.add('moving');
        }
      });
      
      showToast(`${successCount}枚の画像を移動しました`, 'success');
      
      setTimeout(() => {
        data.results.forEach((res, i) => {
          if (res.success) cardsToMove[i].remove();
        });
        
        const remaining = imageGrid.querySelectorAll('.image-card').length;
        statTotalCount.textContent = remaining;
        if (remaining === 0) {
          emptyState.classList.remove('hidden');
          emptyState.querySelector('.empty-text').textContent = '全ての画像を仕分けました！';
          imageGrid.classList.add('hidden');
        }
        
        loadTags().then(refreshAllTagSelects);
        btnBulkSave.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="margin-right: 6px; vertical-align: middle;">
          <path d="M4 9H14M14 9L10 5M14 9L10 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="vertical-align: middle;">一括保存</span>`;
        updateBulkSaveButton();
      }, 450);
    } catch (err) {
      showToast(`一括保存に失敗: ${err.message}`, 'error');
      btnBulkSave.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="margin-right: 6px; vertical-align: middle;">
          <path d="M4 9H14M14 9L10 5M14 9L10 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="vertical-align: middle;">一括保存</span>`;
      updateBulkSaveButton();
    }
  }

  // ── Refresh tag selects on all cards ───────────────────
  function refreshAllTagSelects() {
    const selects = imageGrid.querySelectorAll('.tag-select');
    selects.forEach(sel => {
      const currentVal = sel.value;
      sel.innerHTML = `
        <option value="">タグを選択</option>
        ${tags.map(t => `<option value="${t.name}">${t.name} (${t.count})</option>`).join('')}
        <option value="__new__">＋ 新規タグ</option>
      `;
      if (currentVal && currentVal !== '__new__') {
        sel.value = currentVal;
      }
    });
  }

  // ── Modal ──────────────────────────────────────────────
  function openModal() {
    tagInput.value = '';
    modalOverlay.classList.remove('hidden');
    setTimeout(() => tagInput.focus(), 100);
    tagInput.addEventListener('keydown', onTagInputKey);
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    tagInput.removeEventListener('keydown', onTagInputKey);
    if (pendingTagCallback) {
      pendingTagCallback(null);
      pendingTagCallback = null;
    }
  }

  function onTagInputKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onModalConfirm();
    }
  }

  async function onModalConfirm() {
    const name = tagInput.value.trim();
    if (!name) {
      showToast('タグ名を入力してください', 'error');
      return;
    }
    const created = await createTag(name);
    modalOverlay.classList.add('hidden');
    tagInput.removeEventListener('keydown', onTagInputKey);
    if (pendingTagCallback) {
      pendingTagCallback(created);
      pendingTagCallback = null;
    }
  }

  // ── Lightbox ───────────────────────────────────────────
  function openLightbox(src) {
    let overlay = document.getElementById('lightbox-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lightbox-overlay';
      overlay.addEventListener('click', closeLightbox);
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<img src="${src}" alt="Preview">`;
    overlay.classList.remove('hidden');
  }

  function closeLightbox() {
    const overlay = document.getElementById('lightbox-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── Toast ──────────────────────────────────────────────
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ── Utilities ──────────────────────────────────────────
  function formatDate(isoStr) {
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
  }

  // ── Start ──────────────────────────────────────────────
  init();
})();
