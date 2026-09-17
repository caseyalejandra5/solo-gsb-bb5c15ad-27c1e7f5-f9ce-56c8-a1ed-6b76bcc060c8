import { prettyCanonical } from '../core/ndjson';
import type { SequenceSlot } from '../core/types';

interface ConflictBlockProps {
  slot: SequenceSlot;
  chosen: string | undefined;
  valid: boolean;
  onChoose: (canonical: string) => void;
  onUndo: () => void;
}

/** 一个冲突序号：列出候选 payload 版本，支持单选裁决与撤销。 */
export function ConflictBlock({ slot, chosen, valid, onChoose, onUndo }: ConflictBlockProps) {
  const name = `conflict-${slot.stream}-${slot.sequence}`;
  const effective = valid ? chosen : undefined;

  return (
    <div className={`conflict ${valid ? 'resolved' : 'open'}`}>
      <div className="conflict-head">
        <span className="conflict-seq">#{slot.sequence}</span>
        <span className={`conflict-state ${valid ? 'ok' : 'bad'}`}>
          {valid ? '已裁决' : `未裁决 · ${slot.versions.length} 个候选版本`}
        </span>
        <span className="conflict-lines">行 {slot.lines.join(', ')}</span>
        {valid && (
          <button className="btn tiny" onClick={onUndo}>
            撤销选择
          </button>
        )}
      </div>
      <div className="versions">
        {slot.versions.map((version, idx) => {
          const checked = effective === version.canonical;
          return (
            <label key={version.canonical} className={`version ${checked ? 'picked' : ''}`}>
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => onChoose(version.canonical)}
              />
              <div className="version-body">
                <div className="version-meta">
                  版本 {String.fromCharCode(65 + idx)} · 出现 {version.count} 次 · 行{' '}
                  {version.lines.join(', ')}
                </div>
                <pre className="payload">{prettyCanonical(version.payload)}</pre>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
