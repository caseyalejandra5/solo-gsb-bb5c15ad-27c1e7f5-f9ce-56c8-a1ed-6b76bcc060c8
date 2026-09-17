import { isResolved } from '../core/model';
import type { Resolutions, StreamReport } from '../core/types';
import { ConflictBlock } from './ConflictBlock';

interface StreamCardProps {
  report: StreamReport;
  resolutions: Resolutions;
  onChooseVersion: (stream: string, sequence: number, canonical: string) => void;
  onUndo: (stream: string, sequence: number) => void;
  onStartChange: (stream: string, start: number) => void;
}

const STATE_LABEL: Record<StreamReport['state'], { text: string; cls: string }> = {
  clean: { text: '连续完整', cls: 'state-clean' },
  'blocked-gap': { text: '缺号阻断', cls: 'state-gap' },
  'blocked-conflict': { text: '冲突阻断', cls: 'state-conflict' },
};

function compactList(nums: number[], max = 12): string {
  if (nums.length <= max) return nums.join(', ');
  return `${nums.slice(0, max).join(', ')} …（共 ${nums.length} 个）`;
}

export function StreamCard({
  report,
  resolutions,
  onChooseVersion,
  onUndo,
  onStartChange,
}: StreamCardProps) {
  const { model, state } = report;
  const stateInfo = STATE_LABEL[state];
  const prefixCount = Math.max(0, report.prefixEnd - report.prefixStart + 1);
  const conflictSlots = model.slots.filter((s) => s.status === 'conflict');
  const folded = model.slots.filter(
    (s) => s.status === 'single' && s.versions[0].count > 1,
  );
  const totalRaw = model.slots.reduce((count, s) => count + s.lines.length, 0);

  return (
    <section className={`panel stream-card ${stateInfo.cls}`}>
      <header className="stream-head">
        <div className="stream-title">
          <h3>{report.stream}</h3>
          <span className={`badge ${stateInfo.cls}`}>{stateInfo.text}</span>
        </div>
        <label className="start-edit">
          起始序号
          <input
            type="number"
            step={1}
            value={report.start}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(value)) onStartChange(report.stream, value);
            }}
          />
        </label>
      </header>

      <div className="stream-meta">
        <span>观测序号 {model.min}–{model.max}</span>
        <span>槽位 {model.slots.length}</span>
        <span>原始记录 {totalRaw}</span>
        {folded.length > 0 && (
          <span className="fold-info">
            折叠重复 {folded.length} 个序号（
            {folded
              .slice(0, 6)
              .map((s) => `#${s.sequence}×${s.versions[0].count}`)
              .join('，')}
            {folded.length > 6 ? ' …' : ''}）
          </span>
        )}
      </div>

      <div className="prefix-box">
        <div className="prefix-line">
          当前连续前缀：
          {prefixCount > 0 ? (
            <strong>
              #{report.prefixStart} → #{report.prefixEnd}
            </strong>
          ) : (
            <strong className="warn">空（起点即被阻断）</strong>
          )}
          <span className="prefix-count">{prefixCount} 条可导出</span>
        </div>
        {report.blockingAt !== null && (
          <div className="blocking-line">
            阻断点 <strong>#{report.blockingAt}</strong>：
            {report.blockingReason === 'gap' ? '该序号缺失' : '冲突尚未裁决'}
            {report.blockedPresent.length > 0 && (
              <>
                ；其后序号暂挂：
                <span className="blocked-seqs">{compactList(report.blockedPresent)}</span>
              </>
            )}
          </div>
        )}
      </div>

      {report.gaps.length > 0 && (
        <div className="gaps-box">
          <h4>缺口（{report.gaps.length}）</h4>
          <div className="gap-chips">
            {report.gaps.map((seq) => (
              <span key={seq} className={`chip ${seq === report.blockingAt ? 'chip-hot' : ''}`}>
                #{seq}
              </span>
            ))}
          </div>
        </div>
      )}

      {conflictSlots.length > 0 && (
        <div className="conflicts-box">
          <h4>
            冲突候选（{conflictSlots.length}
            {report.unresolvedConflicts.length > 0 &&
              `，其中 ${report.unresolvedConflicts.length} 个未裁决`}
            ）
          </h4>
          {conflictSlots.map((slot) => {
            const valid = isResolved(slot, resolutions);
            const chosen =
              resolutions[`${slot.stream} ${slot.sequence}`];
            const isBlocker = report.blockingAt === slot.sequence;
            const behind =
              report.blockingAt !== null &&
              slot.sequence > report.blockingAt &&
              report.blockingReason === 'gap';
            return (
              <div key={slot.sequence} className="conflict-wrap">
                {isBlocker && <div className="tag tag-blocker">阻断点</div>}
                {behind && !valid && <div className="tag tag-behind">缺号之后</div>}
                <ConflictBlock
                  slot={slot}
                  chosen={chosen}
                  valid={valid}
                  onChoose={(canonical) =>
                    onChooseVersion(slot.stream, slot.sequence, canonical)
                  }
                  onUndo={() => onUndo(slot.stream, slot.sequence)}
                />
              </div>
            );
          })}
        </div>
      )}

      {conflictSlots.length === 0 && report.gaps.length === 0 && (
        <div className="all-good">该流无缺口、无冲突，全部事件均已确认。</div>
      )}
    </section>
  );
}
