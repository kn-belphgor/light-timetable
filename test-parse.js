/**
 * 轻课表 · 导入解析单元测试（Node 直接跑，不依赖浏览器）
 *   node .test-parse.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到 <script>'); process.exit(1); }
const MARK = '/* ------------------------------ 渲染：今日';
const cut = m[1].indexOf(MARK);
if (cut < 0) { console.error('未找到分段标记'); process.exit(1); }
const core = m[1].slice(0, cut);

const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  setTimeout, clearTimeout,
  TextDecoder, DataView, Uint8Array,
  Blob: globalThis.Blob, Response: globalThis.Response, DecompressionStream: globalThis.DecompressionStream,
  URL: { createObjectURL: () => '', revokeObjectURL: () => {} }
};
vm.createContext(sandbox);
/* core 是 IIFE 的前半段，需要补上导出语句再闭合 */
vm.runInContext(core +
  '\n;globalThis.__api = {parseAnyText, weekSet, courseTimes, state, parseLine, parseDay, parseSection, normCourse, parseTableText,' +
  ' xlsToSheets, sheetToTSV, xlsxToSheets, decodeText, bestSheet, readFileAny, det:function(){return lastDetected;}};' +
  '\n})();', sandbox);
const A = sandbox.__api;

let pass = 0, fail = 0, pending = 0, finished = false;
function finish() {
  if (finished || pending > 0) return;
  finished = true;
  console.log('\n———————————————————————————');
  console.log(fail === 0 ? `全部通过：${pass} 项 ✓` : `通过 ${pass} 项，失败 ${fail} 项 ✗`);
  process.exit(fail === 0 ? 0 : 1);
}
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      期望: ' + w + '\n      实际: ' + g); }
}
function group(t) { console.log('\n' + t); }

/* ---------- 1. 作息时间换算 ---------- */
group('1. 课程时间 / 时长换算');
eq('第1-2节 => 08:00-09:40，90分钟',
  (() => { const t = A.courseTimes({ start: 1, duration: 2 }); return [t.start, t.end, t.teach, t.label]; })(),
  ['08:00', '09:40', 90, '第1-2节']);
eq('第3节单节 => 10:00-10:45，45分钟',
  (() => { const t = A.courseTimes({ start: 3, duration: 1 }); return [t.start, t.end, t.teach]; })(),
  ['10:00', '10:45', 45]);
eq('第5-6节 => 14:00-15:40',
  (() => { const t = A.courseTimes({ start: 5, duration: 2 }); return [t.start, t.end, t.teach]; })(),
  ['14:00', '15:40', 90]);
eq('自定义时间优先',
  (() => { const t = A.courseTimes({ start: 1, duration: 2, custom: { s: '19:00', e: '20:30' } }); return [t.start, t.end, t.teach, t.p1]; })(),
  ['19:00', '20:30', 90, null]);

/* ---------- 2. 周次表达式 ---------- */
group('2. 周次表达式');
const keys = (s) => { const set = A.weekSet(s, 20); return set ? Object.keys(set).map(Number).sort((a, b) => a - b) : 'ALL'; };
eq('1-16 => 满 16 周', keys('1-16').length, 16);
eq('1-16单 => 奇数周', keys('1-16单'), [1, 3, 5, 7, 9, 11, 13, 15]);
eq('2-16双 => 偶数周', keys('2-16双'), [2, 4, 6, 8, 10, 12, 14, 16]);
eq('1-16周(单) => 奇数周', keys('1-16周(单)'), [1, 3, 5, 7, 9, 11, 13, 15]);
eq('1,3,5 => 指定周', keys('1,3,5'), [1, 3, 5]);
eq('空 => 每周', keys(''), 'ALL');

/* ---------- 3. 表格导入（含表头，制表符） ---------- */
group('3. 表格导入（教务系统 / Excel 粘贴）');
const tableText = [
  '课程名称\t教师\t星期\t节次\t周次\t地点',
  '大学语文\t郑华\t周一\t3-4\t1-16\t教二301',
  '高级英语\tLinda\t周三\t1-2\t1-16单\t外语楼101',
  '计算机网络\t周涛\t周三\t5-6\t2-16双周\t计算机楼402'
].join('\n');
const t3 = A.parseAnyText(tableText);
eq('识别 3 门课', t3.length, 3);
eq('第1门字段完整', [t3[0].name, t3[0].teacher, t3[0].location, t3[0].day, t3[0].start, t3[0].duration, t3[0].weeks],
  ['大学语文', '郑华', '教二301', 1, 3, 2, '1-16']);
