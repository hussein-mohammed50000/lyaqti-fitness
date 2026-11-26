'use strict';
// ---------- storage (same key as v1 so old data is kept) ----------
const KEY = 'fit.v1';
const defaults = () => ({ settings: { kcal: 2650, protein: 130 }, profile: null, meals: [], weights: [], workouts: [] });
let S;
try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = defaults(); }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('fit-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('photos', mode);
    const out = fn(t.objectStore('photos'));
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
const photoAll = () => tx('readonly', s => s.getAll());
const photoPut = p => tx('readwrite', s => s.put(p));
const photoDel = id => tx('readwrite', s => s.delete(id));

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const num = v => { const n = parseFloat(String(v).replace(',', '.').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c))); return isFinite(n) ? n : NaN; };
const fmtDate = s => parse(s).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });
const r1 = n => Math.round(n * 10) / 10;
const ar = n => Number(n).toLocaleString('ar-EG');
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 2200); }
const IC = {
  today: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  weight: '<path d="M4 20h16M6 16l4-5 3 3 5-7"/>',
  photos: '<rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-3 5-3 8h3v10"/>',
  dumb: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'
};
const svg = k => `<svg viewBox="0 0 24 24">${IC[k]}</svg>`;

// ---------- profile + calorie math ----------
const ACT = {
  1: { f: 1.2, t: 'قليل الحركة', s: 'مكتبي ومفيش تمرين' },
  2: { f: 1.375, t: 'خفيف', s: 'تمرين 1-2 يوم' },
  3: { f: 1.55, t: 'متوسط', s: 'تمرين 3-5 أيام' },
  4: { f: 1.725, t: 'عالي', s: 'تمرين 6-7 أيام' },
  5: { f: 1.9, t: 'شديد جدا', s: 'تمرين مرتين يوميا أو شغل بدني' }
};
const GOALS = {
  bulk: { t: 'زيادة وزن وعضل', paces: [250, 400, 550], pt: ['خفيفة', 'متوسطة', 'قوية'], g: 1.8, def: 0 },
  keep: { t: 'تثبيت الوزن', paces: [0], pt: ['ثابت'], g: 1.6, def: 0 },
  cut: { t: 'تنشيف / خسارة دهون', paces: [-300, -450, -600], pt: ['هادئة', 'متوسطة', 'سريعة'], g: 2.0, def: 0 }
};
const LEVELS = { b: 'مبتدئ', m: 'متوسط', a: 'متقدم' };
function curWeight() {
  const ws = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
  return ws.length ? ws[ws.length - 1].kg : (S.profile ? S.profile.weight : 70);
}
function calc(p, w) {
  w = w || p.weight;
  const bmr = 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * ACT[p.act].f;
  const G = GOALS[p.goal], adj = G.paces[Math.min(p.pace, G.paces.length - 1)];
  const kcal = Math.round((tdee + adj) / 10) * 10;
  const protein = Math.round(w * G.g);
  const fat = Math.round(w * 0.9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), adj, kcal, protein, fat, carbs, w };
}
function targets() {
  if (!S.profile) return { kcal: S.settings.kcal, protein: S.settings.protein, fat: 0, carbs: 0 };
  const c = calc(S.profile, curWeight());
  if (S.profile.ovK) c.kcal = S.profile.ovK;
  if (S.profile.ovP) c.protein = S.profile.ovP;
  return c;
}
function explain(p, w) {
  const c = calc(p, w), G = GOALS[p.goal];
  return `BMR = 10×${w} + 6.25×${p.height} − 5×${p.age} ${p.sex === 'm' ? '+ 5' : '− 161'} = ${c.bmr}
TDEE = ${c.bmr} × ${ACT[p.act].f} = ${c.tdee}
Target = ${c.tdee} ${c.adj >= 0 ? '+' : '−'} ${Math.abs(c.adj)} = ${c.kcal} kcal
Protein = ${w} × ${G.g} g = ${c.protein} g`;
}

