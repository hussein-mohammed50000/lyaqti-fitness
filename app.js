'use strict';
// ---------- storage ----------
const KEY = 'fit.v1';
const defaults = () => ({ settings: { kcal: 2650, protein: 130 }, meals: [], weights: [], workouts: [] });
let S;
try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = defaults(); }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// photos in IndexedDB
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
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
const fmtDate = s => parse(s).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });
const r1 = n => Math.round(n * 10) / 10;
function toast(t) {
  const e = document.createElement('div'); e.className = 'toast'; e.textContent = t;
  document.body.appendChild(e); setTimeout(() => e.remove(), 2200);
}
let tab = 'today', day = today();

// ---------- today ----------
function viewToday() {
  const meals = S.meals.filter(m => m.date === day);
  const kcal = meals.reduce((a, m) => a + m.kcal, 0);
  const prot = meals.reduce((a, m) => a + (m.p || 0), 0);
  const pk = Math.min(100, kcal / S.settings.kcal * 100), pp = Math.min(100, prot / S.settings.protein * 100);
  const wk = S.workouts.filter(w => w.date === day);
  const names = [...new Set(S.workouts.map(w => w.exercise))];
  return `
  <div class="card"><div class="row"><button class="btn sec" id="prev" style="width:60px">›</button>
    <input type="date" id="day" value="${day}"><button class="btn sec" id="next" style="width:60px">‹</button></div>
    <div class="mut" style="text-align:center">${fmtDate(day)}</div></div>

  <div class="card"><h2>السعرات والبروتين</h2>
    <div>سعرات: <b>${Math.round(kcal)}</b> / ${S.settings.kcal} <span class="mut">(باقي ${Math.max(0, Math.round(S.settings.kcal - kcal))})</span></div>
    <div class="bar ${kcal > S.settings.kcal ? 'over' : ''}"><i style="width:${pk}%"></i></div>
    <div>بروتين: <b>${r1(prot)}</b> / ${S.settings.protein} جم</div>
    <div class="bar"><i style="width:${pp}%"></i></div>
    <form id="mealForm"><div class="row"><input name="name" placeholder="الوجبة (مثلا: رز وفراخ)" required></div>
      <div class="row"><input name="kcal" inputmode="decimal" placeholder="سعرات" required><input name="p" inputmode="decimal" placeholder="بروتين جم"></div>
      <button class="btn">أضف وجبة</button></form>
    ${meals.map(m => `<div class="item"><span>${esc(m.name)}<br><span class="mut">${Math.round(m.kcal)} سعر · ${r1(m.p || 0)} جم</span></span><button class="btn del" data-delmeal="${m.id}">حذف</button></div>`).join('')}
  </div>

  <div class="card"><h2>تمرين النهاردة</h2>
    <form id="exForm"><div class="row"><input name="exercise" list="exnames" placeholder="اسم التمرين (مثلا: بنش برس)" required></div>
      <datalist id="exnames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="row"><input name="kg" inputmode="decimal" placeholder="الوزن كجم" required><input name="reps" inputmode="numeric" placeholder="العدات" required></div>
      <button class="btn">أضف سيت</button></form>
    ${wk.map(w => {
      const prev = lastBefore(w.exercise, day);
      return `<div class="ex"><b>${esc(w.exercise)}</b>
        ${w.sets.map((s, i) => `<span class="chip">${s.kg}×${s.reps} <a href="#" data-delset="${w.id}:${i}" style="color:#ef4444;text-decoration:none"> ✕</a></span>`).join('')}
        <div class="mut">${prev ? 'آخر مرة (' + fmtDate(prev.date) + '): ' + prev.sets.map(s => s.kg + '×' + s.reps).join(' ، ') : 'أول مرة'}</div></div>`;
    }).join('') || '<div class="mut">لسه ما سجلتش تمرين.</div>'}
  </div>

  <div class="card"><h2>الأهداف</h2>
    <form id="goalForm"><div class="row"><input name="kcal" inputmode="numeric" value="${S.settings.kcal}"><input name="protein" inputmode="numeric" value="${S.settings.protein}"></div>
    <div class="mut">سعرات يوميا · بروتين جم يوميا</div><button class="btn sec" style="margin-top:8px">احفظ الأهداف</button></form></div>`;
}
function lastBefore(ex, d) {
  const l = S.workouts.filter(w => w.exercise === ex && w.date < d).sort((a, b) => b.date.localeCompare(a.date));
  return l[0];
}
function bindToday() {
  $('#day').onchange = e => { day = e.target.value || today(); render(); };
  $('#prev').onclick = () => { day = addDays(day, -1); render(); };
  $('#next').onclick = () => { day = addDays(day, 1); render(); };
  $('#mealForm').onsubmit = e => {
    e.preventDefault(); const f = e.target;
    const k = num(f.kcal.value), p = num(f.p.value) || 0;
    if (!isFinite(k) || k < 0) return toast('اكتب السعرات بالأرقام');
    S.meals.push({ id: uid(), date: day, name: f.name.value.trim(), kcal: k, p }); save(); render();
  };
  document.querySelectorAll('[data-delmeal]').forEach(b => b.onclick = () => { S.meals = S.meals.filter(m => m.id !== b.dataset.delmeal); save(); render(); });
  $('#exForm').onsubmit = e => {
    e.preventDefault(); const f = e.target;
    const kg = num(f.kg.value), reps = parseInt(f.reps.value, 10);
    if (!isFinite(kg) || !(reps > 0)) return toast('اكتب الوزن والعدات بالأرقام');
    const name = f.exercise.value.trim();
    let w = S.workouts.find(x => x.date === day && x.exercise === name);
    if (!w) { w = { id: uid(), date: day, exercise: name, sets: [] }; S.workouts.push(w); }
    w.sets.push({ kg, reps }); save(); render();
    const nf = $('#exForm'); nf.exercise.value = name; nf.kg.value = kg; nf.reps.value = reps;
  };
  document.querySelectorAll('[data-delset]').forEach(a => a.onclick = ev => {
    ev.preventDefault(); const [id, i] = a.dataset.delset.split(':');
    const w = S.workouts.find(x => x.id === id); w.sets.splice(+i, 1);
    if (!w.sets.length) S.workouts = S.workouts.filter(x => x.id !== id);
    save(); render();
  });
  $('#goalForm').onsubmit = e => {
    e.preventDefault(); const k = num(e.target.kcal.value), p = num(e.target.protein.value);
    if (!(k > 0) || !(p > 0)) return toast('أرقام غلط');
    S.settings = { kcal: k, protein: p }; save(); render(); toast('اتحفظ');
  };
}

