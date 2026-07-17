'use client';

import { useState, useEffect, useRef } from 'react';

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

  const handleCellChange = (catIdx, rowIdx, newContent) => {
    const updated = [...categories];
    updated[catIdx].clues[rowIdx].content = newContent;
    updated[catIdx].clues[rowIdx].kind = detectKind(newContent);
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

  const uploadImage = async (file, catIdx, rowIdx) => {
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
      handleCellChange(catIdx, rowIdx, json.url);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Image upload failed');
    }
  };

  const handlePaste = async (catIdx, rowIdx, e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        e.preventDefault();
        uploadImage(file, catIdx, rowIdx);
        return;
      }
    }
  };

  const handleFileInputChange = async (e) => {
    if (!selectedCell) return;

    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file, selectedCell.cat, selectedCell.row);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  if (loading) {
    return <div className="container entry-screen"><div>Loading board...</div></div>;
  }

  return (
    <div className="container editor-screen">
      <div className="editor-header">
        <h1>EDIT BOARD</h1>
        {saved && <div className="saved-indicator">Saved</div>}
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
          {[0, 1, 2, 3, 4].map((rowIdx) => (
            <div key={rowIdx} className="editor-row">
              {categories.map((cat, catIdx) => {
                const clue = cat.clues[rowIdx];
                const isSelected =
                  selectedCell?.cat === catIdx &&
                  selectedCell?.row === rowIdx;
                const preview = clue.content
                  .substring(0, 20)
                  .replace(/\n/g, ' ');

                return (
                  <button
                    key={`${catIdx}-${rowIdx}`}
                    className={`editor-cell ${isSelected ? 'selected' : ''} ${clue.content ? 'filled' : ''}`}
                    onClick={() =>
                      setSelectedCell({ cat: catIdx, row: rowIdx })
                    }
                  >
                    {clue.content && (
                      <span className="cell-preview">{preview}</span>
                    )}
                    <span className="cell-kind">{clue.kind}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Cell edit panel */}
        {selectedCell && (
          <div className="editor-edit-panel">
            <div className="edit-panel-header">
              <span>
                Edit {categories[selectedCell.cat].name} - $
                {categories[selectedCell.cat].clues[selectedCell.row].value}
              </span>
              <button
                className="close-btn"
                onClick={() => setSelectedCell(null)}
              >
                ✕
              </button>
            </div>
            <textarea
              value={
                categories[selectedCell.cat].clues[selectedCell.row].content
              }
              onChange={(e) =>
                handleCellChange(
                  selectedCell.cat,
                  selectedCell.row,
                  e.target.value
                )
              }
              onPaste={(e) =>
                handlePaste(selectedCell.cat, selectedCell.row, e)
              }
              placeholder="Enter clue content (text, URL for image/audio, or YouTube URL)"
              className="edit-textarea"
            />
            <div className="edit-panel-footer">
              <span className="kind-label">
                Type:{' '}
                {detectKind(
                  categories[selectedCell.cat].clues[selectedCell.row]
                    .content
                )}
              </span>
              <button className="upload-btn" onClick={triggerFileInput}>
                Upload image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="editor-footer">
        <button className="done-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