// ---------- onboarding ----------
let ob = null, obStep = 0;
function startOb(edit) {
  const p = S.profile;
  ob = p ? { ...p } : { name: '', sex: 'm', age: '', height: '', weight: '', act: 3, level: 'm', goal: 'bulk', pace: 0 };
  ob.edit = !!edit; obStep = 0; renderOb();
}
const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(o => `<button type="button" data-v="${o.v}" class="${String(cur) === String(o.v) ? 'on' : ''}">${o.t}${o.s ? `<small>${o.s}</small>` : ''}</button>`).join('')}</div>`;
function renderOb() {
  document.body.classList.add('onb');
  $('#hdr').style.display = 'none'; $('#tabs').style.display = 'none';
  const dots = `<div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i <= obStep ? 'on' : ''}"></i>`).join('')}</div>`;
  let h = '';
  if (obStep === 0) h = `<div class="logo">${svg('bolt')}</div><h1 style="text-align:center">أهلا بيك في لياقتي</h1>
    <p class="lead" style="text-align:center">هنسأل كام سؤال بسيط عشان نحسبلك السعرات والبروتين على جسمك إنت، مش رقم ثابت.</p>
    <label class="f">اسمك (اختياري)</label><input id="o_name" value="${esc(ob.name || '')}" placeholder="مثلا: حسين">
    <label class="f">النوع</label>${seg('sex', [{ v: 'm', t: 'ذكر' }, { v: 'f', t: 'أنثى' }], ob.sex)}
    <div class="row"><div><label class="f">السن</label><div class="unit"><input id="o_age" inputmode="numeric" value="${ob.age}" placeholder="25"><span>سنة</span></div></div>
    <div><label class="f">الطول</label><div class="unit"><input id="o_h" inputmode="decimal" value="${ob.height}" placeholder="170"><span>سم</span></div></div></div>
    <label class="f">وزنك الحالي</label><div class="unit"><input id="o_w" inputmode="decimal" value="${ob.weight}" placeholder="77"><span>كجم</span></div>`;
  else if (obStep === 1) h = `<h1>نشاطك اليومي</h1><p class="lead">اختار الأقرب لحياتك الأسبوعية (شغلك + التمرين).</p>
    ${seg('act', Object.entries(ACT).map(([k, a]) => ({ v: k, t: a.t, s: a.s })), ob.act)}
    <label class="f">مستواك في التمرين</label>${seg('level', Object.entries(LEVELS).map(([k, t]) => ({ v: k, t })), ob.level)}`;
  else if (obStep === 2) h = `<h1>هدفك</h1><p class="lead">ده بيحدد هنزود أو ننقص كام سعر عن احتياجك.</p>
    ${seg('goal', Object.entries(GOALS).map(([k, g]) => ({ v: k, t: g.t })), ob.goal)}
    ${GOALS[ob.goal].paces.length > 1 ? `<label class="f">سرعة التغيير</label>${seg('pace', GOALS[ob.goal].paces.map((a, i) => ({ v: i, t: GOALS[ob.goal].pt[i], s: (a > 0 ? '+' : '−') + Math.abs(a) + ' سعر' })), ob.pace)}` : ''}
    <div class="note">للزيادة النضيفة ابدأ بـ "خفيفة" أو "متوسطة". الزيادة السريعة بتزود دهون أكتر.</div>`;
  else { const c = calc(ob, num(ob.weight)); h = `<h1>أهدافك جاهزة</h1><p class="lead">محسوبة بمعادلة Mifflin-St Jeor على بياناتك.</p>
    <div class="card hero"><div class="mut">سعراتك اليومية</div><div class="big">${ar(c.kcal)} <span style="font-size:16px">سعر</span></div>
    <div class="macros" style="margin-top:12px"><div class="mac"><b>${ar(c.protein)} جم</b><span class="mut">بروتين</span></div><div class="mac"><b>${ar(c.carbs)} جم</b><span class="mut">كارب</span></div><div class="mac"><b>${ar(c.fat)} جم</b><span class="mut">دهون</span></div></div></div>
    <div class="card"><div class="mut">الحساب</div><div class="formula">${esc(explain(ob, num(ob.weight)))}</div>
    <div class="note">البروتين ${GOALS[ob.goal].g} جم لكل كجم، والدهون 0.9 جم لكل كجم، والباقي كارب. لو الميزانية مش مكفية ممكن تقلل السعرات بعدين من تبويب "أنا".</div></div>`; }
  $('#app').innerHTML = `<div class="ob">${dots}${h}<div class="row" style="margin-top:20px">${obStep > 0 ? '<button class="btn sec" id="obBack">رجوع</button>' : (ob.edit ? '<button class="btn sec" id="obCancel">إلغاء</button>' : '')}<button class="btn" id="obNext">${obStep === 3 ? 'ابدأ' : 'التالي'}</button></div></div>`;
  document.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = g.dataset.seg; ob[k] = (k === 'act' || k === 'pace') ? Number(b.dataset.v) : b.dataset.v;
    if (k === 'goal') ob.pace = 0; grabOb(); renderOb();
  }));
  if ($('#obBack')) $('#obBack').onclick = () => { grabOb(); obStep--; renderOb(); };
  if ($('#obCancel')) $('#obCancel').onclick = () => { ob = null; document.body.classList.remove('onb'); showShell(); render(); };
  $('#obNext').onclick = () => {
    grabOb();
    if (obStep === 0) {
      const a = num(ob.age), h = num(ob.height), w = num(ob.weight);
      if (!(a >= 12 && a <= 90)) return toast('اكتب سن صحيح');
      if (!(h >= 120 && h <= 230)) return toast('اكتب الطول بالسنتيمتر');
      if (!(w >= 30 && w <= 250)) return toast('اكتب الوزن بالكيلو');
    }
    if (obStep < 3) { obStep++; renderOb(); window.scrollTo(0, 0); return; }
    const old = S.profile || {};
    S.profile = { name: ob.name.trim(), sex: ob.sex, age: num(ob.age), height: num(ob.height), weight: num(ob.weight), act: ob.act, level: ob.level, goal: ob.goal, pace: ob.pace, ovK: old.ovK || 0, ovP: old.ovP || 0 };
    if (!S.weights.some(x => x.date === today()) && !(S.weights.length && ob.edit)) S.weights.push({ id: uid(), date: today(), kg: S.profile.weight });
    save(); ob = null; document.body.classList.remove('onb'); showShell(); tab = 'today'; render(); window.scrollTo(0, 0);
  };
}
function grabOb() {
  if (obStep === 0 && $('#o_age')) { ob.name = $('#o_name').value; ob.age = $('#o_age').value; ob.height = $('#o_h').value; ob.weight = $('#o_w').value; }
}

