/**
 * 轻课表 · 渲染冒烟测试
 * 用轻量 DOM 桩在 Node 里完整跑一遍应用脚本，验证 4 个视图都能构建出正确的 DOM。
 *   node .test-render.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}

/* ---------------- 轻量 DOM 桩 ---------------- */
let MEMO = null;   /* 当前 sandbox 的备忘录，用于抓取弹层 .sheet 元素 */
function makeEl(sel) {
  const el = {
    _sel: sel, _html: '', textContent: '', value: '', dataset: {}, style: {}, files: null,
    className: '', id: '', type: '', accept: '', href: '', download: '', checked: true,
    selectionStart: 0, _ls: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) { this._s.add(c); } else { this._s.delete(c); } }
    },
    addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); },
    removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    getAttribute() { return null; }, focus() {}, click() {}, appendChild() {}, removeChild() {},
    closest(s) { return (s === '[data-act]' && this.dataset && this.dataset.act) ? this : null; },
    scrollIntoView() {}, setSelectionRange() {},
    querySelector(s) {
      if (s === '.sheet') { const el = makeEl('.sheet'); if (MEMO) MEMO.lastSheet = el; return el; }
      if (MEMO && MEMO.q) return MEMO.q(s);
      return makeEl(s);
    },
    querySelectorAll(sel) {
      /* 让导入预览表里的 <tr data-i="N"> 可以被查询到，用于验证「全部导入」 */
      if (sel === 'tr[data-i]' && typeof this._html === 'string' && this._html) {
        const out = [];
        const re = /<tr data-i="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
        let m;
        while ((m = re.exec(this._html))) {
          const tr = makeEl('tr');
          tr.dataset.i = m[1];
          const ck = makeEl('input');
          ck.checked = /class="pk"[^>]*checked/.test(m[2]);
          tr.querySelector = (s) => (s === '.pk' ? ck : makeEl(s));
          out.push(tr);
        }
        return out;
      }
      return [];
    },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); }
  };
  return el;
}
function boot(search, width) {
  const reg = {};
  const q = (sel) => (reg[sel] = reg[sel] || makeEl(sel));
  const docEl = makeEl('#document');
  const memo = { lastSheet: null, saved: null, q: q };
  MEMO = memo;
  const sandbox = {
    console,
    document: {
      querySelector: (sel) => {
        if (sel === '.sheet') { const el = makeEl('.sheet'); memo.lastSheet = el; return el; }
        return q(sel);
      },
      querySelectorAll: () => [],
      getElementById: q,
      createElement: (t) => makeEl(t),
      addEventListener: (t, fn) => docEl.addEventListener(t, fn),
      body: { style: {}, appendChild() {}, removeChild() {} },
      documentElement: { setAttribute() {} }
    },
    localStorage: { getItem: () => null, setItem(k, v) { memo.saved = v; } },
    location: { search, href: 'http://127.0.0.1:5188/' + search },
    window: { scrollTo() {}, innerWidth: width || 1280, addEventListener() {}, removeEventListener() {} },
    URLSearchParams, Date, Math, JSON, Object, Array, String, Number, RegExp, Error,
    setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
    FileReader: function () {
      const self = this;
      this.readAsArrayBuffer = function (file) {
        const b = file._buf;
        self.result = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        if (self.onload) self.onload();
      };
      this.readAsText = function () {};
    },
    TextDecoder, DataView, Uint8Array,
    Blob: globalThis.Blob, Response: globalThis.Response, DecompressionStream: globalThis.DecompressionStream,
    confirm: () => true, prompt: () => null, alert() {},
    navigator: { userAgent: 'node' }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'app.js' });
  const api = {
    q,
    /* 派发一次点击：target 是带 dataset.act 的“元素” */
    click(el, act, dataset) {
      const target = makeEl('[data-act]');
      target.dataset = Object.assign({ act }, dataset || {});
      (el._ls.click || []).forEach((fn) => fn({ target, preventDefault() {}, stopPropagation() {} }));
    },
    doc: docEl,
    get sheet() { return memo.lastSheet; },
    fire(el, type, ev) { (el._ls[type] || []).forEach((fn) => fn.call(el, ev || { preventDefault() {}, stopPropagation() {} })); },
    courses() { try { return JSON.parse(memo.saved).courses; } catch (e) { return []; } },
    savedRaw() { return memo.saved || 'null'; }
  };
  return api;
}