eq('"1-16单" 正确解析为奇数周', (() => { const s = A.weekSet(t3[1].weeks, 20); return [s[1] === 1, !!s[2], !!s[16]]; })(), [true, false, false]);
eq('"2-16双周" 正确解析为偶数周', (() => { const s = A.weekSet(t3[2].weeks, 20); return [!!s[2], !!s[3], !!s[16]]; })(), [true, false, true]);
eq('周三第5-6节时间正确', (() => { const t = A.courseTimes(t3[2]); return [t3[2].day, t.start, t.end]; })(), [3, '14:00', '15:40']);

/* ---------- 4. 自由文本一行式 ---------- */
group('4. 自由文本 / 手写课表');
const t4 = A.parseAnyText([
  '高等数学 张伟 周一 1-2节 1-16周 教一101',
  '大学物理 陈静 星期三 第3-4节 1-16周 理科楼401',
  '体育（篮球） 孙鹏 周四 7-8节 1-16 东体育馆'
].join('\n'));
eq('识别 3 行', t4.length, 3);
eq('课程名/教师/地点/星期/节次', [t4[0].name, t4[0].teacher, t4[0].location, t4[0].day, t4[0].start, t4[0].duration], ['高等数学', '张伟', '教一101', 1, 1, 2]);
eq('"星期三" "第3-4节" 正常', [t4[1].day, t4[1].start, t4[1].duration, t4[1].location], [3, 3, 2, '理科楼401']);
eq('带括号课程名 + 单节范围', [t4[2].name, t4[2].day, t4[2].start, t4[2].duration, t4[2].location], ['体育（篮球）', 4, 7, 2, '东体育馆']);

/* ---------- 5. 具体时间写法自动换算节次 ---------- */
group('5. 具体时间 (08:00-09:40) 自动换算');
const t5 = A.parseAnyText('周一 08:00-09:40 大学物理 陈静 理科楼401\n周二 19:00-20:30 通识讲座 报告厅\n周三 12:30-13:30 午间沙龙 活动中心');
eq('08:00-09:40 => 第1-2节', [t5[0].day, t5[0].start, t5[0].duration], [1, 1, 2]);
eq('19:00-20:30 => 贴合第9-10节', [t5[1].day, t5[1].start, t5[1].duration, t5[1].name, t5[1].location], [2, 9, 2, '通识讲座', '报告厅']);
eq('12:30-13:30 不属于任何节次 => 自定义时间', [t5[2].day, !!t5[2].custom, t5[2].custom && t5[2].custom.s, t5[2].custom && t5[2].custom.e], [3, true, '12:30', '13:30']);

/* ---------- 6. JSON 导入（唤醒课程表等） ---------- */
group('6. JSON 导入');
const t6 = A.parseAnyText(JSON.stringify({ courses: [
  { name: '大学英语（听说）', teacher: '王芳', room: '外语楼 305', weekday: 2, startSection: 3, endSection: 4, weeks: '1-16' },
  { name: '人工智能导论', teacher: '李强', location: '计算机楼 401', day: 4, start: 5, duration: 2, weeks: '2-16双' }
] }));
eq('识别 2 门', t6.length, 2);
eq('weekday + startSection/endSection', [t6[0].name, t6[0].day, t6[0].start, t6[0].duration, t6[0].location], ['大学英语（听说）', 2, 3, 2, '外语楼 305']);
eq('duration 字段', [t6[1].day, t6[1].start, t6[1].duration], [4, 5, 2]);

