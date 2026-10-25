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

  const BASE_KEY = 'xauusd-income-journal-v1';
  const KEY_OLD = 'xauusd-income-journal-v1';
  const PROFILE_LIST_KEY = 'xauusd-journal-profiles';
  const PROFILE_CURRENT_KEY = 'xauusd-journal-profile-current';

  function uid() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getProfiles() {
    try {
      const raw = localStorage.getItem(PROFILE_LIST_KEY);
      if (!raw) return ['Default'];
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) return list;
      return ['Default'];
    } catch (e) {
      return ['Default'];
    }
  }

  function saveProfiles(list) {
    try {
      localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function getCurrentProfile() {
    try {
      const p = localStorage.getItem(PROFILE_CURRENT_KEY);
      if (p) return p;
      const list = getProfiles();
      const cur = list[0] || 'Default';
      localStorage.setItem(PROFILE_CURRENT_KEY, cur);
      return cur;
    } catch (e) {
      return 'Default';
    }
  }

  function setCurrentProfile(name) {
    try {
      localStorage.setItem(PROFILE_CURRENT_KEY, name);
    } catch (e) {}
  }

  function keyFor(profile) {
    const p = profile || getCurrentProfile();
    // keep legacy key for default to be safe
    if (p === 'Default') {
      // check if new keyed exists, else use legacy
      try {
        if (localStorage.getItem(BASE_KEY + ':' + p)) return BASE_KEY + ':' + p;
        // prefer legacy for backward compat
        return KEY_OLD;
      } catch (e) {
        return KEY_OLD;
      }
    }
    return BASE_KEY + ':' + p;
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

  function load(profile) {
    try {
      const p = profile || getCurrentProfile();
      const k = keyFor(p);
      let raw = localStorage.getItem(k);
      // migrate: if default and no new key but old key exists
      if (!raw && p === 'Default') {
        raw = localStorage.getItem(KEY_OLD);
        if (raw) {
          try { localStorage.setItem(BASE_KEY + ':Default', raw); } catch (e) {}
        }
      }
      if (!raw) {
        const fresh = defaultState();
        // only add sample for first default profile
        if (p === 'Default') {
          fresh.records = sampleRecords();
        }
        save(fresh, p);
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
      return fresh;
    }
  }

  function save(state, profile) {
    try {
      const p = profile || getCurrentProfile();
      const k = keyFor(p);
      localStorage.setItem(k, JSON.stringify({
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
    KEY: BASE_KEY,
    KEY_OLD,
    BASE_KEY,
    uid,
    defaultState,
    sampleRecords,
    getProfiles,
    saveProfiles,
    getCurrentProfile,
    setCurrentProfile,
    keyFor,
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
