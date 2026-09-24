'use client';

import { useState, useEffect, useRef } from 'react';
import MediaContent from './MediaContent';

// Detect content type
function detectKind(content) {
  if (!content) return 'empty';

  // YouTube URL regex
  if (
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)/.test(
      content
    )
  ) {
    return 'youtube';
  }

  // Image data URL, image URL, or uploaded image
  if (
    content.startsWith('data:image') ||
    content.startsWith('/api/image/') ||
    /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(content)
  ) {
    return 'image';
  }

  // Audio URL
  if (/\.(mp3|ogg|wav|m4a)(\?.*)?$/i.test(content)) {
    return 'audio';
  }

  // Fallback to text
  return 'text';
}

const MAX_UPLOAD = 5 * 1024 * 1024;
const SAFE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Phone photos are often too big, HEIC (which other browsers can't show), or
// come with no MIME type at all. Re-encode those to a JPEG capped at 2048px;
// files that are already fine go up untouched (keeps GIFs animated).
async function prepareImage(file) {
  if (SAFE_IMAGE_TYPES.includes(file.type) && file.size <= MAX_UPLOAD) {
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    throw new Error(
      "This browser can't read that image. Try a PNG or JPG (or a screenshot of it)."
    );
  }
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha: paint white first so transparent PNGs don't go black
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  );
  if (!blob || blob.size > MAX_UPLOAD) {
    throw new Error('Image too large (max 5MB)');
  }
  return blob;
}

const KIND_ICONS = {
  empty: '∅',
  text: '📝',
  image: '🖼️',
  audio: '🔊',
  youtube: '▶️',
};

const DEFAULT_BONUS = {
  value: 1000,
  kind: 'empty',
  content: '',
  answerKind: 'empty',
  answer: '',
  tip: '',
};

