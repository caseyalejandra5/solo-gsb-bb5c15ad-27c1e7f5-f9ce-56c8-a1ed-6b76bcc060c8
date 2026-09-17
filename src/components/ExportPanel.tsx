import { useState } from 'react';
import type { ConfirmedEvent } from '../core/types';
import { toNDJSON } from '../core/ndjson';

interface ExportPanelProps {
  confirmed: ConfirmedEvent[];
  blockedStreamCount: number;
}

/** 导出条：仅包含各流已确认连续前缀内的事件，按流名、序号排序。 */
export function ExportPanel({ confirmed, blockedStreamCount }: ExportPanelProps) {
  const [copied, setCopied] = useState(false);

  const text = confirmed.length > 0 ? `${toNDJSON(confirmed)}\n` : '';

  const download = () => {
    const blob = new Blob([text], { type: 'application/x-ndjson;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `confirmed-events-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="panel export-panel">
      <div className="panel-head export-head">
        <div>
          <h2>③ 导出已确认连续事件</h2>
          <div className="hint">
            仅导出连续前缀内的事件；排序：stream 升序 → sequence 升序
          </div>
        </div>
        <div className="export-actions">
          <button className="btn primary" onClick={download} disabled={confirmed.length === 0}>
            下载 NDJSON
          </button>
          <button className="btn" onClick={copy} disabled={confirmed.length === 0 || !navigator.clipboard}>
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      <div className="export-summary">
        <span className="big-num">{confirmed.length}</span> 条已确认事件
        {blockedStreamCount > 0 && (
          <span className="warn"> · {blockedStreamCount} 条流仍被阻断，其后事件未包含</span>
        )}
      </div>

      {confirmed.length > 0 ? (
        <pre className="export-preview">{text}</pre>
      ) : (
        <div className="empty-export">尚无可用事件——先解决缺口与冲突。</div>
      )}
    </section>
  );
}