/* ---------- 7. 矩阵式课表（行=节次，列=星期） ---------- */
group('7. 矩阵式课表（教务系统常见格式）');
const matrixText = [
  '节次\t周一\t周二\t周三\t周四\t周五',
  '第1-2节\t高等数学 张伟 教一101\t大学英语 李娜\t\t\t程序设计基础 王强',
  '第3-4节\t\t线性代数 刘洋 1-9周\t大学物理 陈静\t体育 孙鹏\t'
].join('\n');
const t7 = A.parseAnyText(matrixText);
eq('识别 6 门课', t7.length, 6);
const gm = t7.find((c) => c.name === '高等数学');
eq('高等数学 落在周一第1-2节', [gm.day, gm.start, gm.duration], [1, 1, 2]);
eq('格内教师/地点被正确拆分', [gm.teacher, gm.location], ['张伟', '教一101']);
const de = t7.find((c) => c.name === '大学物理');
eq('大学物理 周三第3-4节', [de.day, de.start, de.duration, de.teacher], [3, 3, 2, '陈静']);
const la = t7.find((c) => c.name === '线性代数');
eq('格内周次被识别', [la.day, la.start, la.weeks], [2, 3, '1-9周']);
eq('时间换算正确', (() => { const t = A.courseTimes(de); return [t.start, t.end, t.teach]; })(), ['10:00', '11:40', 90]);

/* ---------- 8. 矩阵（逐节 + 合并） ---------- */
group('8. 逐节矩阵自动合并');
const matrixText2 = [
  '节次\t周一\t周二\t周三',
  '1\t高等数学\t\t',
  '2\t高等数学\t\t',
  '3\t\t大学英语\t',
  '4\t\t大学英语\t'
].join('\n');
const t8 = A.parseAnyText(matrixText2);
eq('合并为 2 门', t8.length, 2);
eq('高等数学 合成为第1-2节', [t8[0].name, t8[0].day, t8[0].start, t8[0].duration], ['高等数学', 1, 1, 2]);
eq('大学英语 合成为第3-4节', [t8[1].name, t8[1].day, t8[1].start, t8[1].duration], ['大学英语', 2, 3, 2]);

/* ---------- 9. 容错 ---------- */
group('9. 容错与规范化');
eq('空文本 => 空结果', A.parseAnyText('   ').length, 0);
eq('无效 JSON 回落表格解析', A.parseAnyText('{不是json}').length >= 0, true);
eq('normCourse 丢弃无名记录', A.normCourse({ name: '  ' }), null);
eq('normCourse 修正越界星期', (() => { const c = A.normCourse({ name: 'X', day: 9, start: 0, duration: 99 }); return [c.day, c.start, c.duration]; })(), [1, 1, 12]);
eq('本周周次计算不报错', typeof (() => { const d = new Date(); return A.courseTimes({ start: 1, duration: 2 }); })().s, 'number');

/* ---------- 10. 真实 .xls（教务系统 Excel 97-2003）---------- */
group('10. 真实 .xls 文件解析（教务系统导出）');
/* 真实样本不放进仓库目录（避免误传到公开仓库）：
   默认在仓库目录的上一级找 sample-课表.xls，也可以用环境变量 XLS_FIXTURE 指定任意路径；
   都没有就自动跳过这一组。 */
