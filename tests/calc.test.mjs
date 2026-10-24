/**
 * ทดสอบสูตรคำนวณเทียบกับตัวเลขจริงในใบบันทึก (จากภาพที่ผู้ใช้ให้มา)
 * รัน: npm test
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const calc = require(path.join(here, '..', 'assets', 'calc.js'));

const SETTINGS = { fxRate: 33, commissionRate: 30, divisor: 100, unit: 'cents', contractSize: 100 };

// [วันที่, US$, -30%, US$ TOTAL, USD TOTAL, Daily THB] — อ่านจากภาพใบบันทึก
const SHEET_ROWS = [
  ['2026-09-15', 122.00, 36.60, 85.40, 0.85, 28.18],
  ['2026-09-16', 18352.00, 5505.60, 12846.40, 128.46, 4239.31],
  ['2026-09-17', 10356.00, 3106.80, 7249.20, 72.49, 2392.24],
  ['2026-09-18', 7095.00, 2128.50, 4966.50, 49.67, 1638.95],
  ['2026-09-19', 0, 0, 0, 0, 0],
  ['2026-09-20', 0, 0, 0, 0, 0],
  ['2026-09-21', 4218.00, 1265.40, 2952.60, 29.53, 974.36],
  ['2026-09-22', 4375.00, 1312.50, 3062.50, 30.63, 1010.63],
  ['2026-09-23', 3877.00, 1163.10, 2713.90, 27.14, 895.59],
  ['2026-09-24', 4131.00, 1239.30, 2891.70, 28.92, 954.26],
  ['2026-09-25', 3050.00, 915.00, 2135.00, 21.35, 704.55],
  ['2026-09-26', 0, 0, 0, 0, 0],
  ['2026-09-27', 0, 0, 0, 0, 0],
  ['2026-09-28', 65251.00, 19575.30, 45675.70, 456.76, 15072.98],
  ['2026-09-29', 6981.00, 2094.30, 4886.70, 48.87, 1612.61],
  ['2026-09-30', 6651.00, 1995.30, 4655.70, 46.56, 1536.38],
  ['2026-10-01', 15785.00, 4735.50, 11049.50, 110.50, 3646.34],
  ['2026-10-02', 26682.00, 8004.60, 18677.40, 186.77, 6163.54],
  ['2026-10-03', 0, 0, 0, 0, 0],
  ['2026-10-04', 0, 0, 0, 0, 0],
  ['2026-10-05', 9494.00, 2848.20, 6645.80, 66.46, 2193.11]
];

let passed = 0;
function check(name, actual, expected) {
  assert.equal(actual, expected, `${name}: ได้ ${actual} แต่ควรเป็น ${expected}`);
  passed++;
}

// ---- 1. ทีละแถว ต้องตรงกับใบบันทึกทุกคอลัมน์ ----
console.log('• ทดสอบรายการรายวันเทียบกับใบบันทึก');
for (const [date, gross, commission, net, usdTotal, dailyThb] of SHEET_ROWS) {
  const r = calc.computeRecord({ gross, commissionRate: null }, SETTINGS);
  check(`${date} US$`, r.gross, gross);
  check(`${date} -30%`, r.commission, commission);
  check(`${date} US$ TOTAL`, r.net, net);
  check(`${date} USD TOTAL`, r.usdTotal, usdTotal);
  check(`${date} Daily THB`, r.dailyThb, dailyThb);
}

// ---- 2. ยอดรวมทั้งใบ (คอลัมน์สรุปด้านบนของภาพ) ----
console.log('• ทดสอบยอดรวมตามกล่องสรุปในภาพ');
const totalGross = 394419.00; // ยอดขั้นต้นของทั้งชีต (มีเดือนก่อนหน้าในภาพที่ไม่ได้แสดง)
const sum = calc.summarize([{ gross: totalGross, commissionRate: null }], SETTINGS);
check('Commission (USD)', sum.commission, 118325.70);
check('US$ TOTAL (USD)', sum.net, 276093.30);
check('USD TOTAL', sum.usdTotal, 2760.93);
check('Total (THB)', sum.totalThb, 91110.79);
check('Commission (THB)', sum.commissionThb, 39047.48);

// ---- 3. ยอดรวมจากแถวที่มองเห็นในภาพ ----
console.log('• ทดสอบยอดรวมของแถวในภาพ');
const rows = SHEET_ROWS.map(([date, gross]) => ({ date, gross, commissionRate: null }));
const computed = calc.computeAll(rows, SETTINGS);
const sum2 = calc.summarize(computed, SETTINGS);
check('ผลรวม US$', sum2.gross, 186420.00);
check('ผลรวม US$ TOTAL', sum2.net, 130494.00);
check('ผลรวม USD TOTAL', sum2.usdTotal, 1304.94);
check('ผลรวม Daily THB', sum2.totalThb, 43063.02); // รวมจากค่าที่ยังไม่ปัด (ตรงกับกล่อง Total (THB) ในภาพ)
check('จำนวนวันที่มียอด', sum2.tradingDays, 15);

// ---- 4. P/L จากราคาเข้า/ออก/ล็อต ----
console.log('• ทดสอบการคำนวณ P/L จากราคาและล็อต');
check('Buy 0.1 lot +18.35', calc.computePnlUsd('buy', 2650.00, 2668.35, 0.1, 100), 183.50);
check('Sell 0.1 lot -18.35', calc.computePnlUsd('sell', 2668.35, 2650.00, 0.1, 100), 183.50);
check('แปลง USD เป็นเซนต์', calc.usdToSheetUnits(183.50, SETTINGS), 18350.00);
check('แปลงเซนต์เป็น USD', calc.sheetUnitsToUsd(18350.00, SETTINGS), 183.50);

// ---- 5. วันในสัปดาห์ ----
console.log('• ทดสอบวันในสัปดาห์');
check('15/09/2026', calc.weekday('2026-09-15').en, 'Tue');
check('19/09/2026', calc.weekday('2026-09-19').en, 'Sat');
check('20/09/2026', calc.weekday('2026-09-20').en, 'Sun');
check('01/10/2026', calc.weekday('2026-10-01').en, 'Thu');
check('05/10/2026', calc.weekday('2026-10-05').en, 'Mon');

// ---- 6. การปัดเลขแบบ Excel ----
console.log('• ทดสอบการปัดทศนิยม');
check('3646.335 → 3646.34', calc.round2(11049.50 / 100 * 33), 3646.34);
check('1010.625 → 1010.63', calc.round2(3062.50 / 100 * 33), 1010.63);
check('-1.005 → -1.01', calc.round2(-1.005), -1.01);

// ---- 7. การเรียงวันที่ (วันที่ล่าสุดขึ้นแถวแรก) ----
console.log('• ทดสอบการเรียงวันที่');
const store = require(path.join(here, '..', 'assets', 'store.js'));
const sample = [
  { id: 'a', date: '2026-09-15' },
  { id: 'b', date: '2026-10-05' },
  { id: 'c', date: '2026-09-28' }
];
check('เรียงแบบล่าสุดก่อน', store.sortRecords(sample, 'desc').map((r) => r.date).join(','), '2026-10-05,2026-09-28,2026-09-15');
check('เรียงแบบเก่าสุดก่อน', store.sortRecords(sample, 'asc').map((r) => r.date).join(','), '2026-09-15,2026-09-28,2026-10-05');
check('ค่าเริ่มต้น = ล่าสุดก่อน', store.sortRecords(sample).map((r) => r.date)[0], '2026-10-05');

console.log(`\n✅ ผ่านทั้งหมด ${passed} ข้อ`);
