/*
 * XAUUSD Income Journal — state & persistence (localStorage)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./calc.js'));
  } else {
    root.XAU = root.XAU || {};
    root.XAU.store = factory(root.XAU.calc);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (calc) {
  'use strict';

  const KEY = 'xauusd-income-journal-v1';

  function uid() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    return {
      settings: Object.assign({}, calc.DEFAULTS),
      records: []
    };
  }

  /** ข้อมูลตัวอย่างจากใบบันทึก (ถ้ามีไฟล์ assets/sample-data.js) — ไม่ถูก deploy ขึ้นเว็บ */
  function sampleRecords() {
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    const rows = g && g.XAU && Array.isArray(g.XAU.sampleData) ? g.XAU.sampleData : [];
    return rows.map((row) => ({
      id: uid(),
      date: row[0],
      direction: null,
      entry: null,
      exit: null,
      lots: null,
      gross: Number(row[1]) || 0,
      commissionRate: null,
      notes: ''
    }));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const fresh = defaultState();
        fresh.records = sampleRecords();
        save(fresh);
        return fresh;
      }
      const parsed = JSON.parse(raw);
      const state = defaultState();
      state.settings = calc.normalizeSettings(parsed.settings);
      state.records = Array.isArray(parsed.records) ? parsed.records : [];
      return state;
    } catch (err) {
      console.warn('โหลดข้อมูลไม่สำเร็จ ใช้ค่าเริ่มต้นแทน', err);
      const fresh = defaultState();
      fresh.records = sampleRecords();
      return fresh;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        settings: state.settings,
        records: state.records
      }));
      return true;
    } catch (err) {
      console.warn('บันทึกข้อมูลไม่สำเร็จ', err);
      return false;
    }
  }

  /**
   * เรียงรายการตามวันที่
   * @param {Array} records
   * @param {'desc'|'asc'} direction 'desc' = วันที่ล่าสุดอยู่แถวแรก (ค่าเริ่มต้น), 'asc' = เก่าสุดอยู่แถวแรก
   */
  function sortRecords(records, direction) {
    const dir = direction === 'asc' ? 1 : -1;
    return records.slice().sort((a, b) => {
      if (a.date === b.date) return String(a.id).localeCompare(String(b.id));
      return a.date < b.date ? -dir : dir;
    });
  }

  function upsert(state, record) {
    const rec = Object.assign({ id: uid() }, record);
    const idx = state.records.findIndex((r) => r.id === rec.id);
    if (idx >= 0) state.records[idx] = rec;
    else state.records.push(rec);
    save(state);
    return rec;
  }

  function remove(state, id) {
    state.records = state.records.filter((r) => r.id !== id);
    save(state);
  }

  function clear(state) {
    state.records = [];
    save(state);
  }

  function exportBackup(state) {
    return JSON.stringify({
      app: 'xauusd-income-journal',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      records: state.records
    }, null, 2);
  }

  function importBackup(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.records)) throw new Error('ไฟล์สำรองไม่ถูกต้อง');
    return {
      settings: calc.normalizeSettings(parsed.settings),
      records: parsed.records
    };
  }

  return {
    KEY,
    uid,
    defaultState,
    sampleRecords,
    load,
    save,
    sortRecords,
    upsert,
    remove,
    clear,
    exportBackup,
    importBackup
  };
});