// ---------- weight ----------
function chart(points) {
  if (points.length < 2) return '<div class="mut">محتاج قراءتين على الأقل عشان يظهر الرسم.</div>';
  const W = 320, H = 140, P = 22;
  const xs = points.map(p => parse(p.date).getTime()), ys = points.map(p => p.kg);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
  const X = x => P + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (W - 2 * P);
  const Y = y => H - P - (y - y0) / (y1 - y0) * (H - 2 * P);
  const d = points.map((p, i) => (i ? 'L' : 'M') + X(parse(p.date).getTime()).toFixed(1) + ' ' + Y(p.kg).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="#22c55e" stroke-width="2.5"/>
    ${points.map(p => `<circle cx="${X(parse(p.date).getTime()).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3" fill="#22c55e"/>`).join('')}
    <text x="4" y="${P}" fill="#94a3b8" font-size="11">${r1(y1)}</text><text x="4" y="${H - P}" fill="#94a3b8" font-size="11">${r1(y0)}</text></svg>`;
}
function viewWeight() {
  const ws = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
  const last = ws[ws.length - 1];
  return `<div class="card"><h2>الوزن</h2>
    <form id="wForm"><div class="row"><input type="date" name="date" value="${today()}"><input name="kg" inputmode="decimal" placeholder="كجم" required></div>
    <button class="btn">سجل الوزن</button></form></div>
    <div class="card"><h2>الرسم</h2>${chart(ws.slice(-30))}
    ${last ? `<div class="mut">آخر قراءة: ${last.kg} كجم (${fmtDate(last.date)})</div>` : ''}</div>
    <div class="card"><h2>القراءات</h2>${[...ws].reverse().map(w => `<div class="item"><span>${w.kg} كجم <span class="mut">${fmtDate(w.date)}</span></span><button class="btn del" data-delw="${w.id}">حذف</button></div>`).join('') || '<div class="mut">مفيش قراءات.</div>'}</div>`;
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
  return `<div class="card"><h2>صور التقدم</h2>
    <div class="mut">الصور بتتحفظ على موبايلك بس. مش بتترفع على أي سيرفر.</div>
    <div class="row"><input type="date" id="pdate" value="${today()}"></div>
    <div class="row"><input type="file" id="pfile" accept="image/*" multiple></div></div>
    ${cmp ? `<div class="card"><h2>مقارنة</h2><div class="cmp">${cmp.map(p => `<div><img src="${urlOf(p)}"><div class="mut" style="text-align:center">${fmtDate(p.date)}</div></div>`).join('')}</div></div>` : ''}
    <div class="card"><h2>المعرض (${photoCache.length})</h2>
    <div class="mut">اضغط على صورتين عشان تقارنهم.</div>
    <div class="grid" style="margin-top:8px">${photoCache.map(p => `<div><img data-pick="${p.id}" class="${picked.includes(p.id) ? 'sel' : ''}" src="${urlOf(p)}"><div class="mut" style="text-align:center">${fmtDate(p.date)}</div><button class="btn del" style="width:100%;margin-top:2px" data-delp="${p.id}">حذف</button></div>`).join('')}</div></div>`;
}
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const m = 1280, k = Math.min(1, m / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); };
    img.src = u;
  });
}
function bindPhotos() {
  $('#pfile').onchange = async e => {
    const d = $('#pdate').value || today();
    try {
      for (const f of e.target.files) await photoPut({ id: uid(), date: d, blob: await shrink(f) });
      toast('اتحفظت'); render();
    } catch (err) { toast('الصورة ما اتحفظتش'); }
  };
  document.querySelectorAll('[data-pick]').forEach(i => i.onclick = () => {
    const id = i.dataset.pick;
    picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id].slice(-2); render();
  });
  document.querySelectorAll('[data-delp]').forEach(b => b.onclick = async () => {
    if (!confirm('تمسح الصورة؟')) return; await photoDel(b.dataset.delp); urls.delete(b.dataset.delp); render();
  });
}

// ---------- progress ----------
function weekStats(startStr) {
  const end = addDays(startStr, 6), inW = d => d >= startStr && d <= end;
  const meals = S.meals.filter(m => inW(m.date)), days = new Set(meals.map(m => m.date));
  const kcal = meals.reduce((a, m) => a + m.kcal, 0), p = meals.reduce((a, m) => a + (m.p || 0), 0);
  const ws = S.weights.filter(w => inW(w.date)), wk = S.workouts.filter(w => inW(w.date));
  const vol = wk.reduce((a, w) => a + w.sets.reduce((b, s) => b + s.kg * s.reps, 0), 0);
  return {
    start: startStr, kcal: days.size ? kcal / days.size : null, p: days.size ? p / days.size : null,
    kg: ws.length ? ws.reduce((a, w) => a + w.kg, 0) / ws.length : null,
    sessions: new Set(wk.map(w => w.date)).size, vol
  };
}
function viewProgress() {
  const t = today(), dow = parse(t).getDay(), mon = addDays(t, -((dow + 1) % 7)); // الأسبوع يبدأ السبت
  const weeks = [3, 2, 1, 0].map(i => weekStats(addDays(mon, -7 * i)));
  const f = (v, d = 0) => v == null ? '–' : (d ? r1(v) : Math.round(v));
  const first = weeks.find(w => w.kg != null), lastw = [...weeks].reverse().find(w => w.kg != null);
  const diff = first && lastw && first !== lastw ? r1(lastw.kg - first.kg) : null;
  return `<div class="card"><h2>آخر 4 أسابيع</h2>
    <div class="mut">الأسبوع بيبدأ السبت. المتوسط محسوب على الأيام اللي سجلت فيها أكل.</div>
    <table><tr><th>الأسبوع</th><th>وزن</th><th>سعرات</th><th>بروتين</th><th>تمارين</th><th>حجم</th></tr>
    ${weeks.map(w => `<tr><td>${fmtDate(w.start)}</td><td>${f(w.kg, 1)}</td><td>${f(w.kcal)}</td><td>${f(w.p)}</td><td>${w.sessions}</td><td>${Math.round(w.vol)}</td></tr>`).join('')}</table>
    <div class="mut" style="margin-top:8px">حجم = مجموع (وزن × عدات). ${diff != null ? 'تغير الوزن بين أول وآخر أسبوع: <b>' + (diff > 0 ? '+' : '') + diff + ' كجم</b>.' : ''}</div></div>
    <div class="card"><h2>الهدف</h2><div class="mut">${S.settings.kcal} سعر و ${S.settings.protein} جم بروتين في اليوم.</div></div>`;
}

// ---------- backup ----------
const b64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
const unb64 = async s => (await fetch(s)).blob();
function viewBackup() {
  return `<div class="card"><h2>نسخة احتياطية</h2>
    <div class="mut">كل بياناتك على موبايلك بس. لو مسحت بيانات المتصفح أو غيرت الموبايل هتضيع، فاعمل نسخة كل فترة واحفظها في Google Drive أو ابعتها لنفسك.</div>
    <div class="row"><button class="btn" id="exp">حمّل نسخة (بيانات + صور)</button></div>
    <div class="row"><input type="file" id="imp" accept="application/json,.json"></div>
    <div class="mut">الاستيراد بيضيف على اللي موجود ومش بيمسح.</div></div>
    <div class="card"><h2>حماية البيانات</h2><div class="row"><button class="btn sec" id="persist">اطلب تخزين دائم</button></div><div id="pst" class="mut"></div></div>
    <div class="card"><h2>مسح كل حاجة</h2><div class="row"><button class="btn del" id="wipe" style="width:100%">امسح كل البيانات والصور</button></div></div>`;
}
function bindBackup() {
  $('#exp').onclick = async () => {
    const photos = await Promise.all((await photoAll()).map(async p => ({ id: p.id, date: p.date, data: await b64(p.blob) })));
    const blob = new Blob([JSON.stringify({ app: 'fit', v: 1, S, photos })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fitness-backup-' + today() + '.json';
    document.body.appendChild(a); a.click(); a.remove(); toast('اتحملت النسخة');
  };
  $('#imp').onchange = async e => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (j.app !== 'fit') throw new Error('x');
      const have = (k, arr) => new Set(arr.map(x => x.id)); 
      for (const k of ['meals', 'weights', 'workouts']) { const ids = have(k, S[k]); (j.S[k] || []).forEach(x => { if (!ids.has(x.id)) S[k].push(x); }); }
      if (j.S.settings) S.settings = j.S.settings;
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
    if (!confirm('هتمسح كل حاجة. متأكد؟')) return;
    if (!confirm('آخر تأكيد: مفيش رجوع.')) return;
    S = defaults(); save(); for (const p of await photoAll()) await photoDel(p.id); render();
  };
}

// ---------- shell ----------
async function render() {
  const app = $('#app');
  const scroll = window.scrollY;
  if (tab === 'today') { app.innerHTML = viewToday(); bindToday(); }
  else if (tab === 'weight') { app.innerHTML = viewWeight(); bindWeight(); }
  else if (tab === 'photos') { app.innerHTML = await viewPhotos(); bindPhotos(); }
  else if (tab === 'progress') app.innerHTML = viewProgress();
  else { app.innerHTML = viewBackup(); bindBackup(); }
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#hdrDate').textContent = fmtDate(today());
  window.scrollTo(0, scroll);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; window.scrollTo(0, 0); render(); });
render();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
