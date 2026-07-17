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

  // Image data URL or image URL
  if (
    content.startsWith('data:image') ||
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

  const handlePaste = (catIdx, rowIdx, e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          if (dataUrl.length > 1500000) {
            alert('Image too big, use a URL');
            return;
          }
          handleCellChange(catIdx, rowIdx, dataUrl);
        };
        reader.readAsDataURL(file);
        e.preventDefault();
        return;
      }
    }
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