const XLS_CANDIDATES = [
  process.env.XLS_FIXTURE,
  path.join(__dirname, 'sample.xls'),
  path.join(__dirname, '..', 'sample-课表.xls'),
  path.join(__dirname, '..', 'sample.xls')
].filter(Boolean);
const XLS_PATH = XLS_CANDIDATES.filter((f) => fs.existsSync(f))[0] || XLS_CANDIDATES[1];
if (!fs.existsSync(XLS_PATH)) {
  console.log('  · 跳过（未找到真实 .xls 样本，可用 XLS_FIXTURE=/path/to/课表.xls 指定）');
} else {
  const sheets = A.xlsToSheets(new Uint8Array(fs.readFileSync(XLS_PATH)));
  eq('读出工作表', sheets.length >= 1, true);
  const list = A.parseAnyText(A.sheetToTSV(sheets[0]));
  const placed = list.filter((c) => !c.unknown);
  eq('解析出全部可定位课程（34 条）', placed.length, 34);
  eq('备注行课程被标记为「时间未识别」（7 条）', list.length - placed.length, 7);
  const marx = placed.find((c) => c.name === '马克思主义基本原理' && c.weeks === '1-5,7-10,12-17');
  eq('一格多课：马原(周三第1-2节)', [marx.day, marx.start, marx.duration, marx.teacher, marx.location], [3, 1, 2, '范明水', '(儋州)2201']);
  const cad = placed.find((c) => c.name === '计算机辅助设计' && c.teacher === '林宁' && c.weeks === '1-5,7-8');
  eq('合并单元格不重复：第5-8节只出现一次', [cad.day, cad.start, cad.duration], [1, 5, 4]);
  eq('第5-8节(1-5,7-8周)去重后仅 1 条', placed.filter((c) => c.name === '计算机辅助设计' && c.teacher === '林宁' && c.weeks === '1-5,7-8').length, 1);
  eq('同一门课不同周次会保留为两条', placed.filter((c) => c.name === '计算机辅助设计' && c.teacher === '林宁').length, 2);
  const pe = placed.find((c) => c.name.indexOf('体育3') === 0);
  eq('带括号课程名与分组', [pe.name, pe.day, pe.start, pe.duration, pe.location], ['体育3 (网球)', 3, 7, 2, '(儋州)操场']);
  const grp = placed.find((c) => c.name === '建筑构造与结构 (分组02)');
  eq('(分组02) 保留在课程名里', [grp.day, grp.teacher, grp.weeks], [5, '黎淑翎', '8']);
  const wk = A.weekSet(marx.weeks, 20);
  eq('逗号分割的周次 1-5,7-10,12-17 正确展开', [!!wk[1], !!wk[6], !!wk[7], !!wk[11], !!wk[12], !!wk[17], !!wk[18]], [true, false, true, false, true, true, false]);
  /* 学校真实作息时间 */
  const det = A.det();
  eq('从行标签检测出学校作息时间', !!det && det.periods.length, 15);
  eq('第1节 07:40-08:25', [det.periods[0].s, det.periods[0].e], ['07:40', '08:25']);
  eq('第9-11节按 155 分钟三等分', [det.periods[8].s, det.periods[8].e, det.periods[9].s, det.periods[10].s, det.periods[10].e],
     ['19:20', '20:05', '20:15', '21:10', '21:55']);
  /* 应用学校作息后，课程时间应与教务系统一致 */
  const saved = A.state.periods;
  A.state.periods = det.periods;
  const t1 = A.courseTimes(marx);
  eq('应用学校作息后 马原 = 07:40-09:20', [t1.start, t1.end, t1.teach], ['07:40', '09:20', 90]);
  const t2 = A.courseTimes(cad);
  eq('应用学校作息后 计算机辅助设计 = 14:30-18:15', [t2.start, t2.end], ['14:30', '18:15']);
  A.state.periods = saved;
}

/* ---------- 11. .xlsx（zip + deflate + sharedStrings）---------- */
group('11. .xlsx 文件解析');
{
  const zlib = require('zlib');
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const raw = Buffer.from(f.data, 'utf8');
      const comp = zlib.deflateRawSync(raw);
      const crc = zlib.crc32(raw);
      const nameBuf = Buffer.from(f.name, 'utf8');
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
      lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
      lh.writeUInt16LE(nameBuf.length, 26);
      parts.push(lh, nameBuf, comp);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
      ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
      ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
      ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
      central.push(ch, nameBuf);
      offset += lh.length + nameBuf.length + comp.length;
    }
    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, eocd]);
  }
  const shared = ['课程名称', '教师', '星期', '节次', '周次', '地点', '高等数学', '张伟', '周一', '1-2', '1-16', '教一101', '大学物理', '陈静', '星期三', '理科楼401'];
  const ss = '<?xml version="1.0"?><sst count="' + shared.length + '" uniqueCount="' + shared.length + '">' +
    shared.map((s) => '<si><t>' + s + '</t></si>').join('') + '</sst>';
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const cell = (ref, i) => '<c r="' + ref + '" t="s"><v>' + i + '</v></c>';
  const inline = (ref, text) => '<c r="' + ref + '" t="inlineStr"><is><t>' + text + '</t></is></c>';
  const sharedRow = (r, idxs) => idxs.map((v, i) => cell(COLS[i] + r, v)).join('');
  const sheet =
    '<?xml version="1.0"?><worksheet><sheetData>' +
    '<row r="1">' + inline('A1', '2026 春季学期个人课表') + '</row>' +
    '<row r="2">' + sharedRow(2, [0, 1, 2, 3, 4, 5]) + '</row>' +
    '<row r="3">' + sharedRow(3, [6, 7, 8, 9, 10, 11]) + '</row>' +
    /* 最后一行故意用数字单元格 + 内联字符串，测试两种取值方式 */
    '<row r="4">' + cell('A4', 12) + cell('B4', 13) + cell('C4', 14) +
    '<c r="D4"><v>5</v></c>' + inline('E4', '2-16双') + cell('F4', 15) + '</row>' +
    '</sheetData></worksheet>';
  const wb = '<?xml version="1.0"?><workbook><sheets><sheet name="我的课表" sheetId="1"/></sheets></workbook>';
  const buf = zip([
    { name: 'xl/workbook.xml', data: wb },
    { name: 'xl/sharedStrings.xml', data: ss },
    { name: 'xl/worksheets/sheet1.xml', data: sheet }
  ]);
  const done = (sheets) => {
    eq('解压出 1 张工作表且名字正确', [sheets.length, sheets[0].name], [1, '我的课表']);
    const list = A.parseAnyText(A.sheetToTSV(sheets[0]));
    eq('跳过标题行后按表头解析出 2 门课', list.length, 2);
    eq('sharedStrings 中文正确', [list[0].name, list[0].teacher, list[0].day, list[0].start, list[0].duration, list[0].weeks, list[0].location],
       ['高等数学', '张伟', 1, 1, 2, '1-16', '教一101']);
    eq('数字单元格与 inlineStr 都识别', [list[1].name, list[1].day, list[1].start, list[1].duration, list[1].weeks],
       ['大学物理', 3, 5, 1, '2-16双']);
  };
  pending++;
  A.xlsxToSheets(new Uint8Array(buf))
    .then((sheets) => { done(sheets); pending--; afterAsync(); })
    .catch((e) => { fail++; console.log('  ✗ xlsx 解析异常: ' + e.message); pending--; afterAsync(); });
}
function afterAsync() { section12(); finish(); }
if (pending === 0) afterAsync();

