import type { ParseIssue } from '../core/types';

interface InputPanelProps {
  text: string;
  onTextChange: (text: string) => void;
  onAnalyze: () => void;
  onLoadSample: () => void;
  onClear: () => void;
  issues: ParseIssue[];
  nonEmptyLines: number;
  parsed: boolean;
}

export function InputPanel({
  text,
  onTextChange,
  onAnalyze,
  onLoadSample,
  onClear,
  issues,
  nonEmptyLines,
  parsed,
}: InputPanelProps) {
  return (
    <section className="panel input-panel">
      <div className="panel-head">
        <h2>① 粘贴 NDJSON 事件</h2>
        <div className="hint">每行一条，包含 stream / sequence / payload，仅在浏览器本地解析</div>
      </div>

      <textarea
        className="ndjson-input"
        spellCheck={false}
        placeholder={'{"stream":"orders","sequence":1,"payload":{"id":"o-100"}}\n{"stream":"orders","sequence":2,...}'}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
      />

      <div className="toolbar">
        <button className="btn primary" onClick={onAnalyze} disabled={text.trim() === ''}>
          分析 / 重新计算
        </button>
        <button className="btn" onClick={onLoadSample}>
          载入示例
        </button>
        <button className="btn" onClick={onClear} disabled={text === ''}>
          清空
        </button>
        <span className="toolbar-meta">
          非空行 {nonEmptyLines}
          {parsed && issues.length > 0 && (
            <span className="warn"> · {issues.length} 行无法解析</span>
          )}
        </span>
      </div>

      {parsed && issues.length > 0 && (
        <details className="issues" open>
          <summary>无法解析的行（{issues.length}）</summary>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>
                <span className="line-no">第 {issue.line} 行</span>
                <span className="issue-msg">{issue.message}</span>
                <code className="issue-raw">{issue.raw.length > 120 ? `${issue.raw.slice(0, 120)}…` : issue.raw}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