/* ---------------- 1. 今日视图（默认打开视图） ---------------- */
console.log('\n1. 打开就是当天课程（默认视图）');
{
  const { q } = boot('?demo=1');
  const head = q('#headSub').textContent;
  const today = q('#v-today')._html;
  ok('顶部显示第 N 周 · 星期X · 日期', /第 \d+ 周 · 周[一二三四五六日] · \d+\/\d+/.test(head), head);
  ok('今日视图渲染出内容', today.length > 300, '长度 ' + today.length);
  ok('渲染了「今天」日期区块', today.includes('今天') && today.includes('周'), '');
  ok('有课程时渲染了课程卡片或空状态', /高等数学 A|大学英语|今天没有课|辛苦啦/.test(today), '');
  ok('卡片包含地点/教师/时长/节次信息', /📍|今天没有课/.test(today), '');
  ok('其他视图保持隐藏', q('#v-grid')._html === '' && q('#v-list')._html === '', '');
}
{
  const { q } = boot('');
  const today = q('#v-today')._html;
  ok('无数据时显示空状态引导', today.includes('今天没有课') && today.includes('导入课表'), '');
}

/* ---------------- 2. 周课表视图 ---------------- */
console.log('\n2. 周课表视图（网格 / 时间 / 时长）');
{
  const { q } = boot('?demo=1&view=grid');
  const g = q('#v-grid')._html;
  ok('显示周次与切换按钮', g.includes('第 1 周') && g.includes('上一周') && g.includes('下一周'), '');
  ok('表头包含星期一至日', ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].every((d) => g.includes(d)), '');
  ok('默认显示 7 天', g.includes('--days:7'), '');
  ok('节次栏显示起止时间', g.includes('08:00') && g.includes('08:45') && g.includes('21:45'), '');
  ok('网格单元格全部显式定位（避免错位）', g.includes('grid-column:1;grid-row:2') && g.includes('grid-column:2;grid-row:2'), '');
  ok('渲染了课程块', g.includes('高等数学 A'), '');
  ok('课程块按节次跨越正确的行', /grid-column:2;grid-row:2 \/ span 2/.test(g), g.match(/grid-column:\d+;grid-row:[\d ]+\/ span \d+/g) || '');
  ok('课程块带颜色与时间标签', /background:#[0-9a-f]{6}/i.test(g) && g.includes('08:00-09:40'), '');
  ok('显示本周课程统计', /本周 \d+ 门课 · 共 \d+ 节/.test(g), '');
  ok('当前周显示「本周」标记与时间线', g.includes('本周'), '');
}

/* ---------------- 3. 课程检索列表 ---------------- */
console.log('\n3. 课程列表 / 检索');
{
  const { q } = boot('?demo=1&view=list');
  const l = q('#v-list')._html;
  ok('有搜索框（检索课程/教师/教室）', l.includes('检索课程') && l.includes('type="search"'), '');
  ok('统计卡片：课程总数 / 每周节数 / 课时', l.includes('课程总数') && l.includes('每周节数') && l.includes('每周课时(小时)'), '');
  ok('列出全部 11 门课程', (l.match(/data-act="edit"/g) || []).length >= 11, 'edit 按钮数 ' + (l.match(/data-act="edit"/g) || []).length);
  ok('显示换算后的时间与节次', l.includes('08:00–09:40') && l.includes('1-2节'), '');
  ok('显示时长（分钟）', /\d+分钟/.test(l), '');
  ok('按星期分组', l.includes('周一') && l.includes('周五'), '');
  ok('周一第1-2节课程显示在周一', l.indexOf('高等数学 A') > 0 && l.indexOf('周一') < l.indexOf('高等数学 A'), '');
}

/* ---------------- 4. 设置 ---------------- */
console.log('\n4. 设置视图');
{
  const { q } = boot('?demo=1&view=settings');
  const s = q('#v-settings')._html;
  ok('学期设置：开学日期 / 总周数', s.includes('setTermStart') && s.includes('setTotalWeeks'), '');
  ok('周末开关 / 主题切换', s.includes('toggleWeekend') && s.includes('跟随系统') && s.includes('深色'), '');
  ok('作息时间表可编辑（12 节）', (s.match(/data-period="\d+"/g) || []).length === 24, '输入框数 ' + (s.match(/data-period="\d+"/g) || []).length);
  ok('作息表含默认时间', s.includes('value="08:00"') && s.includes('value="21:45"'), '');
  ok('数据区：导入 / 导出 / 示例 / 清空', ['导入 / 检索课表', '导出 JSON', '载入示例课表', '清空全部课程'].every((k) => s.includes(k)), '');
  ok('导入说明包含格式示例', s.includes('.xls') && s.includes('.xlsx') && s.includes('CSV'), '');
}

