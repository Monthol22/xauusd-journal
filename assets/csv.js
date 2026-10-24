/*
 * XAUUSD Income Journal — CSV / Excel import & export
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./calc.js'));
  } else {
    root.XAU = root.XAU || {};
    root.XAU.csv = factory(root.XAU.calc);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (calc) {
  'use strict';

  const HEADERS = {
    date: 'วันที่',
    direction: 'ทิศทาง',
    entry: 'ราคาเข้า',
    exit: 'ราคาออก',
    lots: 'ล็อต',
    gross: 'US$',
    commissionRate: 'คอมมิชชัน %',
    notes: 'หมายเหตุ',
    commission: '-30%',
    net: 'US$ TOTAL',
    usdTotal: 'USD TOTAL',
    dailyThb: 'Daily THB',
    day: 'Day'
  };

  /** แยกค่าทีละแถว (รองรับเครื่องหมายคำพูด) */
  function parseRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const src = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  const ALIASES = {
    date: ['วันที่', 'date', 'วันที่เทรด', 'tradedate', 'day date', 'วัน'],
    direction: ['ทิศทาง', 'direction', 'side', 'buy/sell', 'ฝั่ง'],
    entry: ['ราคาเข้า', 'entry', 'entry price', 'open', 'ราคาเปิด', 'เข้า'],
    exit: ['ราคาออก', 'exit', 'exit price', 'close', 'ราคาปิด', 'ออก'],
    lots: ['ล็อต', 'lots', 'volume', 'ขนาด', 'จำนวนล็อต', 'qty'],
    gross: ['us$', 'usd', 'gross', 'กำไร', 'กำไรขั้นต้น', 'profit', 'us $', 'usd gross'],
    commissionRate: ['คอมมิชชัน %', 'commission %', 'commission', 'คอมมิชชัน', 'ค่าคอมมิชชัน', 'commission rate'],
    notes: ['หมายเหตุ', 'notes', 'note', 'comment', 'remark', 'คอมเมนต์']
  };

  function mapHeaders(headerRow) {
    const map = {};
    headerRow.forEach((raw, idx) => {
      const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
      if (!key) return;
      Object.keys(ALIASES).forEach((field) => {
        if (map[field] !== undefined) return;
        const aliases = ALIASES[field];
        if (aliases.includes(key) || aliases.includes(key.replace(/\s/g, ''))) map[field] = idx;
      });
    });
    return map;
  }

  function num(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim().replace(/[,\s฿$]/g, '');
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  /**
   * นำเข้า CSV — ต้องมีคอลัมน์วันที่ และอย่างน้อยหนึ่งคอลัมน์กำไร (US$)
   * ถ้าไม่มีคอลัมน์ US$ จะลองคำนวณจาก ราคาเข้า/ออก/ล็อต แทน
   */
  function importCsv(text, settings, idFactory) {
    const rows = parseRows(text);
    if (rows.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล');

    const map = mapHeaders(rows[0]);
    if (map.date === undefined) throw new Error('ไม่พบคอลัมน์ "วันที่" ในไฟล์ CSV');
    if (map.gross === undefined && (map.entry === undefined || map.exit === undefined || map.lots === undefined)) {
      throw new Error('ไม่พบคอลัมน์ "US$" หรือข้อมูลราคาเข้า/ออก/ล็อต');
    }

    const out = [];
    const skipped = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const iso = calc.parseDate(r[map.date]);
      if (!iso) { skipped.push(r[map.date]); continue; }

      let gross = map.gross !== undefined ? num(r[map.gross]) : null;
      const entry = map.entry !== undefined ? num(r[map.entry]) : null;
      const exit = map.exit !== undefined ? num(r[map.exit]) : null;
      const lots = map.lots !== undefined ? num(r[map.lots]) : null;

      let direction = map.direction !== undefined ? String(r[map.direction] || '').trim().toLowerCase() : '';
      if (direction === '1') direction = 'buy';
      if (direction === '-1' || direction === 's') direction = 'sell';
      if (direction && direction !== 'buy' && direction !== 'sell') direction = '';

      if (gross === null && entry !== null && exit !== null && lots !== null) {
        const pnl = calc.computePnlUsd(direction || 'buy', entry, exit, lots, settings.contractSize);
        gross = calc.usdToSheetUnits(pnl, settings);
      }
      if (gross === null) gross = 0;

      const rec = {
        id: idFactory(),
        date: iso,
        direction: direction || null,
        entry: entry,
        exit: exit,
        lots: lots,
        gross: gross,
        commissionRate: map.commissionRate !== undefined ? num(r[map.commissionRate]) : null,
        notes: map.notes !== undefined ? String(r[map.notes] || '').trim() : ''
      };
      out.push(rec);
    }
    return { records: out, skipped };
  }

  function csvCell(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** ส่งออก CSV ตามคอลัมน์ของใบบันทึก + คอลัมน์ช่วยเหลือ */
  function exportCsv(records, settings) {
    const computed = calc.computeAll(records, settings);
    const head = [
      HEADERS.date, HEADERS.direction, HEADERS.entry, HEADERS.exit, HEADERS.lots,
      HEADERS.gross, HEADERS.commissionRate, HEADERS.commission, HEADERS.net,
      HEADERS.usdTotal, HEADERS.dailyThb, HEADERS.day, HEADERS.notes
    ];
    const lines = [head.join(',')];
    computed.forEach((r) => {
      const wd = calc.weekday(r.date);
      lines.push([
        calc.formatDate(r.date),
        r.direction || '',
        r.entry === null || r.entry === undefined ? '' : r.entry,
        r.exit === null || r.exit === undefined ? '' : r.exit,
        r.lots === null || r.lots === undefined ? '' : r.lots,
        r.gross.toFixed(2),
        r.commissionRate === null || r.commissionRate === undefined ? settings.commissionRate : r.commissionRate,
        r.commission.toFixed(2),
        r.net.toFixed(2),
        r.usdTotal.toFixed(2),
        r.dailyThb.toFixed(2),
        wd.en,
        r.notes || ''
      ].map(csvCell).join(','));
    });
    return '\uFEFF' + lines.join('\n'); // BOM เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
  }

  return { HEADERS, parseRows, importCsv, exportCsv, csvCell };
});