export default function Editor({
  game,
  persistedName,
  persistedRoom,
  onDone,
}) {
  const [categories, setCategories] = useState([]);
  const [bonus, setBonus] = useState(DEFAULT_BONUS);
  const [selectedCell, setSelectedCell] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const clueFileInputRef = useRef(null);
  const answerFileInputRef = useRef(null);
  const bonusFileInputRef = useRef(null);
  const bonusAnswerFileInputRef = useRef(null);
  // Refs mirror the latest state so a debounced save always sends both
  // pieces fresh, even when only one of them just changed.
  const categoriesRef = useRef([]);
  const bonusRef = useRef(DEFAULT_BONUS);

  // Load full board on mount
  useEffect(() => {
    const loadBoard = async () => {
      try {
        const res = await fetch(
          `/api/board?room=${persistedRoom}&name=${encodeURIComponent(persistedName)}`
        );
        const { game: fullGame } = await res.json();
        categoriesRef.current = fullGame.categories;
        setCategories(fullGame.categories);
        const loadedBonus = fullGame.bonus || DEFAULT_BONUS;
        bonusRef.current = loadedBonus;
        setBonus(loadedBonus);
        setLoading(false);
      } catch (e) {
        console.error('Failed to load board:', e);
        setLoading(false);
      }
    };
    loadBoard();
  }, [persistedRoom, persistedName]);

  // Autosave with debounce
  const handleCategoryChange = (idx, newName) => {
    const updated = [...categories];
    updated[idx].name = newName;
    categoriesRef.current = updated;
    setCategories(updated);
    triggerSave();
  };

  const handleClueChange = (catIdx, rowIdx, newContent) => {
    const updated = [...categories];
    updated[catIdx].clues[rowIdx].content = newContent;
    updated[catIdx].clues[rowIdx].kind = detectKind(newContent);
    categoriesRef.current = updated;
    setCategories(updated);
    triggerSave();
  };

  const handleAnswerChange = (catIdx, rowIdx, newContent) => {
    const updated = [...categories];
    updated[catIdx].clues[rowIdx].answer = newContent;
    updated[catIdx].clues[rowIdx].answerKind = detectKind(newContent);
    categoriesRef.current = updated;
    setCategories(updated);
    triggerSave();
  };

  const handleTipChange = (catIdx, rowIdx, newTip) => {
    const updated = [...categories];
    updated[catIdx].clues[rowIdx].tip = newTip;
    categoriesRef.current = updated;
    setCategories(updated);
    triggerSave();
  };

  const handleBonusValueChange = (newValue) => {
    const updated = { ...bonus, value: newValue };
    bonusRef.current = updated;
    setBonus(updated);
    triggerSave();
  };

  const handleBonusContentChange = (newContent) => {
    const updated = { ...bonus, content: newContent, kind: detectKind(newContent) };
    bonusRef.current = updated;
    setBonus(updated);
    triggerSave();
  };

  const handleBonusAnswerChange = (newContent) => {
    const updated = { ...bonus, answer: newContent, answerKind: detectKind(newContent) };
    bonusRef.current = updated;
    setBonus(updated);
    triggerSave();
  };

  const handleBonusTipChange = (newTip) => {
    const updated = { ...bonus, tip: newTip };
    bonusRef.current = updated;
    setBonus(updated);
    triggerSave();
  };

  const triggerSave = () => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave();
    }, 800);
  };

  const performSave = async () => {
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room: persistedRoom,
          name: persistedName,
          categories: categoriesRef.current.map((cat) => ({
            name: cat.name,
            clues: cat.clues.map((clue) => ({
              kind: clue.kind,
              content: clue.content,
              answerKind: clue.answerKind || 'empty',
              answer: clue.answer || '',
              tip: clue.tip || '',
            })),
          })),
          bonus: {
            value: Number(bonusRef.current.value) || DEFAULT_BONUS.value,
            kind: bonusRef.current.kind || 'empty',
            content: bonusRef.current.content || '',
            answerKind: bonusRef.current.answerKind || 'empty',
            answer: bonusRef.current.answer || '',
            tip: bonusRef.current.tip || '',
          },
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        console.error('Save rejected:', error);
        setSaveError(error || 'Save failed');
        return;
      }
      setSaveError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Save failed:', e);
      setSaveError('Save failed');
    }
  };

  // Uploads an image and returns its /api/image URL, or null after telling
  // the host why it failed (the server's reason, not a generic message).
  const postImage = async (file) => {
    try {
      const image = await prepareImage(file);
      const response = await fetch(
        `/api/image?room=${persistedRoom}&name=${encodeURIComponent(persistedName)}`,
        {
          method: 'POST',
          headers: { 'content-type': image.type },
          body: image,
        }
      );

      if (!response.ok) {
        const { error } = await response.json().catch(() => ({}));
        alert(`Image upload failed: ${error || `HTTP ${response.status}`}`);
        return null;
      }

      const json = await response.json();
      return json.url;
    } catch (err) {
      console.error('Upload error:', err);
      alert(`Image upload failed: ${err.message}`);
      return null;
    }
  };

  const uploadImage = async (file, catIdx, rowIdx, isAnswer = false) => {
    const url = await postImage(file);
    if (!url) return;
    if (isAnswer) {
      handleAnswerChange(catIdx, rowIdx, url);
    } else {
      handleClueChange(catIdx, rowIdx, url);
    }
  };

  const uploadBonusImage = async (file, isAnswer = false) => {
    const url = await postImage(file);
    if (!url) return;
    if (isAnswer) {
      handleBonusAnswerChange(url);
    } else {
      handleBonusContentChange(url);
    }
  };

  const rowCount = categories[0]?.clues.length || 0;

  const changeShape = (which, delta) => {
    const updated = categories.map((c) => ({
      ...c,
      clues: [...c.clues],
    }));
    if (which === 'cols') {
      const n = updated.length + delta;
      if (n < 1 || n > 10) return;
      if (delta > 0) {
        updated.push({
          name: '',
          clues: Array.from({ length: rowCount }, (_, r) => ({
            value: 200 * (r + 1),
            kind: 'empty',
            content: '',
            answerKind: 'empty',
            answer: '',
            tip: '',
            used: false,
          })),
        });
      } else {
        updated.pop();
      }
    } else {
      const n = rowCount + delta;
      if (n < 1 || n > 10) return;
      updated.forEach((c) => {
        if (delta > 0) {
          c.clues.push({
            value: 200 * (rowCount + 1),
            kind: 'empty',
            content: '',
            answerKind: 'empty',
            answer: '',
            tip: '',
            used: false,
          });
        } else {
          c.clues.pop();
        }
      });
    }
    setSelectedCell(null);
    categoriesRef.current = updated;
    setCategories(updated);
    triggerSave();
  };

  const handlePaste = async (catIdx, rowIdx, e, isAnswer = false) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        e.preventDefault();
        uploadImage(file, catIdx, rowIdx, isAnswer);
        return;
      }
    }
  };

  const handleFileInputChange = async (e, isAnswer = false) => {
    if (!selectedCell) return;

    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file, selectedCell.cat, selectedCell.row, isAnswer);
      // Reset input so same file can be selected again
      if (isAnswer && answerFileInputRef.current) {
        answerFileInputRef.current.value = '';
      } else if (clueFileInputRef.current) {
        clueFileInputRef.current.value = '';
      }
    }
  };

  const triggerClueFileInput = () => {
    clueFileInputRef.current?.click();
  };

  const triggerAnswerFileInput = () => {
    answerFileInputRef.current?.click();
  };

  if (loading) {
    return <div className="container entry-screen"><div>Loading board...</div></div>;
  }

  const clue = selectedCell
    ? categories[selectedCell.cat].clues[selectedCell.row]
    : null;

  return (
    <div className="container editor-screen">
      <div className="editor-header">
        <h1>EDIT BOARD</h1>
        <div className="shape-controls">
          <span>Categories: {categories.length}</span>
          <button onClick={() => changeShape('cols', -1)}>−</button>
          <button onClick={() => changeShape('cols', 1)}>+</button>
          <span>Rows: {rowCount}</span>
          <button onClick={() => changeShape('rows', -1)}>−</button>
          <button onClick={() => changeShape('rows', 1)}>+</button>
        </div>
        {saved && <div className="saved-indicator">✓ Saved</div>}
        {saveError && <div className="save-error-indicator">⚠ {saveError}</div>}
      </div>

      <div className="editor-content">
        {/* Category names */}
        <div className="category-inputs">
          {categories.map((cat, idx) => (
            <input
              key={idx}
              type="text"
              value={cat.name}
              onChange={(e) => handleCategoryChange(idx, e.target.value)}
              placeholder={`Category ${idx + 1}`}
              className="category-input"
            />
          ))}
        </div>

        {/* Grid of cells */}
        <div className="editor-grid">
          {Array.from({ length: rowCount }, (_, rowIdx) => (
            <div
              key={rowIdx}
              className="editor-row"
              style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))` }}
            >
              {categories.map((cat, catIdx) => {
                const cellClue = cat.clues[rowIdx];
                const isSelected =
                  selectedCell?.cat === catIdx &&
                  selectedCell?.row === rowIdx;
                const isFilled = cellClue.kind !== 'empty';
                const hasAnswer = cellClue.answerKind && cellClue.answerKind !== 'empty';

                return (
                  <button
                    key={`${catIdx}-${rowIdx}`}
                    className={`editor-cell ${isSelected ? 'selected' : ''} ${isFilled ? 'filled' : ''}`}
                    onClick={() =>
                      setSelectedCell({ cat: catIdx, row: rowIdx })
                    }
                  >
                    <div className="cell-top">
                      <span className="cell-value">${cellClue.value}</span>
                      {hasAnswer && <span className="answer-badge">A</span>}
                      {cellClue.tip && <span className="tip-badge">💡</span>}
                    </div>
                    <span className="cell-kind-icon">{KIND_ICONS[cellClue.kind] || '?'}</span>
                    {!isFilled && <span className="cell-unfilled">+</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Bonus Question — standalone, worth its own value, separate from the board */}
      <div className="bonus-editor modal-section">
        <div className="section-header">
          <h3>⭐ Bonus Question</h3>
          <span className="section-hint">
            separate from the board — still an open buzzer race, just worth more
          </span>
        </div>

        <div className="bonus-value-row">
          <label htmlFor="bonus-value">Value</label>
          <span className="bonus-value-prefix">$</span>
          <input
            id="bonus-value"
            type="number"
            min="1"
            value={bonus.value}
            onChange={(e) => handleBonusValueChange(e.target.value)}
            className="bonus-value-input"
          />
        </div>

        <div className="content-input-group">
          <div className="section-hint">Clue — shown to everyone once launched</div>
          <textarea
            value={bonus.content || ''}
            onChange={(e) => handleBonusContentChange(e.target.value)}
            placeholder="Enter clue text, image URL, audio URL, or YouTube link"
            className="content-textarea"
          />
        </div>
        <div className="upload-actions">
          <button
            className="btn btn-secondary"
            onClick={() => bonusFileInputRef.current?.click()}
          >
            📤 Upload Image
          </button>
          <input
            ref={bonusFileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBonusImage(file, false);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </div>
        {bonus.kind !== 'empty' && (
          <div className="preview-section">
            <div className="preview-label">Preview</div>
            <MediaContent kind={bonus.kind} content={bonus.content} />
          </div>
        )}

        <div className="content-input-group">
          <div className="section-hint">Answer — shown after judging</div>
          <textarea
            value={bonus.answer || ''}
            onChange={(e) => handleBonusAnswerChange(e.target.value)}
            placeholder="Enter answer text, image URL, audio URL, or YouTube link"
            className="content-textarea"
          />
        </div>
        <div className="upload-actions">
          <button
            className="btn btn-secondary"
            onClick={() => bonusAnswerFileInputRef.current?.click()}
          >
            📤 Upload Image
          </button>
          <input
            ref={bonusAnswerFileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBonusImage(file, true);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </div>
        {(bonus.answerKind || 'empty') !== 'empty' && (
          <div className="preview-section">
            <div className="preview-label">Preview</div>
            <MediaContent kind={bonus.answerKind || 'empty'} content={bonus.answer || ''} />
          </div>
        )}

        <div className="content-input-group">
          <div className="section-hint">💡 Tip — optional hint, host reveals it on demand</div>
          <textarea
            value={bonus.tip || ''}
            onChange={(e) => handleBonusTipChange(e.target.value)}
            placeholder="Optional hint text, shown only when the host reveals it"
            className="content-textarea"
          />
        </div>
      </div>

      {/* Cell edit modal */}
      {selectedCell && clue && (
        <div className="editor-modal-overlay" onClick={() => setSelectedCell(null)}>
          <div
            className="editor-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                {categories[selectedCell.cat].name} - $
                {clue.value}
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedCell(null)}
              >
                ✕
              </button>
            </div>

            {/* CLUE Section */}
            <div className="modal-section">
              <div className="section-header">
                <h3>CLUE</h3>
                <span className="section-hint">shown to everyone</span>
              </div>

              <div className="content-input-group">
                <textarea
                  value={clue.content}
                  onChange={(e) =>
                    handleClueChange(
                      selectedCell.cat,
                      selectedCell.row,
                      e.target.value
                    )
                  }
                  onPaste={(e) =>
                    handlePaste(selectedCell.cat, selectedCell.row, e, false)
                  }
                  placeholder="Enter clue text, image URL, audio URL, or YouTube link"
                  className="content-textarea"
                />
              </div>

              <div className="kind-chips">
                {['TEXT', 'IMAGE', 'AUDIO', 'YOUTUBE'].map((kindLabel) => {
                  const kindLower = kindLabel.toLowerCase();
                  const isActive = clue.kind === kindLower;
                  return (
                    <div
                      key={kindLabel}
                      className={`kind-chip ${isActive ? 'active' : ''}`}
                    >
                      <span className="chip-icon">{KIND_ICONS[kindLower]}</span>
                      <span className="chip-text">{kindLabel}</span>
                    </div>
                  );
                })}
              </div>

              <div className="upload-actions">
                <button
                  className="btn btn-secondary"
                  onClick={triggerClueFileInput}
                >
                  📤 Upload Image
                </button>
                <input
                  ref={clueFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileInputChange(e, false)}
                  style={{ display: 'none' }}
                />
              </div>

              <div className="hint-line">
                💡 Paste text, an image (Ctrl+V or upload), an image/audio URL (.png .jpg .mp3 .ogg…), or a YouTube link
              </div>

              {clue.kind !== 'empty' && (
                <div className="preview-section">
                  <div className="preview-label">Preview</div>
                  <MediaContent kind={clue.kind} content={clue.content} />
                </div>
              )}
            </div>

            {/* ANSWER Section */}
            <div className="modal-section">
              <div className="section-header">
                <h3>ANSWER</h3>
                <span className="section-hint">shown after judging</span>
              </div>

              <div className="content-input-group">
                <textarea
                  value={clue.answer || ''}
                  onChange={(e) =>
                    handleAnswerChange(
                      selectedCell.cat,
                      selectedCell.row,
                      e.target.value
                    )
                  }
                  onPaste={(e) =>
                    handlePaste(selectedCell.cat, selectedCell.row, e, true)
                  }
                  placeholder="Enter answer text, image URL, audio URL, or YouTube link"
                  className="content-textarea"
                />
              </div>

              <div className="kind-chips">
                {['TEXT', 'IMAGE', 'AUDIO', 'YOUTUBE'].map((kindLabel) => {
                  const kindLower = kindLabel.toLowerCase();
                  const isActive = (clue.answerKind || 'empty') === kindLower;
                  return (
                    <div
                      key={`answer-${kindLabel}`}
                      className={`kind-chip ${isActive ? 'active' : ''}`}
                    >
                      <span className="chip-icon">{KIND_ICONS[kindLower]}</span>
                      <span className="chip-text">{kindLabel}</span>
                    </div>
                  );
                })}
              </div>

              <div className="upload-actions">
                <button
                  className="btn btn-secondary"
                  onClick={triggerAnswerFileInput}
                >
                  📤 Upload Image
                </button>
                <input
                  ref={answerFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileInputChange(e, true)}
                  style={{ display: 'none' }}
                />
              </div>

              <div className="hint-line">
                💡 Paste text, an image (Ctrl+V or upload), an image/audio URL (.png .jpg .mp3 .ogg…), or a YouTube link
              </div>

              {(clue.answerKind || 'empty') !== 'empty' && (
                <div className="preview-section">
                  <div className="preview-label">Preview</div>
                  <MediaContent kind={clue.answerKind || 'empty'} content={clue.answer || ''} />
                </div>
              )}
            </div>

            {/* TIP Section */}
            <div className="modal-section">
              <div className="section-header">
                <h3>💡 Tip</h3>
                <span className="section-hint">optional hint — host reveals it on demand</span>
              </div>

              <div className="content-input-group">
                <textarea
                  value={clue.tip || ''}
                  onChange={(e) =>
                    handleTipChange(
                      selectedCell.cat,
                      selectedCell.row,
                      e.target.value
                    )
                  }
                  placeholder="Optional hint text, shown only when the host reveals it"
                  className="content-textarea"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={() => setSelectedCell(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="editor-footer">
        <button className="btn btn-primary" onClick={onDone}>
          CLOSE EDITOR
        </button>
      </div>
    </div>
  );
}
