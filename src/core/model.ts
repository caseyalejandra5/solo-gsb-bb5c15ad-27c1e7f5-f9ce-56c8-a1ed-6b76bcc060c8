import { canonicalize } from './deep';
import type {
  ConfirmedEvent,
  InputEvent,
  PayloadVersion,
  Resolutions,
  SequenceSlot,
  StreamModel,
  StreamReport,
  StreamState,
} from './types';

export const resolutionKey = (stream: string, sequence: number): string =>
  `${stream} ${sequence}`;

/**
 * 将扁平事件列表构建为每流模型。
 * 同流同序号按 canonical payload 折叠为版本。
 */
export function buildModel(events: InputEvent[]): StreamModel[] {
  const byStream = new Map<string, InputEvent[]>();
  for (const ev of events) {
    const list = byStream.get(ev.stream);
    if (list) list.push(ev);
    else byStream.set(ev.stream, [ev]);
  }

  const models: StreamModel[] = [];
  for (const [stream, list] of byStream) {
    const slotMap = new Map<number, SequenceSlot>();
    for (const ev of list) {
      let slot = slotMap.get(ev.sequence);
      if (!slot) {
        slot = {
          stream,
          sequence: ev.sequence,
          status: 'single',
          versions: [],
          lines: [],
        };
        slotMap.set(ev.sequence, slot);
      }
      addOccurrence(slot, ev);
    }

    const slots = [...slotMap.values()].sort((a, b) => a.sequence - b.sequence);
    for (const slot of slots) {
      slot.versions.sort(
        (a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical),
      );
      slot.lines = slot.versions.flatMap((v) => v.lines).sort((a, b) => a - b);
      slot.status = slot.versions.length > 1 ? 'conflict' : 'single';
    }

    const sequences = new Set(slots.map((s) => s.sequence));
    models.push({
      stream,
      slots,
      sequences,
      min: slots[0]?.sequence ?? 0,
      max: slots[slots.length - 1]?.sequence ?? 0,
    });
  }

  models.sort((a, b) => a.stream.localeCompare(b.stream));
  return models;
}

function addOccurrence(slot: SequenceSlot, ev: InputEvent): void {
  const canonical = canonicalize(ev.payload);
  let version = slot.versions.find((v) => v.canonical === canonical);
  if (!version) {
    version = { canonical, payload: ev.payload, lines: [], count: 0 };
    slot.versions.push(version);
  }
  version.count += 1;
  version.lines.push(ev.line);
}

/** 新流首次出现时建议的起始序号（取其最小序号）。 */
export function defaultStart(model: StreamModel): number {
  return model.min;
}

/**
 * 计算某条流的缺口 / 冲突 / 连续前缀报告。
 *
 * 扫描窗口为 [start, model.max]（start 小于最小序号时提前到最小序号）：
 *  - 序号缺失：记为缺号，立即阻断；
 *  - 序号存在但为未裁决冲突：立即阻断；
 *  - 序号存在且载荷唯一 / 冲突已裁决（选中版本仍存在）：连续前缀加一。
 * start 之前的内容不参与前缀，也不计入缺口。
 */
export function computeReport(
  model: StreamModel,
  start: number,
  resolutions: Resolutions,
): StreamReport {
  const gaps: number[] = [];
  const unresolvedConflicts: SequenceSlot[] = [];
  const blockedPresent: number[] = [];
  let blockingAt: number | null = null;
  let blockingReason: StreamReport['blockingReason'] = null;
  const scanStart = Math.min(start, model.min);
  const scanEnd = Math.max(start, model.max);
  let prefixEnd = start - 1;
  let blocked = false;

  for (let seq = scanStart; seq <= scanEnd; seq++) {
    if (seq < start) {
      // 用户配置的起点之前：不参与连续前缀，也不算缺口
      continue;
    }

    if (blocked) {
      if (model.sequences.has(seq)) blockedPresent.push(seq);
      else gaps.push(seq);
      continue;
    }

    if (!model.sequences.has(seq)) {
      gaps.push(seq);
      blocked = true;
      blockingAt = seq;
      blockingReason = 'gap';
      continue;
    }

    const slot = model.slots.find((s) => s.sequence === seq)!;
    if (slot.status === 'conflict' && !isResolved(slot, resolutions)) {
      unresolvedConflicts.push(slot);
      blocked = true;
      blockingAt = seq;
      blockingReason = 'conflict';
      continue;
    }

    prefixEnd = seq;
  }

  const state: StreamState =
    blockingReason === 'gap'
      ? 'blocked-gap'
      : blockingReason === 'conflict'
        ? 'blocked-conflict'
        : 'clean';

  return {
    stream: model.stream,
    start,
    end: model.max,
    state,
    prefixStart: start,
    prefixEnd,
    gaps,
    blockingAt,
    blockingReason,
    unresolvedConflicts,
    blockedPresent,
    model,
  };
}

/** 裁决是否有效：选中的 canonical 仍在当前版本集合中。 */
export function isResolved(slot: SequenceSlot, resolutions: Resolutions): boolean {
  if (slot.status !== 'conflict') return false;
  const chosen = resolutions[resolutionKey(slot.stream, slot.sequence)];
  return chosen !== undefined && slot.versions.some((v) => v.canonical === chosen);
}

/**
 * 汇总所有流的已确认连续事件（导出数据源）。
 * 排序：先按流名字典序，再按序号升序。
 */
export function collectConfirmed(
  reports: StreamReport[],
  resolutions: Resolutions,
): ConfirmedEvent[] {
  const out: ConfirmedEvent[] = [];
  for (const report of [...reports].sort((a, b) => a.stream.localeCompare(b.stream))) {
    for (let seq = report.prefixStart; seq <= report.prefixEnd; seq++) {
      const slot = report.model.slots.find((s) => s.sequence === seq);
      if (!slot) continue;
      const { payload, count, resolved } = pickPayload(slot, resolutions);
      out.push({
        stream: report.stream,
        sequence: seq,
        payload,
        duplicateCount: count,
        resolved,
      });
    }
  }
  return out;
}

export function pickPayload(
  slot: SequenceSlot,
  resolutions: Resolutions,
): { payload: unknown; count: number; resolved: boolean } {
  if (slot.status === 'conflict') {
    const chosen = resolutions[resolutionKey(slot.stream, slot.sequence)];
    const version =
      slot.versions.find((v) => v.canonical === chosen) ?? slot.versions[0];
    return { payload: version.payload, count: version.count, resolved: true };
  }
  const version: PayloadVersion = slot.versions[0];
  return { payload: version.payload, count: version.count, resolved: false };
}