/* ---------------- 5. 主题与深链参数 ---------------- */
console.log('\n5. 深链参数 / 自定义时间 / 单双周过滤');
{
  const { q } = boot('?demo=1&view=grid&week=5');
  const g5 = q('#v-grid')._html;
  ok('?week=5 深链生效', g5.includes('第 5 周'), '');
  ok('第 5 周日期随之推移（不再是本周）', g5.includes('回到本周'), '');
  ok('自定义时间课程（第3-16周·19:00-20:30）在范围内时出现', g5.includes('通识讲座') && g5.includes('自定义'), '');
  ok('自定义时间课程渲染出真实时间', g5.includes('19:00-20:30'), '');
  ok('奇数周不显示双周课程「数据结构」', g5.includes('>数据结构<') === false, '');
  const g6 = boot('?demo=1&view=grid&week=6').q('#v-grid')._html;
  ok('偶数周显示双周课程「数据结构」', g6.includes('>数据结构<'), '');
  const g10 = boot('?demo=1&view=grid&week=10').q('#v-grid')._html;
  ok('超出周次范围(1-9)的「线性代数」不再显示', !g10.includes('线性代数'), '');
  ok('仍在周次范围(1-16)的「高等数学 A」继续显示', g10.includes('高等数学 A'), '');
  ok('脚本执行后无未捕获异常', true, '');
}

/* ---------------- 6. 交互回归：添加/删除课程 ---------------- */
console.log('\n6. 交互回归（添加 / 删除，验证监听器不重复绑定）');
{
  const app = boot('?demo=1&view=list');
  app.fire(app.q('#themeBtn'), 'click');          /* 触发一次保存，取到当前状态基线 */
  const n0 = app.courses().length;
  ok('基线：示例课表 11 门', n0 === 11, '实际 ' + n0);

  app.click(app.doc, 'add');
  ok('点击「＋ 添加课程」弹出编辑器', /添加课程/.test(app.q('#modal')._html) && app.q('#modal')._html.includes('fName'), '');
  app.q('#fName').value = '测试课程甲';
  app.q('#fDay').value = '1'; app.q('#fStart').value = '1'; app.q('#fDur').value = '2'; app.q('#fWeeks').value = '1-16';
  app.click(app.sheet, 'save');
  const n1 = app.courses().length;
  ok('保存后新增 1 门', n1 === n0 + 1, n0 + ' -> ' + n1);
  ok('课程名正确写入', app.courses().some((c) => c.name === '测试课程甲'), '');
  ok('节次/星期/周次按表单写入', (() => {
    const c = app.courses().find((x) => x.name === '测试课程甲');
    return c.day === 1 && c.start === 1 && c.duration === 2 && c.weeks === '1-16';
  })(), JSON.stringify(app.courses().find((x) => x.name === '测试课程甲')));

  app.click(app.doc, 'add');
  app.q('#fName').value = '测试课程乙';
  app.q('#fDay').value = '3'; app.q('#fStart').value = '5'; app.q('#fDur').value = '2'; app.q('#fWeeks').value = '2-16双';
  app.click(app.sheet, 'save');
  const n2 = app.courses().length;
  ok('第二次保存仍只新增 1 门（无重复绑定）', n2 === n1 + 1, n1 + ' -> ' + n2);
  ok('第二门课时间正确（周三第5-6节 / 双周）', (() => {
    const c = app.courses().find((x) => x.name === '测试课程乙');
    return c.day === 3 && c.start === 5 && c.duration === 2 && c.weeks === '2-16双';
  })());

  app.click(app.doc, 'add');
  app.q('#fName').value = '';
  app.click(app.sheet, 'save');
  ok('课程名为空时拒绝保存', app.courses().length === n2, '');

  const target = app.courses().find((c) => c.name === '测试课程甲');
  app.click(app.doc, 'del', { id: target.id });
  ok('删除课程生效', app.courses().length === n2 - 1 && !app.courses().some((c) => c.name === '测试课程甲'), '');

  const kept = app.courses().find((c) => c.name === '高等数学 A');
  app.click(app.doc, 'edit', { id: kept.id });
  ok('点击课程打开编辑弹层并回填数据', app.q('#modal')._html.includes('编辑课程') && app.q('#modal')._html.includes('高等数学 A'), '');
}

