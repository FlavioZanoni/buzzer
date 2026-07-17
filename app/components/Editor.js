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

const KIND_ICONS = {
  empty: '∅',
  text: '📝',
  image: '🖼️',
  audio: '🔊',
  youtube: '▶️',
};

export default function Editor({
  game,
  persistedName,
  persistedRoom,
  onDone,
}) {
  const [categories, setCategories] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const clueFileInputRef = useRef(null);
  const answerFileInputRef = useRef(null);

  // Load full board on mount
  useEffect(() => {
    const loadBoard = async () => {
      try {
        const res = await fetch(
          `/api/board?room=${persistedRoom}&name=${encodeURIComponent(persistedName)}`
        );
        const { game: fullGame } = await res.json();
        setCategories(fullGame.categories);
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
    setCategories(updated);
    triggerSave(updated);
  };

  const handleClueChange = (catIdx, rowIdx, newContent) => {
    const updated = [...categories];
    updated[catIdx].clues[rowIdx].content = newContent;
    updated[catIdx].clues[rowIdx].kind = detectKind(newContent);
    setCategories(updated);
    triggerSave(updated);
  };

  const handleAnswerChange = (catIdx, rowIdx, newContent) => {
    const updated = [...categories];
    updated[catIdx].clues[rowIdx].answer = newContent;
    updated[catIdx].clues[rowIdx].answerKind = detectKind(newContent);
    setCategories(updated);
    triggerSave(updated);
  };

  const triggerSave = (categoriesToSave) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave(categoriesToSave);
    }, 800);
  };

  const performSave = async (categoriesToSave) => {
    try {
      await fetch('/api/board', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room: persistedRoom,
          name: persistedName,
          categories: categoriesToSave.map((cat) => ({
            name: cat.name,
            clues: cat.clues.map((clue) => ({
              kind: clue.kind,
              content: clue.content,
              answerKind: clue.answerKind || 'empty',
              answer: clue.answer || '',
            })),
          })),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  const uploadImage = async (file, catIdx, rowIdx, isAnswer = false) => {
    // Client-side size check
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large (max 5MB)');
      return;
    }

    // Upload the image
    try {
      const response = await fetch(
        `/api/image?room=${persistedRoom}&name=${encodeURIComponent(persistedName)}`,
        {
          method: 'POST',
          headers: { 'content-type': file.type },
          body: file,
        }
      );

      if (!response.ok) {
        alert('Image upload failed');
        return;
      }

      const json = await response.json();
      if (isAnswer) {
        handleAnswerChange(catIdx, rowIdx, json.url);
      } else {
        handleClueChange(catIdx, rowIdx, json.url);
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Image upload failed');
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
            used: false,
          });
        } else {
          c.clues.pop();
        }
      });
    }
    setSelectedCell(null);
    setCategories(updated);
    triggerSave(updated);
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
