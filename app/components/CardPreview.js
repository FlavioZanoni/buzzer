'use client';

import { useState, useEffect } from 'react';
import MediaContent from './MediaContent';

// Host-only, local mock of the in-game clue and answer screens, so the
// host can check how a card looks without opening it (which would use it).
export default function CardPreview({ category, value, isBonus, item, onClose }) {
  const hasAnswer = (item.answerKind || 'empty') !== 'empty';
  const [side, setSide] = useState(item.kind !== 'empty' || !hasAnswer ? 'clue' : 'answer');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = isBonus ? 'BONUS QUESTION' : category || 'Category';

  return (
    <div className="clue-overlay card-preview-overlay">
      <div className="card-preview-bar">
        <span className="card-preview-label">👁 Preview — only you see this</span>
        <div className="adjuster-options">
          <button
            className={`adjuster-chip ${side === 'clue' ? 'active' : ''}`}
            onClick={() => setSide('clue')}
          >
            Clue
          </button>
          <button
            className={`adjuster-chip ${side === 'answer' ? 'active' : ''}`}
            onClick={() => setSide('answer')}
          >
            Answer
          </button>
        </div>
        <button className="btn btn-primary card-preview-close" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      {side === 'clue' ? (
        <div className="clue-container">
          <div className="clue-header">
            <div className="clue-title">
              {isBonus && <span className="bonus-tag">⭐ BONUS</span>}
              <span className="category-name">{title}</span>
              <span className="clue-value">${value}</span>
            </div>
          </div>
          <div className="clue-content">
            <MediaContent kind={item.kind} content={item.content} view={item.view} />
          </div>
          {item.tip && (
            <div className="clue-tip">
              <div className="clue-tip-text">💡 {item.tip}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="reveal-container">
          <div className="reveal-header">
            <div className="reveal-title">
              <span className="reveal-label">THE ANSWER</span>
              <span className="reveal-category">{title}</span>
              <span className="reveal-value">${value}</span>
            </div>
          </div>
          <div className="reveal-content">
            <MediaContent
              kind={item.answerKind || 'empty'}
              content={item.answer || ''}
              view={item.answerView}
            />
          </div>
        </div>
      )}
    </div>
  );
}
