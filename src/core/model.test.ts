import { describe, expect, it } from 'vitest';
import { canonicalize, deepEqual } from './deep';
import { buildModel, collectConfirmed, computeReport, resolutionKey } from './model';
import { parseNDJSON, toNDJSON } from './ndjson';
import type { InputEvent, Resolutions } from './types';

describe('deepEqual / canonicalize', () => {
  it('忽略对象 key 顺序，按结构比较', () => {
    expect(deepEqual({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 })).toBe(true);
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('区分不同结构', () => {
    expect(deepEqual({ a: 1 }, { a: '1' })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(deepEqual(null, 0)).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
  });
});

describe('parseNDJSON', () => {
  it('解析合法行并报告非法行', () => {
    const text = [
      '{"stream":"a","sequence":1,"payload":{"x":1}}',
      'not json',
      '{"stream":"a","sequence":2}',
      '{"stream":"a","sequence":"x","payload":1}',
      '',
      '  ',
      '{"stream":"b","sequence":0,"payload":[1,true,null]}',
    ].join('\n');

    const result = parseNDJSON(text);
    expect(result.events).toHaveLength(2);
    expect(result.issues).toHaveLength(3);
    expect(result.nonEmptyLines).toBe(5);
    expect(result.events[1]).toMatchObject({ stream: 'b', sequence: 0 });
  });

  it('容错数字 stream（转为字符串）', () => {
    const result = parseNDJSON('{"stream":7,"sequence":1,"payload":null}');
    expect(result.events[0].stream).toBe('7');
  });
});

describe('buildModel：折叠与冲突', () => {
  const events: InputEvent[] = [
    { stream: 'a', sequence: 1, payload: { x: 1 }, line: 1 },
    { stream: 'a', sequence: 1, payload: { x: 1 }, line: 2 }, // 完全重复
    { stream: 'a', sequence: 1, payload: { x: 2 }, line: 3 }, // 冲突
    { stream: 'a', sequence: 2, payload: 'p', line: 4 },
  ];

  const model = buildModel(events)[0];

  it('同载荷折叠为一个版本并计数', () => {
    const slot1 = model.slots[0];
    expect(slot1.status).toBe('conflict');
    expect(slot1.versions).toHaveLength(2);
    const v1 = slot1.versions.find((v) => v.count === 2)!;
    expect(v1.lines).toEqual([1, 2]);
  });

  it('单载荷槽位状态为 single', () => {
    expect(model.slots[1].status).toBe('single');
  });
});

describe('computeReport：缺口与冲突阻断', () => {
  const events: InputEvent[] = [
    { stream: 'a', sequence: 1, payload: 1, line: 1 },
    { stream: 'a', sequence: 2, payload: 2, line: 2 },
    // seq 3 缺失
    { stream: 'a', sequence: 4, payload: 4, line: 3 },
    { stream: 'b', sequence: 1, payload: 'x', line: 4 },
    { stream: 'b', sequence: 1, payload: 'y', line: 5 }, // 冲突
    { stream: 'b', sequence: 2, payload: 'z', line: 6 }, // 被阻断
  ];
  const [modelA, modelB] = buildModel(events);

  it('缺号阻断其后事件', () => {
    const report = computeReport(modelA, 1, {});
    expect(report.state).toBe('blocked-gap');
    expect(report.gaps).toEqual([3]);
    expect(report.blockingAt).toBe(3);
    expect(report.prefixEnd).toBe(2);
    expect(report.blockedPresent).toEqual([4]);
  });

  it('未裁决冲突阻断其后事件', () => {
    const report = computeReport(modelB, 1, {});
    expect(report.state).toBe('blocked-conflict');
    expect(report.unresolvedConflicts).toHaveLength(1);
    expect(report.prefixEnd).toBe(0);
    expect(report.blockedPresent).toEqual([2]);
  });

  it('裁决冲突后立即解除阻断', () => {
    const slot = modelB.slots[0];
    const chosen = slot.versions.find((v) => v.payload === 'x')!.canonical;
    const resolutions: Resolutions = { [resolutionKey('b', 1)]: chosen };
    const report = computeReport(modelB, 1, resolutions);
    expect(report.state).toBe('clean');
    expect(report.prefixEnd).toBe(2);
  });

  it('撤销裁决（删除 key）后重新阻断', () => {
    const clean = computeReport(modelB, 1, {});
    expect(clean.state).toBe('blocked-conflict');
  });

  it('自定义起始序号影响前缀与缺口', () => {
    const report = computeReport(modelA, 2, {});
    expect(report.prefixStart).toBe(2);
    expect(report.prefixEnd).toBe(2);
    expect(report.gaps).toEqual([3]);
  });

  it('起点之前的序号既不算前缀也不算缺口', () => {
    const report = computeReport(modelA, 5, {});
    expect(report.gaps).toEqual([5]); // 只有起点缺号；6 超出 max 不报
    expect(report.prefixEnd).toBe(4);
  });
});

describe('collectConfirmed：仅导出已确认连续事件', () => {
  const events: InputEvent[] = [
    { stream: 'a', sequence: 1, payload: 1, line: 1 },
    { stream: 'a', sequence: 1, payload: 2, line: 2 },
    { stream: 'a', sequence: 2, payload: 3, line: 3 },
    { stream: 'b', sequence: 1, payload: 'b1', line: 4 },
    { stream: 'b', sequence: 3, payload: 'b3', line: 5 },
  ];
  const [modelA, modelB] = buildModel(events);

  it('未裁决时只含阻断点之前的连续事件，按流名+序号排序', () => {
    const reports = [computeReport(modelA, 1, {}), computeReport(modelB, 1, {})];
    const confirmed = collectConfirmed(reports, {});
    expect(confirmed.map((e) => [e.stream, e.sequence])).toEqual([
      ['b', 1],
    ]);
  });

  it('裁决后冲突版本进入导出并标记 resolved；缺口后事件仍排除', () => {
    const chosen = modelA.slots[0].versions.find((v) => v.payload === 2)!.canonical;
    const resolutions: Resolutions = { [resolutionKey('a', 1)]: chosen };
    const reports = [
      computeReport(modelA, 1, resolutions),
      computeReport(modelB, 1, resolutions),
    ];
    const confirmed = collectConfirmed(reports, resolutions);
    expect(confirmed).toHaveLength(3);
    expect(confirmed[0]).toMatchObject({ stream: 'a', sequence: 1, payload: 2, resolved: true });
    expect(confirmed[1]).toMatchObject({ stream: 'a', sequence: 2 });
    // b 流 seq 2 缺失，seq 3 被阻断
    expect(confirmed[2]).toMatchObject({ stream: 'b', sequence: 1 });
  });

  it('折叠计数反映同载荷重复条数', () => {
    const dup: InputEvent[] = [
      { stream: 'a', sequence: 1, payload: { k: 1 }, line: 1 },
      { stream: 'a', sequence: 1, payload: { k: 1 }, line: 2 },
    ];
    const model = buildModel(dup)[0];
    const confirmed = collectConfirmed([computeReport(model, 1, {})], {});
    expect(confirmed[0].duplicateCount).toBe(2);
  });

  it('toNDJSON 每行一条紧凑 JSON', () => {
    const text = toNDJSON([
      { stream: 'a', sequence: 1, payload: { x: 1 } },
      { stream: 'a', sequence: 2, payload: null },
    ]);
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('"sequence":1');
  });
});