// ---------- presets ----------
const MEALT = ['فطار', 'غداء', 'عشا', 'سناك'];
const FOODS = [
  ['رز مطبوخ (كوب)', 205, 4], ['صدر فراخ (150 جم)', 250, 46], ['بيضة', 70, 6], ['فول (طبق)', 220, 12], ['عدس (طبق)', 230, 16],
  ['تونة (علبة)', 130, 28], ['لبن (كوب)', 150, 8], ['زبادي (علبة)', 100, 6], ['مكرونة (طبق)', 300, 10], ['عيش بلدي (رغيف)', 250, 8],
  ['موزة', 105, 1], ['بطاطس (حبة)', 130, 3], ['فول سوداني (30 جم)', 170, 7], ['شوفان (50 جم)', 190, 7], ['كبدة (100 جم)', 175, 26]
];
const EXG = {
  'صدر': ['بنش برس', 'بنش مائل دامبل', 'فلاي', 'ضغط (Push-up)', 'ديبس'],
  'ضهر': ['سحب أمامي (لات)', 'تجديف بار', 'تجديف كابل', 'ديدلفت', 'سحب ضيق'],
  'رجل': ['سكوات', 'ليج برس', 'رومانيان ديدلفت', 'ليج كيرل', 'سمانة'],
  'كتف': ['ضغط كتف دامبل', 'رفرفة جانبي', 'رفرفة خلفي', 'ضغط كتف بار'],
  'دراع': ['باي بار', 'باي دامبل', 'تراي كابل', 'ضغط فرنسي', 'هامر']
};
let selG = 'صدر', selType = 'غداء';

