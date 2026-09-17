import { useMemo, useState } from 'react';
import { InputPanel } from './components/InputPanel';
import { StreamCard } from './components/StreamCard';
import { ExportPanel } from './components/ExportPanel';
import { buildModel, collectConfirmed, computeReport, defaultStart, resolutionKey } from './core/model';
import { parseNDJSON } from './core/ndjson';
import { SAMPLE_NDJSON } from './sample';
import type { InputEvent, ParseIssue, Resolutions, StartOverrides } from './core/types';

export default function App() {
  const [text, setText] = useState('');
  const [events, setEvents] = useState<InputEvent[]>([]);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [nonEmptyLines, setNonEmptyLines] = useState(0);
  const [parsed, setParsed] = useState(false);
  const [starts, setStarts] = useState<StartOverrides>({});
  const [resolutions, setResolutions] = useState<Resolutions>({});

  const analyze = () => {
    const result = parseNDJSON(text);
    setEvents(result.events);
    setIssues(result.issues);
    setNonEmptyLines(result.nonEmptyLines);
    setParsed(true);
    // 输入可能变化：裁决与起始序号在重算时重新校验，保留仍然有效的部分
    setResolutions((prev) => pruneResolutions(prev, result.events));
  };

  const loadSample = () => {
    setText(SAMPLE_NDJSON);
    const result = parseNDJSON(SAMPLE_NDJSON);
    setEvents(result.events);
    setIssues(result.issues);
    setNonEmptyLines(result.nonEmptyLines);
    setParsed(true);
    setStarts({});
    setResolutions({});
  };

  const clearAll = () => {
    setText('');
    setEvents([]);
    setIssues([]);
    setNonEmptyLines(0);
    setParsed(false);
    setStarts({});
    setResolutions({});
  };

  const models = useMemo(() => buildModel(events), [events]);

  const reports = useMemo(
    () =>
      models.map((model) =>
        computeReport(model, starts[model.stream] ?? defaultStart(model), resolutions),
      ),
    [models, starts, resolutions],
  );

  const confirmed = useMemo(
    () => collectConfirmed(reports, resolutions),
    [reports, resolutions],
  );

  const stats = useMemo(() => {
    const conflictCount = models.reduce(
      (sum, m) => sum + m.slots.filter((s) => s.status === 'conflict').length,
      0,
    );
    const gapCount = reports.reduce((sum, r) => sum + r.gaps.length, 0);
    const blockedCount = reports.filter((r) => r.state !== 'clean').length;
    return { streamCount: models.length, conflictCount, gapCount, blockedCount };
  }, [models, reports]);

  const chooseVersion = (stream: string, sequence: number, canonical: string) => {
    setResolutions((prev) => ({ ...prev, [resolutionKey(stream, sequence)]: canonical }));
  };

  const undoChoice = (stream: string, sequence: number) => {
    setResolutions((prev) => {
      const next = { ...prev };
      delete next[resolutionKey(stream, sequence)];
      return next;
    });
  };

  const changeStart = (stream: string, start: number) => {
    setStarts((prev) => ({ ...prev, [stream]: start }));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>事件序列修复台</h1>
        <p className="subtitle">
          离线 NDJSON 事件修复 · 同流同序号载荷深比较、冲突裁决、缺口阻断
        </p>
        <div className="stats">
          <span className="stat">流 <strong>{stats.streamCount}</strong></span>
          <span className="stat">冲突 <strong className={stats.conflictCount ? 'bad' : ''}>{stats.conflictCount}</strong></span>
          <span className="stat">缺口 <strong className={stats.gapCount ? 'bad' : ''}>{stats.gapCount}</strong></span>
          <span className="stat">被阻断流 <strong className={stats.blockedCount ? 'bad' : ''}>{stats.blockedCount}</strong></span>
          <span className="stat">可导出 <strong className="ok">{confirmed.length}</strong></span>
        </div>
      </header>

      <main className="layout">
        <div className="col-left">
          <InputPanel
            text={text}
            onTextChange={setText}
            onAnalyze={analyze}
            onLoadSample={loadSample}
            onClear={clearAll}
            issues={issues}
            nonEmptyLines={nonEmptyLines}
            parsed={parsed}
          />
          <ExportPanel confirmed={confirmed} blockedStreamCount={stats.blockedCount} />
        </div>

        <div className="col-right">
          <section className="panel">
            <div className="panel-head">
              <h2>② 各流缺口与冲突</h2>
              <div className="hint">选择一个冲突版本或撤销选择，结果立即重新计算</div>
            </div>
            {models.length === 0 ? (
              <div className="empty-streams">
                粘贴数据后点击「分析」，或「载入示例」体验完整流程。
              </div>
            ) : (
              <div className="stream-list">
                {reports.map((report) => (
                  <StreamCard
                    key={report.stream}
                    report={report}
                    resolutions={resolutions}
                    onChooseVersion={chooseVersion}
                    onUndo={undoChoice}
                    onStartChange={changeStart}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="app-footer">
        所有解析、比较与导出均在当前浏览器内完成，不发送任何网络请求。
      </footer>
    </div>
  );
}

/** 重新分析后丢弃指向已消失槽位或版本的裁决。 */
function pruneResolutions(prev: Resolutions, events: InputEvent[]): Resolutions {
  const models = buildModel(events);
  const next: Resolutions = {};
  for (const model of models) {
    for (const slot of model.slots) {
      if (slot.status !== 'conflict') continue;
      const key = resolutionKey(slot.stream, slot.sequence);
      const canonical = prev[key];
      if (canonical && slot.versions.some((v) => v.canonical === canonical)) {
        next[key] = canonical;
      }
    }
  }
  return next;
}
