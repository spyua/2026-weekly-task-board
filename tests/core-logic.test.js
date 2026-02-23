import { describe, it, expect, beforeEach } from 'vitest';
import { createTestContext, evalIn } from './setup.js';

// ---------------------------------------------------------------------------
// computeProgress
// ---------------------------------------------------------------------------
describe('computeProgress', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
    // Start with empty slots (no taskId assigned)
    evalIn(ctx, `STATE.slots = [];`);
    evalIn(ctx, `STATE.tasks = [];`);
  });

  it('returns zeros when no slots exist', () => {
    const r = evalIn(ctx, `computeProgress()`);
    expect(r).toEqual({ total: 0, done: 0, pct: 0 });
  });

  it('returns zeros when slots have no taskId', () => {
    evalIn(ctx, `STATE.slots = [
      {id:'s1', day:'週一', zoneId:'morning'},
      {id:'s2', day:'週二', zoneId:'noon'},
    ];`);
    const r = evalIn(ctx, `computeProgress()`);
    expect(r).toEqual({ total: 0, done: 0, pct: 0 });
  });

  it('returns 100% when all assigned slots are done', () => {
    evalIn(ctx, `STATE.slots = [
      {id:'s1', day:'週一', zoneId:'morning', taskId:'t1', done:true},
      {id:'s2', day:'週二', zoneId:'noon', taskId:'t2', done:true},
    ];`);
    const r = evalIn(ctx, `computeProgress()`);
    expect(r).toEqual({ total: 2, done: 2, pct: 100 });
  });

  it('calculates partial progress correctly', () => {
    evalIn(ctx, `STATE.slots = [
      {id:'s1', taskId:'t1', done:true},
      {id:'s2', taskId:'t2', done:false},
      {id:'s3', taskId:'t3', done:true},
      {id:'s4', taskId:'t4', done:false},
    ];`);
    const r = evalIn(ctx, `computeProgress()`);
    expect(r).toEqual({ total: 4, done: 2, pct: 50 });
  });

  it('ignores unassigned slots in the count', () => {
    evalIn(ctx, `STATE.slots = [
      {id:'s1', taskId:'t1', done:true},
      {id:'s2'},
      {id:'s3', taskId:'t3', done:false},
    ];`);
    const r = evalIn(ctx, `computeProgress()`);
    expect(r).toEqual({ total: 2, done: 1, pct: 50 });
  });
});

// ---------------------------------------------------------------------------
// applyMetricDelta
// ---------------------------------------------------------------------------
describe('applyMetricDelta', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({ currentMonth: '2026-02' });
    evalIn(ctx, `STATE.tasks = [
      {id:'t1', title:'Test', category:'agent', metricKey:'agent_read', done:false},
      {id:'t2', title:'NoMetric', category:'agent', metricKey:null, done:false},
    ];`);
    evalIn(ctx, `STATE.monthly = {};`);
  });

  it('increments metric by +1', () => {
    evalIn(ctx, `applyMetricDelta('t1', 1)`);
    const val = evalIn(ctx, `STATE.monthly['2026-02']['agent_read']`);
    expect(val).toBe(1);
  });

  it('decrements metric by -1 (not below 0)', () => {
    evalIn(ctx, `applyMetricDelta('t1', -1)`);
    const val = evalIn(ctx, `STATE.monthly['2026-02']['agent_read']`);
    expect(val).toBe(0);
  });

  it('accumulates multiple deltas', () => {
    evalIn(ctx, `applyMetricDelta('t1', 1)`);
    evalIn(ctx, `applyMetricDelta('t1', 1)`);
    evalIn(ctx, `applyMetricDelta('t1', 1)`);
    const val = evalIn(ctx, `STATE.monthly['2026-02']['agent_read']`);
    expect(val).toBe(3);
  });

  it('does nothing when task has no metricKey', () => {
    evalIn(ctx, `applyMetricDelta('t2', 1)`);
    const monthly = evalIn(ctx, `JSON.stringify(STATE.monthly)`);
    expect(monthly).toBe('{}');
  });

  it('does nothing when taskId does not exist', () => {
    evalIn(ctx, `applyMetricDelta('nonexistent', 1)`);
    const monthly = evalIn(ctx, `JSON.stringify(STATE.monthly)`);
    expect(monthly).toBe('{}');
  });

  it('does nothing when taskId is falsy', () => {
    evalIn(ctx, `applyMetricDelta(null, 1)`);
    evalIn(ctx, `applyMetricDelta(undefined, 1)`);
    evalIn(ctx, `applyMetricDelta('', 1)`);
    const monthly = evalIn(ctx, `JSON.stringify(STATE.monthly)`);
    expect(monthly).toBe('{}');
  });
});