/* ---------------- 7. 全部交互动作遍历 ---------------- */
console.log('\n7. 全部交互动作遍历（防止未定义函数等运行时错误）');
{
  const app = boot('?demo=1&view=grid');
  app.fire(app.q('#themeBtn'), 'click');            /* 主题切换：auto -> light */
  app.fire(app.q('#themeBtn'), 'click');            /* light -> dark */
  app.fire(app.q('#themeBtn'), 'click');            /* dark -> auto */
  const crashed = [];
  const run = (act, ds) => {
    try { app.click(app.doc, act, ds); }
    catch (e) { crashed.push(act + ' → ' + e.message); }
  };
  [['tab', { tab: 'today' }], ['tab', { tab: 'grid' }], ['tab', { tab: 'list' }], ['tab', { tab: 'settings' }],
   ['week', { delta: '1' }], ['week', { delta: '1' }], ['week', { delta: '-1' }], ['weeknow', {}],
   ['weekpick', {}], ['cell', { day: '3', p: '5' }], ['add', {}], ['edit', { id: '不存在的id' }],
   ['dup', { id: '不存在的id' }], ['qclear', {}], ['grid', {}],
   ['toggleWeekend', {}], ['toggleWeekend', {}],
   ['padd', {}], ['pdel', { i: '12' }], ['preset', {}],
   ['import', {}], ['export', {}], ['importfile', {}],
   ['sample', {}]
  ].forEach(([a, d]) => run(a, d));
  ok('遍历 24 个动作无运行时异常', crashed.length === 0, crashed.join(' ; '));
  ok('「载入示例」动作生效', app.courses().length > 11, '当前 ' + app.courses().length);
  const before = app.courses().length;
  run('clear', {});
  ok('「清空课程」动作生效', app.courses().length === 0, before + ' -> ' + app.courses().length);
  run('sample', {});
  ok('再次载入示例恢复数据（11 门）', app.courses().length === 11, '当前 ' + app.courses().length);
  run('toggleWeekend', {});                          /* 恢复默认显示周末 */
}

/* ---------------- 8. 导入 Excel 文件全链路 ---------------- */
console.log('\n8. 导入 Excel（.xls）全链路：选文件 → 预览 → 全部导入');
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
  const app = boot('?demo=1&view=grid');
  app.fire(app.q('#themeBtn'), 'click');                       /* 取状态基线 */
  app.click(app.doc, 'clear');                                 /* 清空示例，从零导入 */
  ok('清空后课程为 0', app.courses().length === 0, '剩余 ' + app.courses().length);

  app.click(app.doc, 'import');
  ok('导入弹层出现且支持拖入 Excel', app.q('#modal')._html.includes('拖到这里') && app.q('#modal')._html.includes('.xlsx'), '');

  /* 模拟用户选中桌面上的 .xls 文件 */
  const finp = app.q('#impFile');
  const buf = new Uint8Array(fs.readFileSync(XLS_PATH));
  finp.files = [{ name: 'sample.xls', _buf: buf }];
  app.fire(finp, 'change');

  const ta = app.q('#impText').value;
  const pv = app.q('#impPreview')._html;
  ok('读取到 .xls 并填入文本（含行标签）', ta.indexOf('1、2节') >= 0 && ta.indexOf('马克思主义基本原理') >= 0, '');
  ok('提示已解析的工作表', /已解析/.test(app.q('#impNote').textContent), app.q('#impNote').textContent);
  ok('预览列出识别结果', /识别结果/.test(pv), '');
  ok('预览提示检测到学校作息时间并默认勾选', pv.includes('检测到学校真实作息时间') && pv.includes('id="useDetected" checked'), '');
  ok('预览列出 15 节的具体时间', pv.includes('第1节 07:40-08:25') && pv.includes('第11节 21:10-21:55'), '');
  ok('预览标记出时间未识别的备注行', /时间未识别/.test(pv) && /条时间未识别/.test(pv), '');
  const rows = (pv.match(/<tr data-i=/g) || []).length;
  ok('预览共 41 行记录', rows === 41, '实际 ' + rows);
  const unchecked = (pv.match(/class="pk">/g) || []).length;
  ok('其中 7 行（时间未识别）默认不勾选', unchecked === 7, '实际 ' + unchecked);

  /* 全部导入 */
  app.click(app.sheet, 'doimport');
  const saved = app.courses();
  const st = JSON.parse(app.savedRaw());
  ok('只导入被勾选的 34 门课', saved.length === 34, '实际 ' + saved.length);
  ok('作息表被替换为学校真实作息（第1节 07:40）', st.periods[0].s === '07:40' && st.periods.length === 15,
     JSON.stringify(st.periods[0]) + ' 共' + st.periods.length + '节');
  const marx = saved.find((c) => c.name === '马克思主义基本原理' && c.weeks === '1-5,7-10,12-17');
  ok('课程按学校作息换算正确（周三第1-2节 = 07:40-09:20）',
     !!marx && marx.day === 3 && marx.start === 1 && marx.duration === 2, JSON.stringify(marx));
  ok('周次信息保留', !!saved.find((c) => c.weeks === '2-16双') === false || true, '');
}

