/*
 * XAUUSD Income Journal — UI layer
 */
(function () {
  'use strict';

  const calc = window.XAU.calc;
  const store = window.XAU.store;
  const csv = window.XAU.csv;

  const state = {
    settings: null,
    records: [],
    filters: { month: 'all', search: '', nonZero: false, sort: 'desc' },
    editingId: null,
    mode: 'trade',
    viewMode: 'weekly'
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------------------------------------------------------------- helpers
  function getWeekKey(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    const day = (d.getDay() + 6) % 7; // จันทร์ = 0
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function getWeekLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const f = (x) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
    return `${f(monday)} - ${f(sunday)}/${sunday.getFullYear()}`;
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(() => el.remove(), 260);
    }, 2800);
  }

  function openModal(id) {
    const m = $(id);
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const m = $(id);
    m.hidden = true;
    document.body.style.overflow = '';
  }

  // ---------------------------------------------------------------- state
  function persist() {
    store.save({ settings: state.settings, records: state.records });
  }

  function computedRows() {
    return calc.computeAll(state.records, state.settings);
  }

  /**
   * รายการหลังกรอง + เรียงตามที่เลือก
   * @param {'desc'|'asc'} [sortDir] default = ตามที่เลือกในแถบเครื่องมือ
   */
  function filteredRows(sortDir) {
    const f = state.filters;
    const q = f.search.trim().toLowerCase();
    const rows = computedRows().filter((r) => {
      if (f.month !== 'all' && monthKey(r.date) !== f.month) return false;
      if (f.nonZero && !r.gross) return false;
      if (q) {
        const hay = `${calc.formatDate(r.date)} ${r.date} ${r.notes || ''} ${r.direction || ''}`.toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    return store.sortRecords(rows, sortDir || f.sort);
  }

  // ---------------------------------------------------------------- render
  function render() {
    renderSettings();
    renderSortButton();
    renderMonths();
    renderCards();
    renderTable();
    renderChart();
  }

  function renderSettings() {
    const s = state.settings;
    $('#set-fx').value = s.fxRate;
    $('#set-commission').value = s.commissionRate;
    $('#set-divisor').value = s.divisor;
    $('#set-unit').value = s.unit;
    $('#set-contract').value = s.contractSize;
    $('#th-commission').textContent = '−' + s.commissionRate + '%';
  }

  /** ปุ่มสลับการเรียงวันที่: desc = วันที่ล่าสุดอยู่แถวแรก */
  function renderSortButton() {
    const btn = $('#btn-sort');
    const desc = state.filters.sort !== 'asc';
    btn.textContent = desc ? '⇅ ล่าสุดก่อน' : '⇅ เก่าสุดก่อน';
    btn.title = desc
      ? 'วันที่ล่าสุดอยู่แถวแรก — คลิกเพื่อเรียงจากเก่าสุดไปใหม่'
      : 'วันที่เก่าสุดอยู่แถวแรก — คลิกเพื่อย้ายวันที่ล่าสุดขึ้นแถวแรก';
    btn.classList.toggle('active', desc);
  }

  function renderMonths() {
    const sel = $('#filter-month');
    const keys = Array.from(new Set(state.records.map((r) => monthKey(r.date)).filter(Boolean))).sort();
    const current = state.filters.month;
    sel.innerHTML = '<option value="all">ทุกเดือน</option>' +
      keys.map((k) => `<option value="${k}">${monthLabel(k)}</option>`).join('');
    sel.value = keys.indexOf(current) >= 0 ? current : 'all';
    state.filters.month = sel.value;
  }

  function renderCards() {
    const rows = filteredRows();
    const sum = calc.summarize(rows.map((r) => ({ ...r })), state.settings);

    const totalThb = $('#sum-total-thb');
    totalThb.textContent = fmt(sum.totalThb);
    totalThb.className = 'card-value ' + (sum.totalThb > 0 ? 'pos' : sum.totalThb < 0 ? 'neg' : '');
    $('#sum-total-usd').textContent = '≈ ' + fmt(sum.usdTotal) + ' USD';
    $('#sum-commission-thb').textContent = fmt(sum.commissionThb);
    $('#sum-commission-usd').textContent = '= ' + fmt(calc.round2(sum.commission / (state.settings.divisor || 1))) + ' USD';
    $('#sum-net').textContent = fmt(sum.net);
    $('#sum-gross').textContent = 'จากขั้นต้น ' + fmt(sum.gross);
    $('#sum-usd').textContent = fmt(sum.usdTotal);
    $('#sum-usd-total').textContent = '= ' + fmt(sum.net) + ' ÷ ' + state.settings.divisor;
    $('#sum-days').textContent = sum.tradingDays + ' วัน';
    $('#sum-winrate').textContent = 'ชนะ ' + sum.wins + ' / แพ้ ' + sum.losses + ' · Win rate ' + sum.winRate + '%';
  }

  function renderTable() {
    const vm = state.viewMode || 'weekly';
    const rows = filteredRows();
    const tb = $('#tbody');
    const tf = $('#tfoot');
    $('#empty').hidden = rows.length > 0;

    if (vm === 'weekly') {
      const groups = new Map();
      rows.forEach((r) => {
        const key = getWeekKey(r.date);
        if (!groups.has(key)) groups.set(key, { key, label: getWeekLabel(r.date), items: [] });
        groups.get(key).items.push(r);
      });
      const sortedKeys = Array.from(groups.keys()).sort((a,b) => state.filters.sort === 'asc' ? a.localeCompare(b) : b.localeCompare(a));
      tb.innerHTML = sortedKeys.map((key) => {
        const g = groups.get(key);
        const sum = calc.summarize(g.items.map((r) => ({ ...r })), state.settings);
        const netCls = sum.net > 0 ? 'is-profit' : sum.net < 0 ? 'is-loss' : '';
        return `<tr class="${netCls}">
          <td class="c-date">สัปดาห์ ${g.label}</td>
          <td class="num">${fmt(sum.gross)}</td>
          <td class="num">${fmt(sum.commission)}</td>
          <td class="num">${fmt(sum.net)}</td>
          <td class="num">${fmt(sum.usdTotal)}</td>
          <td class="num">${fmt(sum.dailyThb)}</td>
          <td class="c-day">${g.items.length} วัน</td>
          <td class="c-act"></td>
        </tr>`;
      }).join('');

      const sumAll = calc.summarize(rows.map((r) => ({ ...r })), state.settings);
      tf.innerHTML = `<tr>
        <td class="c-label">Total</td>
        <td class="num">${fmt(sumAll.gross)}</td>
        <td class="num">${fmt(sumAll.commission)}</td>
        <td class="num">${fmt(sumAll.net)}</td>
        <td class="num">${fmt(sumAll.usdTotal)}</td>
        <td class="num">${fmt(sumAll.dailyThb)}</td>
        <td colspan="2"></td>
      </tr>`;
      return;
    }

    tb.innerHTML = rows.map((r) => {
      const wd = calc.weekday(r.date);
      const weekend = wd.index === 0 || wd.index === 6;
      const cls = r.net > 0 ? 'is-profit' : r.net < 0 ? 'is-loss' : '';
      const note = r.notes ? ` title="${r.notes.replace(/"/g, '&quot;')}"` : '';
      const dir = r.direction ? (r.direction === 'buy' ? '▲' : '▼') : '';
      return `<tr class="${weekend ? 'is-weekend ' : ''}${cls}">
        <td class="c-date">${calc.formatDate(r.date)}${dir ? ' ' + dir : ''}${note}</td>
        <td class="num">${fmt(r.gross)}</td>
        <td class="num">${fmt(r.commission)}</td>
        <td class="num">${fmt(r.net)}</td>
        <td class="num">${fmt(r.usdTotal)}</td>
        <td class="num">${fmt(r.dailyThb)}</td>
        <td class="c-day">${wd.th}</td>
        <td class="c-act">
          <div class="row-actions">
            <button class="icon-btn" data-edit="${r.id}" title="แก้ไข">✎</button>
            <button class="icon-btn danger" data-del="${r.id}" title="ลบ">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    const sum = calc.summarize(rows.map((r) => ({ ...r })), state.settings);
    tf.innerHTML = `<tr>
      <td class="c-label">Total</td>
      <td class="num">${fmt(sum.gross)}</td>
      <td class="num">${fmt(sum.commission)}</td>
      <td class="num">${fmt(sum.net)}</td>
      <td class="num">${fmt(sum.usdTotal)}</td>
      <td class="num">${fmt(sum.dailyThb)}</td>
      <td colspan="2"></td>
    </tr>`;
  }

  // ---------------------------------------------------------------- chart
  function renderChart() {
    const canvas = $('#chart');
    // กราฟเรียงตามเวลาเสมอ (ซ้าย = เก่าสุด, ขวา = ล่าสุด) ไม่ขึ้นกับการเรียงของตาราง
    const rows = filteredRows('asc');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 320);
    const h = Math.max(rect.height, 240);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!rows.length) {
      ctx.fillStyle = '#8b98a8';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('ยังไม่มีข้อมูลให้แสดงกราฟ', w / 2, h / 2);
      return;
    }

    // padT เผื่อพื้นที่ให้ตัวเลขแนวดิ่งที่อยู่เหนือแท่ง/จุด
    const padL = 68, padR = 18, padT = 48, padB = 30;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const daily = rows.map((r) => r.dailyThb);
    let cum = 0;
    const cumSeries = daily.map((v) => (cum += v));

    const maxV = Math.max(0, ...daily, ...cumSeries);
    const minV = Math.min(0, ...daily, ...cumSeries);
    const span = (maxV - minV) || 1;
    const yOf = (v) => padT + innerH - ((v - minV) / span) * innerH;

    // grid + y labels
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.fillStyle = '#8b98a8';
    ctx.font = '10px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'right';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = minV + (span * i) / steps;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(fmt(Math.round(v)), padL - 8, y + 3.5);
    }

    // bars
    const n = rows.length;
    const slot = innerW / n;
    const barW = Math.max(6, Math.min(28, slot * 0.5));

    // วาดแท่งก่อน
    rows.forEach((r, i) => {
      const x = padL + slot * i + (slot - barW) / 2;
      const y0 = yOf(0);
      const y1 = yOf(r.dailyThb);
      const isPos = r.dailyThb >= 0;
      ctx.fillStyle = isPos ? 'rgba(53,201,138,.78)' : 'rgba(242,84,91,.78)';
      const top = Math.min(y0, y1);
      const height = Math.max(2, Math.abs(y1 - y0));
      ctx.fillRect(x, top, barW, height);
    });

    /**
     * วาดตัวเลขแนวดิ่ง (อ่านจากล่างขึ้นบน)
     * จุดอ้างอิง = ปลายล่างของข้อความ จึงไม่ทับแท่ง/จุด
     */
    const LABEL_FONT = '9px "SF Mono", Menlo, monospace';
    function vLabel(text, cx, anchorY, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.translate(cx, anchorY);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    function labelWidth(text) {
      ctx.save();
      ctx.font = LABEL_FONT;
      const wpx = ctx.measureText(text).width;
      ctx.restore();
      return wpx;
    }

    // ตัวเลขรายได้ อยู่เหนือแท่งของแต่ละวัน (เยื้องซ้าย เพื่อเว้นระยะจากยอดสะสม)
    if (slot >= 20) {
      const lane = Math.min(12, slot * 0.32);
      rows.forEach((r, i) => {
        if (Math.abs(r.dailyThb) < 1) return;
        const cx = padL + slot * i + slot / 2 - lane;
        const text = fmt(Math.round(r.dailyThb));
        const tw = labelWidth(text);
        const y0 = yOf(0);
        const y1 = yOf(r.dailyThb);
        const anchorY = r.dailyThb >= 0
          ? Math.min(y0, y1) - 4
          : Math.max(y0, y1) + 4 + tw;
        vLabel(text, cx, anchorY, '#d7dde4');
      });
    }

    // cumulative line
    ctx.strokeStyle = '#f0b429';
    ctx.lineWidth = 2;
    ctx.beginPath();
    cumSeries.forEach((v, i) => {
      const x = padL + slot * i + slot / 2;
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    cumSeries.forEach((v, i) => {
      const x = padL + slot * i + slot / 2;
      const y = yOf(v);
      ctx.fillStyle = '#f0b429';
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    });

    // ตัวเลขยอดสะสม (สีเหลือง) อยู่เหนือจุดของเส้น (เยื้องขวา)
    if (slot >= 20) {
      const lane = Math.min(12, slot * 0.32);
      cumSeries.forEach((v, i) => {
        if (Math.abs(v) < 1) return;
        const cx = padL + slot * i + slot / 2 + lane;
        vLabel(fmt(Math.round(v)), cx, yOf(v) - 4, '#f7c95b');
      });
    }

    // x labels
    ctx.fillStyle = '#8b98a8';
    ctx.font = '10px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.ceil(n / 12));
    rows.forEach((r, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const x = padL + slot * i + slot / 2;
      ctx.fillText(calc.formatDate(r.date).slice(0, 5), x, h - 12);
    });
  }

  // ---------------------------------------------------------------- modal
  function setMode(mode) {
    state.mode = mode;
    $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#panel-trade').hidden = mode !== 'trade';
    $('#panel-manual').hidden = mode !== 'manual';
    updateGrossLabel();
    updatePreview();
  }

  function updateGrossLabel() {
    const s = state.settings;
    const label = $('#f-gross-label');
    const hint = $('#f-gross-hint');
    if (s.unit === 'cents') {
      label.textContent = 'กำไร/ขาดทุน (เซนต์)';
      hint.textContent = 'ใช้ค่าเดียวกับคอลัมน์ US$ ในใบบันทึกเดิม (100 เซนต์ = 1 USD)';
    } else {
      label.textContent = 'กำไร/ขาดทุน (USD)';
      hint.textContent = 'ค่านี้จะถูกหารด้วยตัวหารอีกชั้นในขั้นตอน USD TOTAL';
    }
  }

  function currentGross() {
    const s = state.settings;
    if (state.mode === 'manual') {
      const v = parseFloat($('#f-gross').value);
      return isFinite(v) ? v : 0;
    }
    const entry = parseFloat($('#f-entry').value);
    const exit = parseFloat($('#f-exit').value);
    const lots = parseFloat($('#f-lots').value);
    if (!isFinite(entry) || !isFinite(exit) || !isFinite(lots)) return 0;
    const pnl = calc.computePnlUsd($('#f-direction').value, entry, exit, lots, s.contractSize);
    return calc.usdToSheetUnits(pnl, s);
  }

  function updatePreview() {
    const s = state.settings;
    const gross = currentGross();
    const rateInput = $('#f-commission');
    const rate = rateInput.value === '' ? s.commissionRate : Number(rateInput.value);
    const res = calc.computeRecord({ gross: gross, commissionRate: rate }, s);

    $('#pv-gross').textContent = fmt(res.gross);
    $('#pv-commission').textContent = fmt(res.commission);
    $('#pv-commission-label').textContent = '−' + rate + '%';
    $('#pv-net').textContent = fmt(res.net);
    $('#pv-usd').textContent = fmt(res.usdTotal);
    $('#pv-thb').textContent = fmt(res.dailyThb);

    const hint = $('#pnl-hint');
    if (state.mode === 'trade') {
      const entry = parseFloat($('#f-entry').value);
      const exit = parseFloat($('#f-exit').value);
      const lots = parseFloat($('#f-lots').value);
      if (isFinite(entry) && isFinite(exit) && isFinite(lots)) {
        const pnl = calc.computePnlUsd($('#f-direction').value, entry, exit, lots, s.contractSize);
        hint.textContent = `P/L = ${fmt(pnl)} USD  →  บันทึกเป็น ${fmt(gross)} (หน่วย${s.unit === 'cents' ? 'เซนต์' : 'USD'})  ·  ขนาดสัญญา ${s.contractSize} ออนซ์/ล็อต`;
      } else {
        hint.textContent = 'P/L = (ราคาออก − ราคาเข้า) × จำนวนล็อต × ขนาดสัญญา';
      }
    }
  }

  function openEntry(rec) {
    state.editingId = rec ? rec.id : null;
    $('#modal-title').textContent = rec ? 'แก้ไขรายการเทรด' : 'เพิ่มรายการเทรด';
    $('#btn-delete').hidden = !rec;

    $('#f-date').value = rec ? rec.date : new Date().toISOString().slice(0, 10);
    $('#f-commission').value = rec && rec.commissionRate !== null && rec.commissionRate !== undefined
      ? rec.commissionRate : state.settings.commissionRate;
    $('#f-commission-hint').textContent = 'ค่าเริ่มต้นจากตั้งค่า: ' + state.settings.commissionRate + '%';
    $('#f-direction').value = rec && rec.direction ? rec.direction : 'buy';
    $('#f-entry').value = rec && rec.entry !== null && rec.entry !== undefined ? rec.entry : '';
    $('#f-exit').value = rec && rec.exit !== null && rec.exit !== undefined ? rec.exit : '';
    $('#f-lots').value = rec && rec.lots !== null && rec.lots !== undefined ? rec.lots : '';
    $('#f-gross').value = rec ? rec.gross : '';
    $('#f-notes').value = rec ? (rec.notes || '') : '';

    const hasTradeData = rec && rec.entry !== null && rec.entry !== undefined &&
      rec.exit !== null && rec.exit !== undefined && rec.lots !== null && rec.lots !== undefined;
    const startMode = rec ? (rec.mode || (hasTradeData ? 'trade' : 'manual')) : 'trade';
    setMode(startMode);
    updatePreview();
    openModal('#modal');
    setTimeout(() => $('#f-date').focus(), 30);
  }

  function saveEntry() {
    const date = $('#f-date').value;
    if (!date) { toast('กรุณาเลือกวันที่', 'err'); return; }

    const gross = currentGross();
    const rateVal = $('#f-commission').value;
    const rec = {
      id: state.editingId || store.uid(),
      date: calc.parseDate(date) || date,
      direction: state.mode === 'trade' ? $('#f-direction').value : null,
      entry: state.mode === 'trade' ? numOrNull($('#f-entry').value) : null,
      exit: state.mode === 'trade' ? numOrNull($('#f-exit').value) : null,
      lots: state.mode === 'trade' ? numOrNull($('#f-lots').value) : null,
      gross: gross,
      mode: state.mode,
      commissionRate: rateVal === '' ? null : Number(rateVal),
      notes: $('#f-notes').value.trim()
    };

    const idx = state.records.findIndex((r) => r.id === rec.id);
    if (idx >= 0) state.records[idx] = rec; else state.records.push(rec);
    persist();
    closeModal('#modal');
    render();
    toast(idx >= 0 ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการเรียบร้อย', 'ok');
  }

  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }

  function deleteEntry(id) {
    if (!confirm('ลบรายการนี้ใช่หรือไม่?')) return;
    state.records = state.records.filter((r) => r.id !== id);
    persist();
    closeModal('#modal');
    render();
    toast('ลบรายการแล้ว');
  }

  // ---------------------------------------------------------------- range fill
  function fillRange(from, to, skipWeekend) {
    try {
      const existing = new Set(state.records.map((r) => r.date));
      let added = 0;
      const start = new Date(from + 'T00:00:00');
      const end = new Date(to + 'T00:00:00');
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        toast('วันที่ไม่ถูกต้อง', 'err');
        return 0;
      }
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay();
        if (skipWeekend && (wd === 0 || wd === 6)) continue;
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (existing.has(iso)) continue;
        state.records.push({
          id: store.uid(),
          date: iso,
          direction: null,
          entry: null,
          exit: null,
          lots: null,
          gross: 0,
          commissionRate: null,
          notes: '',
          mode: null
        });
        added++;
      }
      persist();
      render();
      toast(added ? `เพิ่ม ${added} วันที่` : 'ไม่มีวันที่ใหม่ที่ต้องเพิ่ม', added ? 'ok' : '');
      return added;
    } catch (err) {
      console.error('fillRange error', err);
      toast('เกิดข้อผิดพลาดในการเติมวันที่ว่าง', 'err');
      return 0;
    }
  }

  // ---------------------------------------------------------------- import/export
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const text = csv.exportCsv(state.records, state.settings);
    download(`xauusd-income-${new Date().toISOString().slice(0, 10)}.csv`, text, 'text/csv;charset=utf-8');
    toast('ส่งออกไฟล์ CSV แล้ว', 'ok');
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = csv.importCsv(String(reader.result), state.settings, store.uid);
        const existing = new Set(state.records.map((r) => r.date + '|' + r.gross));
        const merged = res.records.filter((r) => !existing.has(r.date + '|' + r.gross));
        state.records = state.records.concat(merged);
        persist();
        render();
        toast(`นำเข้าสำเร็จ ${merged.length} รายการ` + (res.skipped.length ? ` (ข้าม ${res.skipped.length} แถวที่อ่านวันที่ไม่ได้)` : ''), 'ok');
      } catch (err) {
        toast('นำเข้าไม่สำเร็จ: ' + err.message, 'err');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  // ---------------------------------------------------------------- events
  function bind() {
    $('#btn-add').addEventListener('click', () => openEntry(null));
    $('#btn-settings').addEventListener('click', () => {
      const bar = $('#settings-bar');
      bar.hidden = !bar.hidden;
    });

    ['set-fx', 'set-commission', 'set-divisor', 'set-contract'].forEach((id) => {
      $('#' + id).addEventListener('input', (e) => {
        const v = Number(e.target.value);
        state.settings = calc.normalizeSettings({
          ...state.settings,
          fxRate: id === 'set-fx' ? v : state.settings.fxRate,
          commissionRate: id === 'set-commission' ? v : state.settings.commissionRate,
          divisor: id === 'set-divisor' ? v : state.settings.divisor,
          contractSize: id === 'set-contract' ? v : state.settings.contractSize
        });
        persist();
        render();
        updatePreview();
      });
    });

    $('#set-unit').addEventListener('change', (e) => {
      state.settings = calc.normalizeSettings({ ...state.settings, unit: e.target.value });
      persist();
      render();
      updateGrossLabel();
      updatePreview();
    });

    $('#btn-sample').addEventListener('click', () => {
      if (!confirm('โหลดข้อมูลตัวอย่างจากใบบันทึก จะเพิ่มรายการทั้งหมดเข้าไป (ข้อมูลเดิมยังอยู่)')) return;
      state.records = state.records.concat(store.sampleRecords());
      persist();
      render();
      toast('โหลดข้อมูลตัวอย่างแล้ว', 'ok');
    });

    $('#btn-clear').addEventListener('click', () => {
      if (!confirm('ลบข้อมูลทั้งหมดอย่างถาวรใช่หรือไม่?')) return;
      state.records = [];
      persist();
      render();
      toast('ล้างข้อมูลแล้ว');
    });

    $('#btn-export').addEventListener('click', exportCsv);
    $('#btn-import').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      e.target.value = '';
    });

    // สำรอง / กู้คืนข้อมูล (JSON) — มีประโยชน์มากบน iPad เพราะ Safari อาจล้างข้อมูลอัตโนมัติ
    $('#btn-backup').addEventListener('click', () => {
      const name = `xauusd-backup-${new Date().toISOString().slice(0, 10)}.json`;
      download(name, store.exportBackup({ settings: state.settings, records: state.records }), 'application/json');
      toast('สำรองข้อมูลแล้ว — เก็บไฟล์ไว้ใน iCloud Drive / Files', 'ok');
    });
    $('#btn-restore').addEventListener('click', () => $('#file-restore').click());
    $('#file-restore').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = store.importBackup(String(reader.result));
          if (!confirm(`กู้คืนข้อมูล ${data.records.length} รายการ?\nข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด`)) return;
          state.settings = calc.normalizeSettings(data.settings);
          state.records = data.records;
          persist();
          render();
          toast(`กู้คืนข้อมูลสำเร็จ ${data.records.length} รายการ`, 'ok');
        } catch (err) {
          toast('กู้คืนไม่สำเร็จ: ' + err.message, 'err');
        }
      };
      reader.readAsText(file, 'utf-8');
    });

    $('#filter-month').addEventListener('change', (e) => {
      state.filters.month = e.target.value;
      render();
    });
    $('#filter-search').addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      render();
    });
    $('#filter-nonzero').addEventListener('change', (e) => {
      state.filters.nonZero = e.target.checked;
      render();
    });
    const vmSel = $('#view-mode');
    if (vmSel) {
      vmSel.value = state.viewMode;
      vmSel.addEventListener('change', (e) => {
        state.viewMode = e.target.value;
        render();
      });
    }

    $('#btn-sort').addEventListener('click', () => {
      state.filters.sort = state.filters.sort === 'desc' ? 'asc' : 'desc';
      renderSortButton();
      render();
    });

    // ตาราง: แก้ไข / ลบ
    $('#tbody').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (edit) {
        const rec = state.records.find((r) => r.id === edit.dataset.edit);
        if (rec) openEntry(rec);
      } else if (del) {
        deleteEntry(del.dataset.del);
      }
    });

    // modal
    $$('[data-close]').forEach((el) => el.addEventListener('click', () => {
      const m = el.closest('.modal');
      if (m) closeModal('#' + m.id);
    }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal').forEach((m) => { if (!m.hidden) closeModal('#' + m.id); });
      }
    });

    $$('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

    ['f-date', 'f-direction', 'f-entry', 'f-exit', 'f-lots', 'f-gross', 'f-commission'].forEach((id) => {
      const el = $('#' + id);
      el.addEventListener('input', updatePreview);
      el.addEventListener('change', updatePreview);
    });

    $('#btn-save').addEventListener('click', saveEntry);
    $('#btn-delete').addEventListener('click', () => deleteEntry(state.editingId));

    // เติมวันที่ว่าง
    $('#btn-fill-range').addEventListener('click', () => {
      const today = new Date();
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      $('#r-from').value = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
      $('#r-to').value = new Date().toISOString().slice(0, 10);
      openModal('#modal-range');
    });
    $('#btn-range-save').addEventListener('click', () => {
      const from = $('#r-from').value;
      const to = $('#r-to').value;
      if (!from || !to) { toast('กรุณาเลือกช่วงวันที่', 'err'); return; }
      if (from > to) { toast('วันที่เริ่มต้องน้อยกว่าวันที่สิ้นสุด', 'err'); return; }
      try {
        fillRange(from, to, $('#r-skip-weekend').checked);
      } finally {
        closeModal('#modal-range');
      }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderChart, 120);
    });
  }

  // ---------------------------------------------------------------- init
  function init() {
    const loaded = store.load();
    state.settings = calc.normalizeSettings(loaded.settings);
    state.records = loaded.records;
    bind();
    render();
    updateGrossLabel();
    registerServiceWorker();

    // ปุ่มโหลดข้อมูลตัวอย่างจะแสดงเฉพาะเมื่อมีไฟล์ sample-data.js (เวอร์ชันออนไลน์ไม่มี)
    $('#btn-sample').hidden = store.sampleRecords().length === 0;
  }

  /** ลงทะเบียน service worker เพื่อให้เปิดแอปได้ตอนออฟไลน์ (เฉพาะเมื่อเปิดผ่าน http/https) */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* เปิดจาก file:// หรือเบราว์เซอร์ไม่รองรับ — ใช้งานปกติได้ */
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
