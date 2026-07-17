'use client';

import { useState } from 'react';

export default function Grid({ game, isOwner, persistedName, persistedRoom }) {
  const [selectedCell, setSelectedCell] = useState(null);

  const handleCellClick = async (catIdx, rowIdx) => {
    if (!isOwner) return;
    const clue = game.categories[catIdx].clues[rowIdx];
    if (clue.used) return;

    // Select the clue to open it
    await fetch('/api/clue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: persistedRoom,
        name: persistedName,
        cat: catIdx,
        row: rowIdx,
      }),
    });
  };

  if (!game || !game.categories) {
    return <div className="grid" />;
  }

  const categories = game.categories;

  return (
    <div className="grid">
      <div className="grid-header">
        {categories.map((cat, idx) => (
          <div key={idx} className="category-header">
            {cat.name}
          </div>
        ))}
      </div>
      <div className="grid-body">
        {[0, 1, 2, 3, 4].map((rowIdx) => (
          <div key={rowIdx} className="grid-row">
            {categories.map((cat, catIdx) => {
              const clue = cat.clues[rowIdx];
              const isFilled = clue.kind !== 'empty';
              const isUsed = clue.used;
              const isClickable = isOwner && !isUsed && isFilled;

              return (
                <button
                  key={`${catIdx}-${rowIdx}`}
                  className={`grid-cell ${isUsed ? 'used' : ''} ${!isFilled ? 'unfilled' : ''} ${isClickable ? 'clickable' : ''}`}
                  onClick={() => handleCellClick(catIdx, rowIdx)}
                  disabled={!isClickable}
                >
                  {isFilled && !isUsed && (
                    <span className="cell-value">${clue.value}</span>
                  )}
                  {isUsed && <span className="cell-used">✓</span>}
                  {!isFilled && <span className="cell-unfilled">?</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