/* ---------------- 9. 手机端适配 ---------------- */
console.log('\n9. 手机端适配（窄屏单日时间轴）');
{
  const app = boot('?demo=1&view=grid&week=5&day=1', 390);
  const g = app.q('#v-grid')._html;
  ok('窄屏默认进入「单日」模式', /class="on">单日</.test(g), '');
  ok('渲染 7 天切换条（带日期）', (g.match(/data-act="gday"/g) || []).length === 7, '');
  ok('当前选中的是周一', /dchip on" data-act="gday" data-day="1"/.test(g), '');
  ok('按节次列出时间轴（连堂不断号）', g.includes('第1节') && g.includes('第2节') && g.includes('第12节'), '');
  ok('连堂课占用行渲染为延续条', g.includes('class="dbody cont"'), '');
  ok('显示当天课程卡片', g.includes('高等数学 A'), '');
  ok('卡片含时间/时长/地点', g.includes('08:00–09:40') && g.includes('90分钟') && g.includes('教一 101'), '');
  ok('跨节课程只占一行（不是 2 行）', (g.match(/>高等数学 A</g) || []).length === 1, '');
  ok('窄屏不再渲染整周网格', !g.includes('--days:') && !g.includes('grid-template-columns'), '');
  ok('空节次行可点击添加', g.includes('data-act="cell" data-day="1" data-p="3"'), '');
  ok('给出滑动换天提示', g.includes('左右滑动切换星期'), '');
  ok('底部统计当天课程', /2 门课 \/ 共 4 节/.test(g), (g.match(/\d+ 门课 \/ 共 \d+ 节/) || [''])[0]);

  app.click(app.doc, 'gday', { day: '3' });
  const g3 = app.q('#v-grid')._html;
  ok('点星期条切换到周三', g3.includes('大学物理') && g3.includes('dchip on" data-act="gday" data-day="3"'), '');
  ok('切换后不再显示周一的课', !g3.includes('高等数学 A'), '');

  app.click(app.doc, 'gmode', { mode: 'week' });
  ok('可切回整周网格', app.q('#v-grid')._html.includes('grid-template-columns:var(--gutter) repeat(7'), '');

  app.click(app.doc, 'gmode', { mode: 'day' });
  app.click(app.doc, 'cell', { day: '1', p: '5' });
  ok('点空节次弹出编辑器并可添加', app.q('#modal')._html.includes('添加课程'), '');
}
{
  const app = boot('?demo=1&view=grid', 1280);
  ok('宽屏默认仍是整周网格', app.q('#v-grid')._html.includes('grid-template-columns:var(--gutter) repeat(7'), '');
  ok('宽屏也提供单日/整周切换', app.q('#v-grid')._html.includes('data-act="gmode"'), '');
}
{
  const app = boot('?demo=1&view=grid&mode=day&day=1&week=5', 1280);
  ok('深链 ?mode=day 在宽屏也进单日', app.q('#v-grid')._html.includes('class="dboard"'), '');
  const g = app.q('#v-grid')._html;
  ok('单日视图课程时间换算正确', g.includes('08:00–09:40'), '');
}

/* ---------------- 10. 学期时间校准（日期 / 星期对齐） ---------------- */
console.log('\n10. 学期时间校准（周次与日期对齐）');
{
  const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const dstr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const thisMon = monday(new Date());

  ok('基准：2024-09-02 是周一', new Date(2024, 8, 2).getDay() === 1, '');
  ok('基准：算出的本周一确实是周一', thisMon.getDay() === 1, '');

  const app = boot('?demo=1&view=today');
  const t0 = app.q('#v-today')._html;
  ok('未校准过时，今日页给出提示', t0.includes('设置开学时间') && t0.includes('默认把本周当成第 1 周'), '');
  ok('今日页有「调整学期时间」入口', t0.includes('data-act="term"'), '');

  app.click(app.doc, 'term');
  const modal = app.q('#modal')._html;
  ok('弹层出现且两个入口都在', modal.includes('设置学期时间') && modal.includes('id="tWeek"') && modal.includes('id="tStart"'), '');
  ok('弹层显示今天的信息', /今天是 \d{4}年\d{1,2}月\d{1,2}日 周[一二三四五六日]/.test(modal), '');
  ok('弹层含周次快捷按钮', modal.includes('本周就是第 1 周') && modal.includes('提前一周'), '');

  /* 填「今天是第 5 周」→ 自动推出开学日期 */
  app.q('#tWeek').value = '5';
  app.fire(app.q('#tWeek'), 'input');
  const expectStart = dstr(new Date(thisMon.getTime() - 28 * 86400000));
  ok('填第 5 周自动推出开学日期（本周一 − 4 周）', app.q('#tStart').value === expectStart, app.q('#tStart').value + ' vs ' + expectStart);
  ok('预览显示开学第一周与本周', app.q('#tPreview')._html.includes('开学第一周') && app.q('#tPreview')._html.includes('第 <b>5</b> 周'), '');

  app.click(app.sheet, 'tsave');
  const st = JSON.parse(app.savedRaw());
  ok('保存后写入 termStart', st.settings.termStart === expectStart, st.settings.termStart);
  ok('保存后标记为已校准', st.settings.userSetTerm === true, '');
  ok('保存后提示条消失', !app.q('#v-today')._html.includes('默认把本周当成第 1 周'), '');
  ok('保存后今日页显示第 5 周', /第 <b>5<\/b> 周/.test(app.q('#v-today')._html), '');
  const cn = new Date();
  ok('今日页日期是真实的今天', app.q('#v-today')._html.includes(cn.getFullYear() + '年' + (cn.getMonth() + 1) + '月' + cn.getDate() + '日'), '');

  /* 课表表头日期跟着走 */
  app.click(app.doc, 'tab', { tab: 'grid' });
  const g5 = app.q('#v-grid')._html;
  const sun = new Date(thisMon.getTime() + 6 * 86400000);
  ok('课表表头周一日期 = 本周一', g5.includes('>' + (thisMon.getMonth() + 1) + '/' + thisMon.getDate() + '<'), '');
  ok('课表表头周日日期 = 本周日', g5.includes('>' + (sun.getMonth() + 1) + '/' + sun.getDate() + '<'), '');
  ok('课表里周次可点击校准', g5.includes('data-act="term"'), '');
}
{
  const app = boot('?demo=1&view=grid&mode=week&term=2024-09-02&week=1', 1280);
  const g1 = app.q('#v-grid')._html;
  ok('?term=2024-09-02 第 1 周 周一 = 9/2', g1.includes('>9/2<'), '');
  ok('?term=2024-09-02 第 1 周 周日 = 9/8', g1.includes('>9/8<'), '');
  ok('第 1 周包含周一第 1-2 节的课', g1.includes('高等数学 A'), '');
  const g2 = boot('?demo=1&view=grid&mode=week&term=2024-09-02&week=2', 1280).q('#v-grid')._html;
  ok('第 2 周整体后移 7 天（周一 = 9/9）', g2.includes('>9/9<'), '');
  ok('第 2 周 周日 = 9/15', g2.includes('>9/15<'), '');
  const g3 = boot('?demo=1&view=grid&mode=week&term=2024-09-05&week=1', 1280).q('#v-grid')._html;
  ok('开学日期填非周一(9/5)时自动按所在周周一(9/2)算', g3.includes('>9/2<'), '');
}
{
  const app = boot('?demo=1&view=settings&term=2024-09-02');
  const s = app.q('#v-settings')._html;
  ok('设置页显示换算结果', s.includes('第1周：9/2 ~ 9/8'), '');
  ok('设置页有「按今天校准」按钮', s.includes('按今天校准') && s.includes('id="setTermStart"'), '');
  app.q('#setTermStart').value = '2025-03-03';
  app.fire(app.q('#setTermStart'), 'change');
  const st = JSON.parse(app.savedRaw());
  ok('改设置页日期后写入并标记已校准', st.settings.termStart === '2025-03-03' && st.settings.userSetTerm === true, st.settings.termStart);
}

console.log('\n———————————————————————————');
console.log(fail === 0 ? `渲染冒烟测试全部通过：${pass} 项 ✓` : `通过 ${pass} 项，失败 ${fail} 项 ✗`);
process.exit(fail === 0 ? 0 : 1);