// ---------------------------------------------------------------------------
// toggleSlotDone
// ---------------------------------------------------------------------------
describe('toggleSlotDone', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({ currentMonth: '2026-02' });
    evalIn(ctx, `STATE.monthly = {};`);
  });

  it('toggles slot from done:false to done:true', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:'agent_read', done:false}];
      STATE.slots = [{id:'s1', taskId:'t1', done:false}];
      STATE.settings.mirrorDone = false;
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    const done = evalIn(ctx, `STATE.slots[0].done`);
    expect(done).toBe(true);
  });

  it('toggles slot from done:true to done:false', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:'agent_read', done:false}];
      STATE.slots = [{id:'s1', taskId:'t1', done:true}];
      STATE.settings.mirrorDone = false;
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    const done = evalIn(ctx, `STATE.slots[0].done`);
    expect(done).toBe(false);
  });

  it('does not change task.done when mirrorDone is OFF', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:null, done:false}];
      STATE.slots = [{id:'s1', taskId:'t1', done:false}];
      STATE.settings.mirrorDone = false;
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    const taskDone = evalIn(ctx, `STATE.tasks[0].done`);
    expect(taskDone).toBe(false);
  });

  it('mirrorDone ON + single slot → task.done follows slot', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:null, done:false}];
      STATE.slots = [{id:'s1', taskId:'t1', done:false}];
      STATE.settings.mirrorDone = true;
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    const taskDone = evalIn(ctx, `STATE.tasks[0].done`);
    expect(taskDone).toBe(true);
  });

  it('mirrorDone ON + multiple slots → completing one slot does NOT mark task done (regression)', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:null, done:false}];
      STATE.slots = [
        {id:'s1', taskId:'t1', done:false},
        {id:'s2', taskId:'t1', done:false},
      ];
      STATE.settings.mirrorDone = true;
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    const slotDone = evalIn(ctx, `STATE.slots[0].done`);
    const taskDone = evalIn(ctx, `STATE.tasks[0].done`);
    expect(slotDone).toBe(true);
    expect(taskDone).toBe(false); // KEY: task should NOT be done
  });

  it('mirrorDone ON + all slots completed → task.done = true', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:null, done:false}];
      STATE.slots = [
        {id:'s1', taskId:'t1', done:false},
        {id:'s2', taskId:'t1', done:false},
      ];
      STATE.settings.mirrorDone = true;
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    evalIn(ctx, `toggleSlotDone('s2')`);
    const taskDone = evalIn(ctx, `STATE.tasks[0].done`);
    expect(taskDone).toBe(true);
  });

  it('mirrorDone ON + unchecking one slot → task.done reverts to false', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:null, done:false}];
      STATE.slots = [
        {id:'s1', taskId:'t1', done:true},
        {id:'s2', taskId:'t1', done:true},
      ];
      STATE.settings.mirrorDone = true;
      STATE.tasks[0].done = true;
    `);
    // Uncheck one slot
    evalIn(ctx, `toggleSlotDone('s1')`);
    const taskDone = evalIn(ctx, `STATE.tasks[0].done`);
    expect(taskDone).toBe(false);
  });

  it('calls applyMetricDelta with +1 when completing a slot', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:'agent_read', done:false}];
      STATE.slots = [{id:'s1', taskId:'t1', done:false}];
      STATE.settings.mirrorDone = false;
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    const val = evalIn(ctx, `STATE.monthly['2026-02']['agent_read']`);
    expect(val).toBe(1);
  });

  it('calls applyMetricDelta with -1 when uncompleting a slot', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:'agent_read', done:false}];
      STATE.slots = [{id:'s1', taskId:'t1', done:true}];
      STATE.settings.mirrorDone = false;
      STATE.monthly = {'2026-02': {agent_read: 3}};
    `);
    evalIn(ctx, `toggleSlotDone('s1')`);
    const val = evalIn(ctx, `STATE.monthly['2026-02']['agent_read']`);
    expect(val).toBe(2);
  });

  it('does nothing for non-existent slotId', () => {
    evalIn(ctx, `
      STATE.tasks = [{id:'t1', title:'A', category:'agent', metricKey:null, done:false}];
      STATE.slots = [{id:'s1', taskId:'t1', done:false}];
    `);
    evalIn(ctx, `toggleSlotDone('nonexistent')`);
    const slotDone = evalIn(ctx, `STATE.slots[0].done`);
    expect(slotDone).toBe(false);
  });
});
