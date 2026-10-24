/*
 * XAUUSD Income Journal — calculation engine
 * Pure functions, no DOM. Works in the browser (global XAU.calc) and in Node (module.exports).
 *
 * สูตรอ้างอิงจากใบบันทึกรายได้เทรด XAUUSD:
 *   US$        = กำไร/ขาดทุนขั้นต้น (หน่วยตามใบบันทึก)
 *   -30%       = US$ x อัตราค่าคอมมิชชัน
 *   US$ TOTAL  = US$ - (-30%)
 *   USD TOTAL  = US$ TOTAL / ตัวหาร (ค่าเริ่มต้น 100)
 *   Daily THB  = USD TOTAL x อัตราแลกเปลี่ยน USD->THB
 *   Total (THB)      = ผลรวม Daily THB
 *   Commission (THB) = (ผลรวมค่าคอมมิชชัน / ตัวหาร) x อัตราแลกเปลี่ยน
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.XAU = root.XAU || {};
    root.XAU.calc = factory();
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SCALE_DEC = 8;
  const SCALE = 10n ** BigInt(SCALE_DEC); // 1e8 — หน่วยเล็กสุดที่เก็บได้ (ป้องกันเลขลอย 0.1+0.2)

  function pow10(n) {
    return 10n ** BigInt(n);
  }

  /**
   * แปลงตัวเลขเป็นจำนวนเต็มหน่วย 1e-8 (BigInt) โดยตัดเลขลอยที่เกิดจาก binary
   * @param {number|string} value
   * @returns {bigint}
   */
  function toUnits(value) {
    if (value === '' || value === null || value === undefined) return 0n;
    const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
    if (!isFinite(num)) return 0n;
    const neg = num < 0;
    const abs = Math.abs(num);
    const fixed = abs.toFixed(SCALE_DEC);
    const parts = fixed.split('.');
    const intPart = parts[0];
    const decPart = (parts[1] || '').padEnd(SCALE_DEC, '0');
    const units = BigInt(intPart + decPart);
    return neg ? -units : units;
  }

  /** หาร BigInt แล้วปัดเป็นจำนวนเต็มแบบ half-away-from-zero (เหมือน Excel ROUND) */
  function divRound(num, den) {
    if (den === 0n) return 0n;
    const neg = (num < 0n) !== (den < 0n);
    const n = num < 0n ? -num : num;
    const d = den < 0n ? -den : den;
    const q = (2n * n + d) / (2n * d);
    return neg ? -q : q;
  }

  /** แปลงหน่วย 1e-8 กลับเป็นตัวเลขทศนิยม */
  function unitsToNumber(units) {
    const neg = units < 0n;
    const abs = neg ? -units : units;
    const s = abs.toString().padStart(SCALE_DEC + 1, '0');
    const intPart = s.slice(0, s.length - SCALE_DEC);
    const decPart = s.slice(s.length - SCALE_DEC);
    const v = Number(intPart + '.' + decPart);
    return neg ? -v : v;
  }

  /** ปัดทศนิยม 2 ตำแหน่งแบบ Excel (half away from zero) */
  function round2(value) {
    if (!isFinite(value)) return 0;
    const neg = value < 0;
    const abs = Math.abs(value);
    const units = toUnits(abs);
    // r มีหน่วยเป็น "เซนต์" (ค่าเดิม × 100) จึงต้องหารกลับด้วย 100
    const r = divRound(units, pow10(SCALE_DEC - 2));
    const v = Number(r) / 100;
    return neg ? -v : v;
  }

  const DEFAULTS = {
    fxRate: 33,          // อัตราแลกเปลี่ยน USD -> THB
    commissionRate: 30,  // ค่าคอมมิชชัน (%) — เช่นเดิมในใบบันทึก 30%
    divisor: 100,        // ตัวหารในขั้นตอน US$ TOTAL -> USD TOTAL
    unit: 'cents',       // หน่วยของคอลัมน์ US$: 'cents' (เซนต์) | 'usd' (ดอลลาร์)
    contractSize: 100    // ขนาดสัญญา XAUUSD (ออนซ์ต่อ 1 lot)
  };

  function normalizeSettings(settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    s.fxRate = Number(s.fxRate) || 0;
    s.commissionRate = Number(s.commissionRate) || 0;
    s.divisor = Number(s.divisor) || 0;
    s.contractSize = Number(s.contractSize) || 0;
    s.unit = s.unit === 'usd' ? 'usd' : 'cents';
    return s;
  }

  /** อัตราคอมมิชชันเป็น basis point (30% = 3000) */
  function rateToBp(percent) {
    return BigInt(Math.round((Number(percent) || 0) * 100));
  }

  /**
   * คำนวณรายการเดียว
   * @param {{gross:number, commissionRate?:number}} rec  gross = หน่วยใบบันทึก (เซนต์/ดอลลาร์ ตาม settings.unit)
   * @param {object} settings
   */
  function computeRecord(rec, settings) {
    const s = normalizeSettings(settings);
    const grossU = toUnits(rec && rec.gross);
    const bp = rateToBp(rec && rec.commissionRate !== null && rec.commissionRate !== undefined
      ? rec.commissionRate : s.commissionRate);

    const commissionU = divRound(grossU * bp, 10000n);
    const netU = grossU - commissionU;

    const divisorU = toUnits(s.divisor);
    const usdTotalU = divRound(netU * SCALE, divisorU);
    const fxU = toUnits(s.fxRate);
    const thbU = divRound(usdTotalU * fxU, SCALE);

    return {
      gross: round2(unitsToNumber(grossU)),
      commission: round2(unitsToNumber(commissionU)),
      net: round2(unitsToNumber(netU)),
      usdTotal: round2(unitsToNumber(usdTotalU)),
      dailyThb: round2(unitsToNumber(thbU)),
      _grossU: grossU,
      _commissionU: commissionU,
      _netU: netU,
      _usdTotalU: usdTotalU,
      _thbU: thbU
    };
  }

  /**
   * รวมยอดจากรายการที่คำนวณแล้ว (รวมจากค่าที่ยังไม่ปัด เพื่อให้ตรงกับใบบันทึก)
   */
  function summarize(computedList, settings) {
    const s = normalizeSettings(settings);
    let grossU = 0n, commissionU = 0n, netU = 0n, usdTotalU = 0n, thbU = 0n;
    let wins = 0, losses = 0, days = 0;

    computedList.forEach((item) => {
      // รองรับทั้งรายการที่คำนวณแล้ว และรายการดิบ
      const c = item && item._grossU !== undefined ? item : computeRecord(item, s);
      grossU += c._grossU;
      commissionU += c._commissionU;
      netU += c._netU;
      usdTotalU += c._usdTotalU;
      thbU += c._thbU;
      if (c.net > 0) wins++;
      else if (c.net < 0) losses++;
      if (c.gross !== 0) days++;
    });

    const divisorU = toUnits(s.divisor);
    const fxU = toUnits(s.fxRate);
    const commissionUsdU = divRound(commissionU * SCALE, divisorU);
    const commissionThbU = divRound(commissionUsdU * fxU, SCALE);

    const traded = wins + losses;
    return {
      gross: round2(unitsToNumber(grossU)),
      commission: round2(unitsToNumber(commissionU)),
      net: round2(unitsToNumber(netU)),
      usdTotal: round2(unitsToNumber(usdTotalU)),
      dailyThb: round2(unitsToNumber(thbU)),
      totalThb: round2(unitsToNumber(thbU)),
      commissionThb: round2(unitsToNumber(commissionThbU)),
      count: computedList.length,
      tradingDays: days,
      wins: wins,
      losses: losses,
      winRate: traded ? Math.round((wins / traded) * 1000) / 10 : 0
    };
  }

  /** คำนวณ P/L (USD จริง) จากราคาเข้า/ออก จำนวนล็อต และขนาดสัญญา XAUUSD */
  function computePnlUsd(direction, entry, exit, lots, contractSize) {
    const dir = direction === 'sell' ? -1n : 1n;
    const deltaU = toUnits(exit) - toUnits(entry);
    const lotsU = toUnits(lots);
    const contractU = toUnits(contractSize === undefined || contractSize === null ? DEFAULTS.contractSize : contractSize);
    const raw = deltaU * dir * lotsU * contractU;
    return unitsToNumber(divRound(raw, SCALE * SCALE));
  }

  /** แปลงกำไร USD จริง -> หน่วยใบบันทึก (เซนต์/ดอลลาร์) */
  function usdToSheetUnits(usd, settings) {
    const s = normalizeSettings(settings);
    return s.unit === 'cents' ? round2(usd * 100) : round2(usd);
  }

  /** แปลงหน่วยใบบันทึก -> กำไร USD จริง */
  function sheetUnitsToUsd(sheetUnits, settings) {
    const s = normalizeSettings(settings);
    return s.unit === 'cents' ? round2(sheetUnits / 100) : round2(sheetUnits);
  }

  /** คำนวณชุดรายการทั้งหมดพร้อมกัน */
  function computeAll(records, settings) {
    return (records || []).map((rec) => {
      const c = computeRecord(rec, settings);
      return Object.assign({}, rec, c);
    });
  }

  const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const WEEKDAYS_TH_FULL = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** แปลงวันที่เป็น weekday */
  function weekday(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return { index: 0, th: '-', thFull: '-', en: '-' };
    const i = d.getDay();
    return { index: i, th: WEEKDAYS_TH[i], thFull: WEEKDAYS_TH_FULL[i], en: WEEKDAYS_EN[i] };
  }

  /** แปลงวันที่เป็นรูปแบบ dd/MM/yyyy */
  function formatDate(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return String(isoDate);
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  /** แปลงวันที่หลายรูปแบบเป็น ISO (yyyy-mm-dd) */
  function parseDate(value) {
    if (!value) return '';
    if (value instanceof Date && !isNaN(value.getTime())) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(value).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); // 2026-09-15
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // 15/09/2026
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/); // 15/09/26
    if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }
    return '';
  }

  return {
    SCALE_DEC,
    DEFAULTS,
    toUnits,
    divRound,
    unitsToNumber,
    round2,
    normalizeSettings,
    computeRecord,
    computeAll,
    summarize,
    computePnlUsd,
    usdToSheetUnits,
    sheetUnitsToUsd,
    weekday,
    formatDate,
    parseDate
  };
});