// ---------- today ----------
let tab = 'today', day = today();
function ring(frac, over) {
  const R = 70, C = 2 * Math.PI * R, f = Math.max(0, Math.min(1, frac));
  return `<svg viewBox="0 0 170 170"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4a7"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
  <circle cx="85" cy="85" r="${R}" fill="none" stroke="#0a1124" stroke-width="14"/>
  <circle cx="85" cy="85" r="${R}" fill="none" stroke="${over ? '#f87171' : 'url(#g)'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}"/></svg>`;
}
function viewToday() {
  const T = targets();
  const meals = S.meals.filter(m => m.date === day);
  const kcal = meals.reduce((a, m) => a + m.kcal, 0), prot = meals.reduce((a, m) => a + (m.p || 0), 0);
  const wk = S.workouts.filter(w => w.date === day);
  const names = [...new Set(S.workouts.map(w => w.exercise))];
  const left = Math.round(T.kcal - kcal);
  return `
  <div class="card"><div class="row" style="margin:0"><button class="btn sec" id="prev" style="width:56px;flex:none;margin:0">›</button>
    <input type="date" id="day" value="${day}"><button class="btn sec" id="next" style="width:56px;flex:none;margin:0">‹</button></div></div>

  <div class="card hero"><h2>${svg('bolt')} ملخص اليوم</h2>
    <div class="ring">${ring(kcal / T.kcal, kcal > T.kcal)}<div class="c"><b>${ar(Math.round(kcal))}</b><span>من ${ar(T.kcal)} سعر</span><span>${left >= 0 ? 'باقي ' + ar(left) : 'زيادة ' + ar(-left)}</span></div></div>
    <div class="row" style="margin-bottom:0;align-items:flex-end"><div><div class="mut">بروتين</div><b>${ar(r1(prot))}</b> <span class="mut">/ ${ar(T.protein)} جم</span><div class="bar pr"><i style="width:${Math.min(100, prot / T.protein * 100)}%"></i></div></div></div>
    ${T.carbs ? `<div class="mut" style="margin-top:10px">الهدف: كارب ${ar(T.carbs)} جم · دهون ${ar(T.fat)} جم</div>` : ''}</div>

  <div class="card"><h2>${svg('food')} أضف وجبة</h2>
    <div class="chips">${MEALT.map(t => `<button data-mt="${t}" class="${t === selType ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="mut" style="margin-bottom:6px">اختار أكلة سريعة (قيم تقريبية) أو اكتب بنفسك:</div>
    <div class="chips">${FOODS.map((f, i) => `<button data-food="${i}">${f[0]}</button>`).join('')}</div>
    <form id="mealForm"><div class="row"><input name="name" placeholder="اسم الوجبة" required></div>
      <div class="row"><input name="kcal" inputmode="decimal" placeholder="سعرات" required><input name="p" inputmode="decimal" placeholder="بروتين جم"></div>
      <button class="btn">أضف الوجبة</button></form>
    ${meals.map(m => `<div class="item"><span>${m.type ? '<span class="mut">' + esc(m.type) + ' · </span>' : ''}${esc(m.name)}<br><span class="mut">${ar(Math.round(m.kcal))} سعر · ${ar(r1(m.p || 0))} جم بروتين</span></span><button class="btn del" data-delmeal="${m.id}">حذف</button></div>`).join('')}
  </div>

  <div class="card"><h2>${svg('dumb')} تمرين النهاردة</h2>
    <div class="chips">${Object.keys(EXG).map(g => `<button data-g="${g}" class="${g === selG ? 'on' : ''}">${g}</button>`).join('')}</div>
    <div class="chips">${EXG[selG].map(n => `<button data-ex="${esc(n)}">${n}</button>`).join('')}</div>
    <form id="exForm"><div class="row"><input name="exercise" list="exnames" placeholder="اسم التمرين" required></div>
      <datalist id="exnames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="row"><input name="kg" inputmode="decimal" placeholder="الوزن كجم" required><input name="reps" inputmode="numeric" placeholder="العدات" required></div>
      <button class="btn">أضف سيت</button></form>
    ${wk.map(w => {
      const prev = lastBefore(w.exercise, day);
      return `<div class="ex"><b>${esc(w.exercise)}</b>${w.sets.map((s, i) => `<span class="chip">${s.kg}×${s.reps}<a href="#" data-delset="${w.id}:${i}">✕</a></span>`).join('')}
        <div class="mut">${prev ? 'آخر مرة (' + fmtDate(prev.date) + '): ' + prev.sets.map(s => s.kg + '×' + s.reps).join(' ، ') : 'أول مرة'}</div></div>`;
    }).join('') || '<div class="mut" style="margin-top:8px">لسه ما سجلتش تمرين.</div>'}
  </div>`;
}
function lastBefore(ex, d) { return S.workouts.filter(w => w.exercise === ex && w.date < d).sort((a, b) => b.date.localeCompare(a.date))[0]; }
function bindToday() {
  $('#day').onchange = e => { day = e.target.value || today(); render(); };
  $('#prev').onclick = () => { day = addDays(day, -1); render(); };
  $('#next').onclick = () => { day = addDays(day, 1); render(); };
  document.querySelectorAll('[data-mt]').forEach(b => b.onclick = () => { selType = b.dataset.mt; document.querySelectorAll('[data-mt]').forEach(x => x.classList.toggle('on', x === b)); });
  document.querySelectorAll('[data-food]').forEach(b => b.onclick = () => { const f = FOODS[b.dataset.food], fm = $('#mealForm'); fm.name.value = f[0]; fm.kcal.value = f[1]; fm.p.value = f[2]; });
  document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { selG = b.dataset.g; render(); });
  document.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { $('#exForm').exercise.value = b.dataset.ex; $('#exForm').kg.focus(); });
  $('#mealForm').onsubmit = e => {
    e.preventDefault(); const f = e.target, k = num(f.kcal.value), p = num(f.p.value) || 0;
    if (!isFinite(k) || k < 0) return toast('اكتب السعرات بالأرقام');
    S.meals.push({ id: uid(), date: day, type: selType, name: f.name.value.trim(), kcal: k, p }); save(); render();
  };
  document.querySelectorAll('[data-delmeal]').forEach(b => b.onclick = () => { S.meals = S.meals.filter(m => m.id !== b.dataset.delmeal); save(); render(); });
  $('#exForm').onsubmit = e => {
    e.preventDefault(); const f = e.target, kg = num(f.kg.value), reps = parseInt(f.reps.value, 10);
    if (!isFinite(kg) || !(reps > 0)) return toast('اكتب الوزن والعدات بالأرقام');
    const name = f.exercise.value.trim();
    let w = S.workouts.find(x => x.date === day && x.exercise === name);
    if (!w) { w = { id: uid(), date: day, exercise: name, sets: [] }; S.workouts.push(w); }
    w.sets.push({ kg, reps }); save(); render();
    const nf = $('#exForm'); nf.exercise.value = name; nf.kg.value = kg; nf.reps.value = reps;
  };
  document.querySelectorAll('[data-delset]').forEach(a => a.onclick = ev => {
    ev.preventDefault(); const [id, i] = a.dataset.delset.split(':'), w = S.workouts.find(x => x.id === id); w.sets.splice(+i, 1);
    if (!w.sets.length) S.workouts = S.workouts.filter(x => x.id !== id); save(); render();
  });
}

// ---------- weight ----------
function chart(points) {
  if (points.length < 2) return '<div class="mut">محتاج قراءتين على الأقل عشان يظهر الرسم.</div>';
  const W = 320, H = 150, P = 24;
  const xs = points.map(p => parse(p.date).getTime()), ys = points.map(p => p.kg);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
  const X = x => P + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (W - 2 * P);
  const Y = y => H - P - (y - y0) / (y1 - y0) * (H - 2 * P);
  const pts = points.map(p => [X(parse(p.date).getTime()), Y(p.kg)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${pts[pts.length - 1][0].toFixed(1)} ${H - P} L${pts[0][0].toFixed(1)} ${H - P} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4a7" stop-opacity=".35"/><stop offset="1" stop-color="#2dd4a7" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#a)"/><path d="${d}" fill="none" stroke="#2dd4a7" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="#0b1020" stroke="#2dd4a7" stroke-width="2"/>`).join('')}
    <text x="4" y="${P}" fill="#9aa6cc" font-size="11">${r1(y1)}</text><text x="4" y="${H - P}" fill="#9aa6cc" font-size="11">${r1(y0)}</text></svg>`;
}
function viewWeight() {
  const ws = [...S.weights].sort((a, b) => a.date.localeCompare(b.date)), last = ws[ws.length - 1], first = ws[0];
  const diff = last && first && last !== first ? r1(last.kg - first.kg) : null;
  return `<div class="card hero"><div class="mut">وزنك الحالي</div><div class="big">${last ? ar(last.kg) : '–'} <span style="font-size:16px">كجم</span></div>
    ${diff != null ? `<div class="mut">التغير من أول قراءة: <b style="color:#fff">${diff > 0 ? '+' : ''}${ar(diff)} كجم</b></div>` : ''}</div>
  <div class="card"><h2>${svg('weight')} سجل وزنك</h2>
    <form id="wForm"><div class="row"><input type="date" name="date" value="${today()}"><input name="kg" inputmode="decimal" placeholder="كجم" required></div>
    <button class="btn">سجل الوزن</button></form>
    <div class="note">وزنك الجديد بيعدّل السعرات والبروتين تلقائيا.</div></div>
  <div class="card"><h2>الرسم</h2>${chart(ws.slice(-30))}</div>
  <div class="card"><h2>القراءات</h2>${[...ws].reverse().map(w => `<div class="item"><span>${ar(w.kg)} كجم <span class="mut">${fmtDate(w.date)}</span></span><button class="btn del" data-delw="${w.id}">حذف</button></div>`).join('') || '<div class="mut">مفيش قراءات.</div>'}</div>`;
}
function bindWeight() {
  $('#wForm').onsubmit = e => {
    e.preventDefault(); const kg = num(e.target.kg.value), d = e.target.date.value || today();
    if (!(kg > 20 && kg < 400)) return toast('وزن غلط');
    S.weights = S.weights.filter(w => w.date !== d); S.weights.push({ id: uid(), date: d, kg }); save(); render();
  };
  document.querySelectorAll('[data-delw]').forEach(b => b.onclick = () => { S.weights = S.weights.filter(w => w.id !== b.dataset.delw); save(); render(); });
}

// ---------- photos ----------
let photoCache = [], picked = [];
const urls = new Map();
function urlOf(p) { if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob)); return urls.get(p.id); }
async function viewPhotos() {
  photoCache = (await photoAll()).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  picked = picked.filter(id => photoCache.some(p => p.id === id));
  const cmp = picked.length === 2 ? picked.map(id => photoCache.find(p => p.id === id)).sort((a, b) => a.date.localeCompare(b.date)) : null;
  return `<div class="card"><h2>${svg('photos')} صور التقدم</h2>
    <div class="note" style="margin-top:0">${svg('shield').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;stroke:#38bdf8;fill:none;stroke-width:2"')} الصور بتتحفظ على موبايلك بس ومش بتترفع على أي سيرفر.</div>
    <label class="f">تاريخ الصورة</label><input type="date" id="pdate" value="${today()}">
    <label class="f">اختار صور</label><input type="file" id="pfile" accept="image/*" multiple></div>
    ${cmp ? `<div class="card"><h2>مقارنة</h2><div class="cmp">${cmp.map(p => `<div><img src="${urlOf(p)}"><div class="mut" style="text-align:center">${fmtDate(p.date)}</div></div>`).join('')}</div></div>` : ''}
    <div class="card"><h2>المعرض (${ar(photoCache.length)})</h2>
    <div class="mut">اضغط على صورتين عشان تقارنهم.</div>
    <div class="grid" style="margin-top:10px">${photoCache.map(p => `<div><img data-pick="${p.id}" class="${picked.includes(p.id) ? 'sel' : ''}" src="${urlOf(p)}"><div class="mut" style="text-align:center">${fmtDate(p.date)}</div><button class="btn del" style="width:100%;margin-top:4px" data-delp="${p.id}">حذف</button></div>`).join('')}</div></div>`;
}
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); };
    img.src = u;
  });
}
function bindPhotos() {
  $('#pfile').onchange = async e => {
    const d = $('#pdate').value || today();
    try { for (const f of e.target.files) await photoPut({ id: uid(), date: d, blob: await shrink(f) }); toast('اتحفظت'); render(); }
    catch (err) { toast('الصورة ما اتحفظتش'); }
  };
  document.querySelectorAll('[data-pick]').forEach(i => i.onclick = () => { const id = i.dataset.pick; picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id].slice(-2); render(); });
  document.querySelectorAll('[data-delp]').forEach(b => b.onclick = async () => { if (!confirm('تمسح الصورة؟')) return; await photoDel(b.dataset.delp); urls.delete(b.dataset.delp); render(); });
}

// ---------- progress ----------
function weekStats(startStr) {
  const end = addDays(startStr, 6), inW = d => d >= startStr && d <= end;
  const meals = S.meals.filter(m => inW(m.date)), days = new Set(meals.map(m => m.date));
  const kcal = meals.reduce((a, m) => a + m.kcal, 0), p = meals.reduce((a, m) => a + (m.p || 0), 0);
  const ws = S.weights.filter(w => inW(w.date)), wk = S.workouts.filter(w => inW(w.date));
  return { start: startStr, kcal: days.size ? kcal / days.size : null, p: days.size ? p / days.size : null, kg: ws.length ? ws.reduce((a, w) => a + w.kg, 0) / ws.length : null,
    sessions: new Set(wk.map(w => w.date)).size, vol: wk.reduce((a, w) => a + w.sets.reduce((b, s) => b + s.kg * s.reps, 0), 0) };
}
function viewProgress() {
  const t = today(), dow = parse(t).getDay(), mon = addDays(t, -((dow + 1) % 7)), T = targets();
  const weeks = [3, 2, 1, 0].map(i => weekStats(addDays(mon, -7 * i)));
  const f = (v, d = 0) => v == null ? '–' : ar(d ? r1(v) : Math.round(v));
  const first = weeks.find(w => w.kg != null), lastw = [...weeks].reverse().find(w => w.kg != null);
  const diff = first && lastw && first !== lastw ? r1(lastw.kg - first.kg) : null;
  const cur = weeks[3];
  return `<div class="card hero"><h2>${svg('progress')} الأسبوع ده</h2><div class="macros">
    <div class="mac"><b>${ar(cur.sessions)}</b><span class="mut">تمارين</span></div>
    <div class="mac"><b>${f(cur.kcal)}</b><span class="mut">متوسط سعرات</span></div>
    <div class="mac"><b>${f(cur.p)}</b><span class="mut">متوسط بروتين</span></div></div></div>
  <div class="card"><h2>آخر 4 أسابيع</h2>
    <div class="mut" style="margin-bottom:8px">الأسبوع بيبدأ السبت. المتوسط على الأيام اللي سجلت فيها أكل.</div>
    <table><tr><th>الأسبوع</th><th>وزن</th><th>سعرات</th><th>بروتين</th><th>تمارين</th><th>حجم</th></tr>
    ${weeks.map(w => `<tr><td>${fmtDate(w.start)}</td><td>${f(w.kg, 1)}</td><td>${f(w.kcal)}</td><td>${f(w.p)}</td><td>${ar(w.sessions)}</td><td>${ar(Math.round(w.vol))}</td></tr>`).join('')}</table>
    <div class="mut" style="margin-top:10px">حجم = مجموع (وزن × عدات). ${diff != null ? 'تغير الوزن: <b style="color:#fff">' + (diff > 0 ? '+' : '') + ar(diff) + ' كجم</b>.' : ''}</div></div>
  <div class="card"><h2>هدفك</h2><div class="mut">${ar(T.kcal)} سعر و ${ar(T.protein)} جم بروتين في اليوم.</div></div>`;
}

// ---------- me (profile + backup) ----------
const b64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
const unb64 = async s => (await fetch(s)).blob();
function viewMe() {
  const p = S.profile, w = curWeight(), c = calc(p, w), T = targets();
  return `<div class="card hero"><h2>${svg('me')} ${p.name ? esc(p.name) : 'ملفي'}</h2>
    <div class="macros"><div class="mac"><b>${ar(p.age)}</b><span class="mut">سنة</span></div><div class="mac"><b>${ar(p.height)}</b><span class="mut">سم</span></div><div class="mac"><b>${ar(w)}</b><span class="mut">كجم</span></div></div>
    <div class="mut" style="margin-top:10px">${p.sex === 'm' ? 'ذكر' : 'أنثى'} · ${ACT[p.act].t} · ${GOALS[p.goal].t}</div>
    <button class="btn sec" id="editP">تعديل بياناتي</button></div>
  <div class="card"><h2>${svg('bolt')} أهدافك المحسوبة</h2>
    <div class="macros"><div class="mac"><b>${ar(T.kcal)}</b><span class="mut">سعر</span></div><div class="mac"><b>${ar(T.protein)}</b><span class="mut">بروتين جم</span></div><div class="mac"><b>${ar(c.carbs)}/${ar(c.fat)}</b><span class="mut">كارب/دهون</span></div></div>
    <div class="formula">${esc(explain(p, w))}</div>
    <label class="f">تعديل يدوي (سيبه فاضي للحساب التلقائي)</label>
    <form id="ovForm"><div class="row"><input name="k" inputmode="numeric" placeholder="سعرات" value="${p.ovK || ''}"><input name="p" inputmode="numeric" placeholder="بروتين جم" value="${p.ovP || ''}"></div><button class="btn sec">احفظ</button></form></div>
  <div class="card"><h2>${svg('shield')} نسخة احتياطية</h2>
    <div class="mut">كل بياناتك على موبايلك بس. لو مسحت بيانات المتصفح أو غيرت الموبايل هتضيع، فاعمل نسخة كل فترة واحفظها في Google Drive.</div>
    <div class="row"><button class="btn" id="exp">حمّل نسخة (بيانات + صور)</button></div>
    <div class="row"><input type="file" id="imp" accept="application/json,.json"></div>
    <div class="mut">الاستيراد بيضيف على اللي موجود ومش بيمسح.</div>
    <div class="row"><button class="btn sec" id="persist">اطلب تخزين دائم</button></div><div id="pst" class="mut"></div></div>
  <div class="card"><h2>مسح كل حاجة</h2><button class="btn del" id="wipe" style="width:100%">امسح كل البيانات والصور</button></div>`;
}
function bindMe() {
  $('#editP').onclick = () => startOb(true);
  $('#ovForm').onsubmit = e => { e.preventDefault(); S.profile.ovK = num(e.target.k.value) || 0; S.profile.ovP = num(e.target.p.value) || 0; save(); render(); toast('اتحفظ'); };
  $('#exp').onclick = async () => {
    const photos = await Promise.all((await photoAll()).map(async p => ({ id: p.id, date: p.date, data: await b64(p.blob) })));
    const blob = new Blob([JSON.stringify({ app: 'fit', v: 2, S, photos })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fitness-backup-' + today() + '.json';
    document.body.appendChild(a); a.click(); a.remove(); toast('اتحملت النسخة');
  };
  $('#imp').onchange = async e => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (j.app !== 'fit') throw new Error('x');
      for (const k of ['meals', 'weights', 'workouts']) { const ids = new Set(S[k].map(x => x.id)); (j.S[k] || []).forEach(x => { if (!ids.has(x.id)) S[k].push(x); }); }
      if (j.S.settings) S.settings = j.S.settings;
      if (j.S.profile && !S.profile) S.profile = j.S.profile;
      save();
      const ex = new Set((await photoAll()).map(p => p.id));
      for (const p of j.photos || []) if (!ex.has(p.id)) await photoPut({ id: p.id, date: p.date, blob: await unb64(p.data) });
      toast('اتستورد'); render();
    } catch (err) { toast('الملف ده مش نسخة صحيحة'); }
  };
  $('#persist').onclick = async () => {
    const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
    $('#pst').textContent = ok ? 'تمام، التخزين محمي من المسح التلقائي.' : 'المتصفح ما وافقش. ثبّت التطبيق على الشاشة الرئيسية وجرب تاني.';
  };
  $('#wipe').onclick = async () => {
    if (!confirm('هتمسح كل حاجة. متأكد؟')) return; if (!confirm('آخر تأكيد: مفيش رجوع.')) return;
    S = defaults(); save(); for (const p of await photoAll()) await photoDel(p.id); location.reload();
  };
}

// ---------- shell ----------
const TABS = [['today', 'اليوم'], ['weight', 'الوزن'], ['photos', 'الصور'], ['progress', 'التقدم'], ['me', 'أنا']];
function showShell() {
  $('#hdr').style.display = ''; $('#tabs').style.display = '';
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<button data-tab="${k}">${svg(k)}<span>${t}</span></button>`).join('');
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; window.scrollTo(0, 0); render(); });
}
async function render() {
  if (!S.profile) { if (!ob) startOb(false); return; }
  const app = $('#app'), scroll = window.scrollY;
  if (tab === 'today') { app.innerHTML = viewToday(); bindToday(); }
  else if (tab === 'weight') { app.innerHTML = viewWeight(); bindWeight(); }
  else if (tab === 'photos') { app.innerHTML = await viewPhotos(); bindPhotos(); }
  else if (tab === 'progress') app.innerHTML = viewProgress();
  else { app.innerHTML = viewMe(); bindMe(); }
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#hdrDate').textContent = fmtDate(today());
  $('#hdrSub').textContent = S.profile.name ? 'أهلا يا ' + S.profile.name : 'تابع تمرينك وأكلك';
  window.scrollTo(0, scroll);
}
if (S.profile) showShell();
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {}));
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !ob) location.reload(); had = true; });
}