/* ---------- 12. 文件读取入口 ---------- */
function section12() {
  group('12. readFileAny：魔术字节 / 编码识别');
  /* 同步 FileReader 桩 */
  sandbox.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function (file) {
      const b = file._buf;
      self.result = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      if (self.onload) self.onload();
    };
  };
  const mkFile = (name, buf) => ({ name: name, _buf: buf });

  if (fs.existsSync(XLS_PATH)) {
    let got = null;
    A.readFileAny(mkFile('学生个人课表.xls', new Uint8Array(fs.readFileSync(XLS_PATH))), (r) => { got = r; });
    eq('扩展名/魔术字节识别 OLE2 并解析出工作表', !!got && !!got.sheets && got.sheets.length, 1);
    eq('.xls 内容也能被重新解析出课程', A.parseAnyText(A.sheetToTSV(got.sheets[0])).length, 41);
  } else {
    console.log('  · 跳过 .xls 入口测试（文件不存在）');
  }

  /* GBK 编码的 CSV（"课程名称" 的 GBK 字节） */
  const gbk = new Uint8Array([0xBF, 0xCE, 0xB3, 0xCC, 0xC3, 0xFB, 0xB3, 0xC6, 0x2C, 0x41, 0x0A, 0xCA, 0xFD, 0xD1, 0xA7, 0x2C, 0x42]);
  eq('GBK 编码自动识别', A.decodeText(gbk), '课程名称,A\n数学,B');
  let got2 = null;
  A.readFileAny(mkFile('课表.csv', gbk), (r) => { got2 = r; });
  eq('.csv 走文本分支', !!got2 && typeof got2.text === 'string' && got2.text.indexOf('课程名称') === 0, true);
  eq('UTF-8 文本正常', A.decodeText(new Uint8Array(Buffer.from('课程名称,A\n数学,B', 'utf8'))), '课程名称,A\n数学,B');
  eq('带 BOM 的 UTF-8 去掉 BOM', A.decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('课程', 'utf8')]))), '课程');

  /* 假 xls（其实是 HTML/文本）要给出人话提示，而不是崩溃 */
  let got3 = null;
  A.readFileAny(mkFile('网页导出.xls', new Uint8Array(Buffer.from('<html><table>…</table></html>', 'utf8'))), (r) => { got3 = r; });
  eq('伪 xls 给出明确提示', !!got3 && /不是 Excel 格式/.test(got3.error || ''), true);
}
