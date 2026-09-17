import type { InputEvent, ParseIssue, ParseResult } from './types';
import { canonicalize } from './deep';

/**
 * 解析粘贴的 NDJSON 文本。
 *
 * 每行必须是形如 {"stream": ..., "sequence": ..., "payload": ...} 的 JSON 对象。
 * 空行忽略；任何非法行收集为 issue，不影响其它行解析。
 *
 * 校验规则：
 *  - stream 必须是非空字符串（数字会被强制转成字符串以便容错）
 *  - sequence 必须是有限整数
 *  - payload 可由任意 JSON 值构成（含 null / 数组 / 标量）
 */
export function parseNDJSON(text: string): ParseResult {
  const events: InputEvent[] = [];
  const issues: ParseIssue[] = [];
  let nonEmptyLines = 0;

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const raw = rawLine.trim();
    if (raw === '') return;
    nonEmptyLines += 1;
    const line = index + 1;

    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch (err) {
      issues.push({ line, raw, message: `JSON 解析失败：${(err as Error).message}` });
      return;
    }

    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      issues.push({ line, raw, message: '每行必须是 JSON 对象' });
      return;
    }

    const record = obj as Record<string, unknown>;
    const streamError = validateStream(record.stream);
    if (streamError) {
      issues.push({ line, raw, message: streamError });
      return;
    }
    const seqError = validateSequence(record.sequence);
    if (seqError) {
      issues.push({ line, raw, message: seqError });
      return;
    }
    if (!('payload' in record)) {
      issues.push({ line, raw, message: '缺少 payload 字段' });
      return;
    }

    events.push({
      stream: String(record.stream),
      sequence: Number(record.sequence),
      payload: record.payload,
      line,
    });
  });

  return { events, issues, nonEmptyLines };
}

function validateStream(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? 'stream 不能为空字符串' : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return null; // 容错：数字流名解析时转为字符串
  }
  return 'stream 必须是字符串';
}

function validateSequence(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'sequence 必须是有限数字';
  }
  if (!Number.isInteger(value)) {
    return 'sequence 必须是整数';
  }
  return null;
}

/** 导出时回写为 NDJSON（payload 保持紧凑 JSON）。 */
export function toNDJSON(
  rows: Array<{ stream: string; sequence: number; payload: unknown }>,
): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

/** 仅供测试与 UI 预览使用：规范化后的 JSON（key 排序、缩进 2 格）。 */
export function prettyCanonical(payload: unknown): string {
  return JSON.stringify(
    JSON.parse(canonicalize(payload)),
    null,
    2,
  );
}
