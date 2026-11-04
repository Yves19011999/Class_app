/* =========================================================
   CLASSE — Gestion de classe · UltraReview
   Offline-first · IndexedDB · PWA · Vanilla JS
   ========================================================= */

const DB_NAME = 'classe_db';
const DB_VERSION = 4;
const APP_VERSION = '4.9.21';
let db = null;

const STORES = {
  classes:   { keyPath: 'id' },
  subjects:  { keyPath: 'id', indexes: [['classId','classId']] },
  students:  { keyPath: 'id', indexes: [['classId','classId']] },
  schedule:  { keyPath: 'id', indexes: [['day','day'],['classId','classId']] },
  sessions:  { keyPath: 'id', indexes: [['date','date'],['classId','classId'],['scheduleId','scheduleId']] },
  attendance:{ keyPath: 'id', indexes: [['sessionId','sessionId'],['studentId','studentId'],['date','date']] },
  homework:  { keyPath: 'id', indexes: [['classId','classId'],['dueDate','dueDate']] },
  grades:    { keyPath: 'id', indexes: [['studentId','studentId'],['classId','classId'],['date','date']] },
  settings:  { keyPath: 'key' }
};

const DAYS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const DAYS_FR_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const DAYS_ORDER = [1,2,3,4,5,6];

const state = {
  classes: [], subjects: [], students: [], schedule: [], homework: [], grades: [],
  attendance: [], sessions: [], currentTab: 'today', scheduleDayIndex: 1,
  gradesClassFilter: null, gradesSubjectFilter: 'all', studentsSearch: '',
  studentsClassFilter: 'all', homeworkFilter: 'pending'
};

/* ---------- PWA installation ---------- */
let deferredInstallPrompt = null;
function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
window.addEventListener('beforeinstallprompt', (event)=>{
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtons();
});
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  localStorage.setItem('classe_installed','1');
  updateInstallButtons();
  showToast('Classe est installée sur cet appareil');
});
function updateInstallButtons(){
  const btn=document.getElementById('installAppBtn');
  const hint=document.getElementById('installHint');
  if(!btn) return;
  if(isStandalone()){
    btn.textContent='✓ Application déjà installée';
    btn.disabled=true;
    if(hint) hint.textContent='Classe est déjà installée sur cet appareil.';
    return;
  }
  btn.textContent='📲 Installer Classe';
  btn.disabled=false;
  if(hint) hint.textContent=deferredInstallPrompt
    ? 'Installation directe proposée par le navigateur.'
    : 'Sur Android/Chrome, l’installation apparaîtra lorsqu’elle sera disponible. Sur iPhone, utilise Partager → Ajouter à l’écran d’accueil.';
}
async function installApp(){
  if(isStandalone()){ showToast('Classe est déjà installée'); return; }
  if(!deferredInstallPrompt){
    openSheet(`<div class="sheet-header"><div><h3>Installer Classe</h3><p class="sheet-kicker">Installation sur ton téléphone</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
      <div class="note-card"><strong>Android / Chrome</strong><p class="muted">Ouvre cette application dans Chrome. Si l’installation directe n’est pas encore proposée, utilise le menu ⋮ puis « Installer l’application ».</p></div>
      <div class="note-card"><strong>iPhone / iPad</strong><p class="muted">Dans Safari : Partager ↗ → <b>Ajouter à l’écran d’accueil</b> → Ajouter.</p></div>
      <div class="note-card"><strong>Autres téléphones</strong><p class="muted">L’installation dépend du navigateur et de sa prise en charge des PWA. Une page web ne peut pas forcer une installation si le système ne l’autorise pas.</p></div>`);
    return;
  }
  try{
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice;
    if(choice?.outcome==='accepted') showToast('Installation lancée');
    deferredInstallPrompt=null;
    updateInstallButtons();
  }catch(e){ console.warn('Installation PWA:',e); showToast('Installation non disponible pour le moment','info'); }
}


/* ---------- Cyberpunk UI soundscape ---------- */
const UI_SOUND_KEY = 'classe_ui_sounds';
let uiAudioContext = null;
function uiSoundsEnabled(){ return localStorage.getItem(UI_SOUND_KEY)!=='0'; }
function getUiAudio(){
  if(!uiAudioContext){ const C=window.AudioContext||window.webkitAudioContext; if(!C)return null; uiAudioContext=new C(); }
  if(uiAudioContext.state==='suspended') uiAudioContext.resume().catch(()=>{});
  return uiAudioContext;
}
function playUiSound(type='click'){
  if(!uiSoundsEnabled())return;
  const c=getUiAudio(); if(!c)return;
  const now=c.currentTime, master=c.createGain(), loud=type==='error'?.045:.028;
  master.gain.setValueAtTime(.0001,now); master.gain.exponentialRampToValueAtTime(loud,now+.008); master.gain.exponentialRampToValueAtTime(.0001,now+(type==='open'?.20:.12)); master.connect(c.destination);
  const tones={click:[[520,.045,'square'],[780,.035,'sine']],open:[[220,.07,'sine'],[440,.12,'triangle'],[880,.08,'sine']],success:[[440,.07,'sine'],[660,.08,'sine'],[990,.13,'triangle']],error:[[190,.13,'sawtooth'],[120,.16,'sawtooth']],close:[[460,.06,'sine'],[280,.10,'triangle']]}[type]||[[520,.05,'square']];
  tones.forEach(([freq,duration,wave],i)=>{const o=c.createOscillator(),g=c.createGain(),t=now+i*.035;o.type=wave;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*(type==='error'?.72:1.08),t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(1,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(master);o.start(t);o.stop(t+duration+.02);});
}
function setUiSounds(enabled){ localStorage.setItem(UI_SOUND_KEY,enabled?'1':'0'); if(enabled)playUiSound('success'); }
function haptic(ms=12){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
function shareApp(){
  const data={title:getAppName(),text:'Classe — gestion de classe hors-ligne',url:location.href};
  if(navigator.share){ navigator.share(data).then(()=>showToast('Lien partagé')).catch(()=>{}); }
  else { navigator.clipboard?.writeText(location.href).then(()=>showToast('Lien copié')).catch(()=>showToast('Copie non disponible','info')); }
}
function appHealth(){
  const standalone=isStandalone(), online=navigator.onLine!==false, students=state.students.length, classes=state.classes.length;
  return `<div class="app-health"><span class="health-chip">${online?'● En ligne':'○ Hors ligne'}</span><span class="health-chip">${standalone?'✓ Installée':'◌ Navigateur'}</span><span class="health-chip"><b>${classes}</b> classe(s)</span><span class="health-chip"><b>${students}</b> élève(s)</span></div>`;
}

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,9); }
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDateLong(iso){ return new Date(iso+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}); }
function fmtDateShort(iso){ return new Date(iso+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}); }
function daysUntil(iso){
  const a = new Date(); a.setHours(0,0,0,0);
  const b = new Date(iso+'T00:00:00');
  return Math.round((b-a)/86400000);
}
function initials(name){ return name.trim().split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()||'').join(''); }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function safePhotoUrl(value){
  const photo=String(value||'');
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/]+=*$/i.test(photo) && photo.length<=1800000 ? photo : '';
}
function getClass(id){ return state.classes.find(c=>c.id===id); }
function classLabel(id){ return getClass(id)?.name || '—'; }
function studentsOf(classId){ return state.students.filter(s=>s.classId===classId).sort((a,b)=>a.name.localeCompare(b.name,'fr')); }
function gradesOfStudent(id){ return state.grades.filter(g=>g.studentId===id); }
function avg(values){ return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null; }
function gradeClass(v){ return v>=12?'grade-good':v>=8?'grade-mid':'grade-low'; }

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const _db=e.target.result;
      for(const [name,cfg] of Object.entries(STORES)){
        let store;
        if(!_db.objectStoreNames.contains(name)) store=_db.createObjectStore(name,{keyPath:cfg.keyPath});
        else store=e.target.transaction.objectStore(name);
        (cfg.indexes||[]).forEach(([idx,field])=>{ if(!store.indexNames.contains(idx)) store.createIndex(idx,field); });
      }
    };
    req.onsuccess=e=>{ db=e.target.result; resolve(db); };
    req.onerror=()=>reject(req.error);
  });
}
function tx(name,mode='readonly'){ return db.transaction(name,mode).objectStore(name); }
function dbGetAll(name){ return new Promise((resolve,reject)=>{ const r=tx(name).getAll(); r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error); }); }
function dbGet(name,key){ return new Promise((resolve,reject)=>{ const r=tx(name).get(key); r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error); }); }
function dbPut(name,value){ return new Promise((resolve,reject)=>{ const r=tx(name,'readwrite').put(value); r.onsuccess=()=>resolve(value); r.onerror=()=>reject(r.error); }); }
function dbDelete(name,key){ return new Promise((resolve,reject)=>{ const r=tx(name,'readwrite').delete(key); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error); }); }
async function clearStore(name){
  return new Promise((resolve,reject)=>{ const r=tx(name,'readwrite').clear(); r.onsuccess=resolve; r.onerror=()=>reject(r.error); });
}
async function loadAll(){
  const [classes,subjects,students,schedule,homework,grades,attendance,sessions,settings]=await Promise.all([
    dbGetAll('classes'),dbGetAll('subjects'),dbGetAll('students'),dbGetAll('schedule'),dbGetAll('homework'),dbGetAll('grades'),dbGetAll('attendance'),dbGetAll('sessions'),dbGetAll('settings')
  ]);
  Object.assign(state,{classes,subjects,students,schedule,homework,grades,attendance,sessions,settings});
  if(globalThis.Capacitor) void syncNativeMigrationSnapshot();
}

async function migrateLegacySubjects(){
  for(const cls of state.classes){
    let subjects=state.subjects.filter(s=>s.classId===cls.id);
    if(!subjects.length){
      const subject={id:uid(),classId:cls.id,name:(cls.subject||'Matière générale').trim(),coefficient:1};
      await dbPut('subjects',subject); state.subjects.push(subject); subjects=[subject];
    }
    const fallback=subjects[0];
    for(const grade of state.grades.filter(g=>g.classId===cls.id&&!g.subjectId)){
      grade.subjectId=fallback.id; await dbPut('grades',grade);
    }
  }
  await loadAll();
}

async function migrateLegacyAttendance(){
  const legacy=state.attendance.filter(a=>!a.sessionId);
  if(!legacy.length) return;
  const cache=new Map();
  for(const a of legacy){
    const key=`${a.date}|${a.classId}`;
    let session=cache.get(key);
    if(!session) session=state.sessions.find(s=>s.date===a.date&&s.classId===a.classId&&!s.scheduleId);
    if(!session){
      session={id:uid(),date:a.date,classId:a.classId,scheduleId:null,start:'',end:'',topic:'Appel migré'};
      await dbPut('sessions',session); state.sessions.push(session);
    }
    cache.set(key,session);
    a.sessionId=session.id;
    await dbPut('attendance',a);
  }
  await loadAll();
}

async function seedIfNeeded(){
  const seeded=await dbGet('settings','seeded');
  if(seeded?.value) return;
  // Les nouvelles installations démarrent volontairement sans données d’exemple.
  // L’utilisateur crée ses classes et ajoute ses données depuis l’écran Élèves.
  await dbPut('settings',{key:'seeded',value:true});
}

let toastTimer=null;
function showToast(msg,icon='check'){
  const el=document.getElementById('toast');
  const icons={check:'<path d="M20 6 9 17l-5-5"/>',info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'};
  el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${icons[icon]||icons.check}</svg><span>${escapeHtml(msg)}</span>`;
  el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
}
function openSheet(html){ document.getElementById('sheet').innerHTML='<div class="sheet-handle"></div>'+html; document.getElementById('sheetOverlay').classList.add('open'); playUiSound('open'); }
function closeSheet(){ document.getElementById('sheetOverlay').classList.remove('open'); playUiSound('close'); }
document.getElementById('sheetOverlay').addEventListener('click',e=>{ if(e.target.id==='sheetOverlay') closeSheet(); });

function getAppName(){ return localStorage.getItem('classe_app_name') || 'Classe · Gestion de classe'; }

function currentSlot(){
  const now=new Date(), dow=now.getDay(), hm=now.getHours()*60+now.getMinutes();
  return state.schedule.filter(s=>s.day===dow).sort((a,b)=>a.start.localeCompare(b.start)).find(s=>hm>=toMin(s.start)&&hm<toMin(s.end))||null;
}
function nextSlot(){
  const now=new Date(), dow=now.getDay(), hm=now.getHours()*60+now.getMinutes();
  for(let offset=0;offset<7;offset++){
    const day=(dow+offset)%7;
    const min=offset===0?hm:-1;
    const slot=state.schedule.filter(s=>s.day===day).sort((a,b)=>a.start.localeCompare(b.start)).find(s=>toMin(s.start)>min);
    if(slot) return slot;
  }
  return null;
}
function toMin(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function minutesUntilSlot(slot){
  const now=new Date(), target=new Date(now); const [h,m]=slot.start.split(':').map(Number);
  const offset=(Number(slot.day)-now.getDay()+7)%7;
  target.setDate(target.getDate()+offset); target.setHours(h,m,0,0);
  let diff=Math.round((target-now)/60000); if(diff<0) diff=0;
  return diff<60?`${diff} min`:`${Math.floor(diff/60)} h ${diff%60?diff%60+' min':''}`.trim();
}

function computeSuggestions(){
  const out=[];
  state.homework.filter(h=>!h.done).forEach(h=>{
    const d=daysUntil(h.dueDate);
    if(d===0) out.push({icon:'clock',text:`« ${escapeHtml(h.title)} » est à rendre <b>aujourd'hui</b> pour ${escapeHtml(classLabel(h.classId))}.`});
    else if(d===1) out.push({icon:'clock',text:`« ${escapeHtml(h.title)} » est à rendre <b>demain</b> — pense à rappeler ${escapeHtml(classLabel(h.classId))}.`});
    else if(d<0) out.push({icon:'alert',text:`« ${escapeHtml(h.title)} » est en retard de ${Math.abs(d)} jour(s).`});
  });
  const dow=new Date().getDay();
  state.schedule.filter(s=>s.day===dow).forEach(slot=>{
    const cls=getClass(slot.classId); if(!cls) return;
    const last=state.grades.filter(g=>g.classId===slot.classId).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(!last) out.push({icon:'note',text:`Aucune note enregistrée pour <b>${escapeHtml(cls.name)}</b>.`});
    else if(daysUntil(last.date)<-21) out.push({icon:'note',text:`Pas de nouvelle évaluation pour <b>${escapeHtml(cls.name)}</b> depuis plus de 3 semaines.`});
  });
  const absenceCounts={}; state.attendance.forEach(a=>{if(a.status==='a') absenceCounts[a.studentId]=(absenceCounts[a.studentId]||0)+1;});
  Object.entries(absenceCounts).forEach(([sid,count])=>{ if(count>=3){const s=state.students.find(x=>x.id===sid); if(s) out.push({icon:'alert',text:`<b>${escapeHtml(s.name)}</b> cumule ${count} absences.`});} });
  state.classes.forEach(c=>{if(!studentsOf(c.id).length) out.push({icon:'info',text:`La classe <b>${escapeHtml(c.name)}</b> n'a encore aucun élève.`});});
  if(!state.schedule.length) out.push({icon:'info',text:'Ton emploi du temps est vide — ajoute tes séances pour voir ton programme ici.'});
  return out.slice(0,4);
}
function suggestionIcon(name){
  const p={clock:'<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/>',alert:'<path d="M12 9v4M12 17h.01"/><path d="m10.3 3.9-8.3 14a1.5 1.5 0 0 0 1.3 2.3h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z"/>',note:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${p[name]||p.info}</svg>`;
}

function renderToday(){
  const el=document.getElementById('view-today'), today=todayISO(), dow=new Date().getDay();
  const now=currentSlot(), next=!now?nextSlot():null;
  const slots=state.schedule.filter(s=>s.day===dow).sort((a,b)=>a.start.localeCompare(b.start));
  const allPending=state.homework.filter(h=>!h.done).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const overdue=allPending.filter(h=>daysUntil(h.dueDate)<0);
  const suggestions=computeSuggestions(), totalStudents=state.students.length;
  const classCount=state.classes.length, avgAll=weightedSubjectAvg(state.grades), at=attendanceStatsForDate(), globalAt=attendanceStats();
  const todayAttendance=state.attendance.filter(a=>a.date===today);
  const present=todayAttendance.filter(a=>a.status==='p').length, absent=todayAttendance.filter(a=>a.status==='a').length, late=todayAttendance.filter(a=>a.status==='r').length;
  const classBars=state.classes.slice(0,4).map((c,i)=>{const a=weightedSubjectAvg(state.grades.filter(g=>g.classId===c.id));const pct=a===null?0:Math.round(a/20*100);const colors=['blue','green','purple','orange'];return `<div class="ref-bar-item"><b>${a===null?'—':a.toFixed(1)+' /20'}</b><i class="${colors[i%4]}" style="height:${Math.max(8,pct)}%"></i><span>${escapeHtml(c.name)}</span></div>`;}).join('');
  const trendClasses=state.classes.slice(0,4).map((c,i)=>{const a=weightedSubjectAvg(state.grades.filter(g=>g.classId===c.id));const color=['#1677FF','#16B85A','#6B2BD9','#FF9F0A'][i%4];return `<span><i style="background:${color}"></i>${escapeHtml(c.name)}</span>`;}).join('');
  const trendPeriods=[0,1,2,3].map(q=>weightedSubjectAvg(state.grades.filter(g=>{const month=new Date(`${g.date}T00:00:00`).getMonth();return Math.floor(month/3)===q;})));
  const trendHasData=trendPeriods.some(v=>v!==null);
  const trendGraph=trendHasData?`<div class="trend-bars">${trendPeriods.map((v,i)=>`<div class="trend-bar-item"><b>${v===null?'—':v.toFixed(1)}</b><i style="height:${v===null?4:Math.max(6,Math.round(v/20*100))}%"></i><span>T${i+1}</span></div>`).join('')}</div>`:'<div class="ref-empty">Ajoutez des notes datées pour afficher l’évolution trimestrielle.</div>';
  const dueRows=allPending.slice(0,3).map(h=>`<div class="ref-list-row"><span class="ref-list-icon">▣</span><div><b>${escapeHtml(h.title)}</b><small>${escapeHtml(classLabel(h.classId))}</small></div><em class="${daysUntil(h.dueDate)<0?'danger':''}">${daysUntil(h.dueDate)<0?'En retard':fmtDateShort(h.dueDate)}</em></div>`).join('');
  const reportRows=state.sessions.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,3).map(s=>`<div class="ref-list-row"><span class="ref-list-icon pdf">PDF</span><div><b>${escapeHtml(classLabel(s.classId))}</b><small>${escapeHtml(s.topic||'Séance')}</small></div><em>${fmtDateShort(s.date||today)}</em></div>`).join('');
  let hero;
  if(now){const c=getClass(now.classId);hero=`<div class="dashboard-hero-icon">◆</div><div><p class="hero-label">Séance en cours</p><h2>Bonjour, ${escapeHtml(getAppName().replace(/^Classe\s*·?\s*/i,'').trim()||'enseignant')} !</h2><p class="hero-note">Enseigner • Suivre • Réussir ensemble</p><div class="hero-session-line"><b>${escapeHtml(c?.name||'—')}</b><span>${escapeHtml(now.topic||'Séance')} · ${now.start}–${now.end}</span><button class="btn btn-primary btn-sm" id="heroSessionBtn">Ouvrir la séance</button></div></div>`;}
  else {const c=next?getClass(next.classId):null;hero=`<div class="dashboard-hero-icon">◆</div><div><p class="hero-label">Aujourd’hui · ${fmtDateLong(today).replace(/^./,x=>x.toUpperCase())}</p><h2>Bonjour, enseignant !</h2><p class="hero-note">Enseigner • Suivre • Réussir ensemble</p><div class="hero-session-line"><b>${next?escapeHtml(c?.name||'Prochaine séance'):'Journée libre'}</b><span>${next?escapeHtml(next.topic||'Séance')+' · '+next.start+'–'+next.end:'Préparez vos prochains cours depuis votre espace de pilotage.'}</span></div></div>`;}
  el.innerHTML=`
    <section class="reference-hero hero">${hero}<div class="hero-motto">« Une éducation de qualité,<br>un avenir meilleur. »</div></section>
    <section class="dashboard-kpis">
      <button class="ref-kpi kpi-blue" data-dashboard-tab="students" aria-label="Ouvrir les classes et les élèves"><span class="kpi-icon">♟</span><div><b>${classCount}</b><strong>Classes</strong><small>enregistrées</small></div><span class="kpi-arrow">→</span></button>
      <button class="ref-kpi kpi-green" data-dashboard-tab="students" aria-label="Ouvrir les élèves"><span class="kpi-icon">♟</span><div><b>${totalStudents}</b><strong>Élèves</strong><small>inscrits</small></div><span class="kpi-arrow">→</span></button>
      <button class="ref-kpi kpi-purple" data-dashboard-tab="schedule" aria-label="Ouvrir le planning des séances"><span class="kpi-icon">▣</span><div><b>${state.schedule.length}</b><strong>Séances</strong><small>planning</small></div><span class="kpi-arrow">→</span></button>
      <button class="ref-kpi kpi-orange" data-dashboard-tab="stats" aria-label="Ouvrir les statistiques et les notes"><span class="kpi-icon">▮</span><div><b>${avgAll===null?'—':avgAll.toFixed(1)+' /20'}</b><strong>Moyenne générale</strong><small>${at.rate===null?'À compléter':Math.round(at.rate)+'% présence'}</small></div><span class="kpi-arrow">→</span></button>
    </section>
    <section class="dashboard-grid reference-grid-top">
      <div class="reference-card chart-card"><div class="reference-card-head"><h3>▥ &nbsp; Performances par classe</h3><span>Cette année →</span></div><div class="class-bars">${classBars||'<div class="ref-empty">Ajoutez des classes et des notes pour afficher les performances.</div>'}</div></div>
      <div class="reference-card chart-card trend-card"><div class="reference-card-head"><h3>▰ &nbsp; Évolution des moyennes</h3><span>4 trimestres →</span></div><div class="trend-placeholder">${trendGraph}</div><div class="trend-legend">${trendClasses||'<span>Aucune classe</span>'}</div></div>
<div class="reference-card quick-reference"><div class="reference-card-head"><h3>⚡ &nbsp; Actions rapides</h3></div><div class="reference-quick-grid"><button id="qaPresence"><span>✓</span>Faire<br>l’appel</button><button id="qaEleve"><span>♟</span>Ajouter<br>un élève</button><button id="scheduleQuickBtn"><span>▣</span>Créer<br>une séance</button><button id="qaDevoir"><span>▤</span>Créer<br>un devoir</button><button id="qaNote"><span>✎</span>Saisir<br>les notes</button><button id="reportQuickBtn"><span>▥</span>Voir<br>les rapports</button><button id="importQuickBtn"><span>＋</span>Importer<br>des données</button><button id="exportQuickBtn"><span>⇩</span>Exporter<br>les résultats</button></div></div>
    </section>
    <section class="dashboard-grid reference-grid-middle">
      <div class="reference-card"><div class="reference-card-head purple-head"><h3>▣ &nbsp; Prochaines échéances</h3><button class="link" id="homeworkQuickBtn">Voir tout →</button></div>${dueRows||'<div class="ref-empty">Aucune échéance en attente.</div>'}</div>
      <div class="reference-card attendance-reference"><div class="reference-card-head green-head"><h3>▥ &nbsp; Présences du jour</h3><span>Voir détail →</span></div><div class="attendance-ref-body"><div class="ref-donut" style="--rate:${at.rate===null?0:Math.round(at.rate)}%"><b>${at.rate===null?'—':Math.round(at.rate)+'%'}</b></div><div class="attendance-ref-legend"><span><i class="green"></i>Présents <b>${present}</b></span><span><i class="red"></i>Absents <b>${absent}</b></span><span><i class="orange"></i>Retards <b>${late}</b></span></div></div></div>
      <div class="reference-card ultrareview-reference"><div><span class="eyebrow">UltraReview</span><h3>Entraînement intelligent<br>pour exceller aux examens</h3><button class="btn btn-primary" id="openUltraReview">Commencer ▶</button></div><div class="ur-orb">✦</div></div>
    </section>
    <section class="dashboard-grid reference-grid-bottom">
      <div class="reference-card mini-reference"><div class="reference-card-head"><h3>▥ &nbsp; Statistiques globales</h3><span>Voir plus →</span></div><div class="mini-stat"><b>${globalAt.rate===null?'—':Math.round(globalAt.rate)+'%'}</b><small>Taux de présence cumulé</small></div></div>
      <div class="reference-card mini-reference"><div class="reference-card-head"><h3>▤ &nbsp; Dernières séances</h3><span>Voir le planning →</span></div>${reportRows||'<div class="ref-empty">Aucune séance enregistrée.</div>'}</div>
      <div class="reference-card backup-reference"><div class="reference-card-head"><h3>☁ &nbsp; Sauvegarde & restauration</h3></div><p>Vos données restent sur cet appareil.</p><button class="btn btn-emerald" id="backupQuickBtn">Sauvegarder maintenant</button></div>
    </section>
    ${suggestions.length?`<section class="reference-alert"><b>À surveiller</b><span>${suggestions.length} signal(s) pédagogique(s) détecté(s)</span></section>`:''}`;
  document.querySelectorAll('[data-dashboard-tab]').forEach(card=>card.addEventListener('click',()=>document.querySelector(`.tab[data-tab="${card.dataset.dashboardTab}"]`)?.click()));
  document.getElementById('qaPresence')?.addEventListener('click',()=>{haptic();openAttendanceSheet(now?.classId||state.classes[0]?.id,now?.id);});
  document.getElementById('qaDevoir')?.addEventListener('click',()=>{haptic();openHomeworkForm();});
  document.getElementById('qaNote')?.addEventListener('click',()=>{haptic();openGradeForm();});
  document.getElementById('qaEleve')?.addEventListener('click',()=>{haptic();openStudentForm();});
  document.getElementById('scheduleQuickBtn')?.addEventListener('click',()=>openSlotForm(null,state.scheduleDayIndex));
  document.getElementById('reportQuickBtn')?.addEventListener('click',openReportChooser);
  document.getElementById('importQuickBtn')?.addEventListener('click',()=>document.getElementById('importFileInput').click());
  document.getElementById('exportQuickBtn')?.addEventListener('click',exportData);
  document.getElementById('backupQuickBtn')?.addEventListener('click',exportData);
  document.getElementById('homeworkQuickBtn')?.addEventListener('click',()=>document.querySelector('.tab[data-tab="homework"]')?.click());
  document.getElementById('heroSessionBtn')?.addEventListener('click',()=>now&&openSessionDetail(now.id));
  document.getElementById('openUltraReview')?.addEventListener('click',()=>{haptic();document.querySelector('.tab[data-tab="stats"]')?.click();});
}

function renderStudents(){
  const el=document.getElementById('view-students');
  const query=state.studentsSearch.toLowerCase();
  const filtered=state.students.filter(s=>{
    const cls=getClass(s.classId);
    const matches=!query||s.name.toLowerCase().includes(query)||cls?.name?.toLowerCase().includes(query)||cls?.subject?.toLowerCase().includes(query);
    return (state.studentsClassFilter==='all'||s.classId===state.studentsClassFilter)&&matches;
  }).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  el.innerHTML=`
    <div class="class-cta"><div><span class="class-cta-kicker">Organisation</span><strong>Mes classes</strong><p>Crée une classe pour commencer à ajouter tes élèves, notes et présences.</p></div><button class="btn btn-primary" id="visibleAddClassBtn">+ Créer une classe</button></div>
    <div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="studentSearchInput" value="${escapeHtml(state.studentsSearch)}" placeholder="Rechercher un élève..." aria-label="Rechercher un élève"></div>
    <div class="filter-row"><div class="day-tabs" id="classFilterTabs"><button class="day-tab ${state.studentsClassFilter==='all'?'active':''}" data-cls="all">Toutes (${state.students.length})</button>${state.classes.map(c=>`<button class="day-tab ${state.studentsClassFilter===c.id?'active':''}" data-cls="${c.id}">${escapeHtml(c.name)} (${studentsOf(c.id).length})</button>`).join('')}</div><button class="btn-icon" id="manageClassesBtn" title="Gérer les classes" aria-label="Gérer les classes">⚙</button></div>
    ${filtered.length?`<div class="card student-list">${filtered.map(s=>{const gs=gradesOfStudent(s.id),a=weightedSubjectAvg(gs),att=state.attendance.filter(x=>x.studentId===s.id);const abs=att.filter(x=>x.status==='a').length;return `<div class="row student-card clickable" data-student="${s.id}"><div class="avatar student-avatar">${initials(s.name)}</div><div class="row-main"><div class="row-title">${escapeHtml(s.name)}</div><div class="row-sub">${escapeHtml(classLabel(s.classId))} · ${gs.length} note(s) · ${abs} absence(s)</div></div><div class="row-end">${a!==null?`<span class="grade-pill ${gradeClass(a)}">${a.toFixed(1)}</span>`:''}</div></div>`;}).join('')}</div>`:`<div class="empty"><p>Aucun élève ${state.studentsSearch?'ne correspond à ta recherche':'enregistré'}.</p><button class="btn btn-primary empty-action" id="emptyAddStudent">Ajouter un élève</button></div>`}
  `;
  document.getElementById('studentSearchInput').oninput=e=>{state.studentsSearch=e.target.value;renderStudents();const i=document.getElementById('studentSearchInput');i.focus();i.setSelectionRange(i.value.length,i.value.length);};
  document.querySelectorAll('#classFilterTabs .day-tab').forEach(b=>b.onclick=()=>{state.studentsClassFilter=b.dataset.cls;renderStudents();});
  document.getElementById('manageClassesBtn').onclick=openClassManager;
  document.getElementById('visibleAddClassBtn').onclick=()=>{haptic();openClassForm();};
  document.querySelectorAll('[data-student]').forEach(r=>r.onclick=()=>openStudentDetail(r.dataset.student));
  document.getElementById('emptyAddStudent')?.addEventListener('click',()=>openStudentForm());
}

async function cascadeDeleteStudent(studentId){
  for(const g of state.grades.filter(x=>x.studentId===studentId)) await dbDelete('grades',g.id);
  for(const a of state.attendance.filter(x=>x.studentId===studentId)) await dbDelete('attendance',a.id);
  await dbDelete('students',studentId);
}

function findSession(date,classId,scheduleId){ return state.sessions.find(s=>s.date===date&&s.classId===classId&&((s.scheduleId||null)===(scheduleId||null))); }
async function getOrCreateSession(date,classId,scheduleId){
  let s=findSession(date,classId,scheduleId);
  if(s)return s;
  const slot=scheduleId?state.schedule.find(x=>x.id===scheduleId):null;
  s={id:uid(),date,classId,scheduleId:scheduleId||null,start:slot?.start||'',end:slot?.end||'',topic:slot?.topic||'Appel'};
  await dbPut('sessions',s); state.sessions.push(s); return s;
}

function openAttendanceSheet(classId,scheduleId){
  if(!classId){showToast("Crée d'abord une classe",'info');return;}
  const cls=getClass(classId), list=studentsOf(classId), today=todayISO();
  const slots=state.schedule.filter(s=>s.classId===classId&&s.day===new Date().getDay()).sort((a,b)=>a.start.localeCompare(b.start));
  if(!scheduleId && currentSlot()?.classId===classId) scheduleId=currentSlot().id;
  const marks={};
  const existingSession=findSession(today,classId,scheduleId);
  list.forEach(s=>{const rec=existingSession?state.attendance.find(a=>a.studentId===s.id&&a.sessionId===existingSession.id):null;marks[s.id]=rec?.status||'p';});
  const slotLabel=state.schedule.find(s=>s.id===scheduleId);
  openSheet(`<div class="sheet-header"><div><h3>Appel · ${escapeHtml(cls?.name||'')}</h3><p class="sheet-kicker">${fmtDateLong(today)}${slotLabel?' · '+slotLabel.start+'–'+slotLabel.end:''}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    ${slots.length?`<div class="field"><label>Séance du jour</label><select id="attSlotSelect"><option value="">Appel hors emploi du temps</option>${slots.map(s=>`<option value="${s.id}" ${scheduleId===s.id?'selected':''}>${s.start}–${s.end} · ${escapeHtml(s.topic||'Séance')}</option>`).join('')}</select></div>`:''}
    <div class="attendance-tools"><button class="btn btn-sm btn-ghost" id="markAllPresent">Tout présent</button><span class="muted">P présent · R retard · A absent</span></div>
    ${list.length?`<div class="card" id="attRows">${attendanceRows(list,marks)}</div>`:'<p class="muted">Aucun élève dans cette classe.</p>'}
    <button class="btn btn-primary btn-block" id="saveAttendanceBtn">Enregistrer l’appel</button>`);
  function refresh(){document.getElementById('attRows').innerHTML=attendanceRows(list,marks);bind();}
  function bind(){document.querySelectorAll('#attRows .status-btn').forEach(b=>b.onclick=()=>{marks[b.dataset.sid]=b.dataset.status;refresh();});}
  bind();
  document.getElementById('markAllPresent').onclick=()=>{list.forEach(s=>marks[s.id]='p');refresh();};
  document.getElementById('attSlotSelect')?.addEventListener('change',()=>openAttendanceSheet(classId,document.getElementById('attSlotSelect').value||null));
  document.getElementById('saveAttendanceBtn').onclick=async()=>{
    const selectedSchedule=document.getElementById('attSlotSelect')?.value||scheduleId||null;
    const session=await getOrCreateSession(today,classId,selectedSchedule);
    for(const s of list){const old=state.attendance.find(a=>a.sessionId===session.id&&a.studentId===s.id);await dbPut('attendance',{id:old?.id||uid(),sessionId:session.id,studentId:s.id,classId,date:today,status:marks[s.id]});}
    await loadAll();closeSheet();renderAll();showToast(`Appel enregistré · ${Object.values(marks).filter(v=>v==='a').length} absent(s)`);
  };
}
function attendanceRows(list,marks){return list.map(s=>`<div class="present-row"><div class="avatar">${initials(s.name)}</div><div class="row-main"><div class="row-title">${escapeHtml(s.name)}</div></div><div class="status-btns"><button class="status-btn p ${marks[s.id]==='p'?'on':''}" data-status="p" data-sid="${s.id}" aria-label="Présent">P</button><button class="status-btn r ${marks[s.id]==='r'?'on':''}" data-status="r" data-sid="${s.id}" aria-label="Retard">R</button><button class="status-btn a ${marks[s.id]==='a'?'on':''}" data-status="a" data-sid="${s.id}" aria-label="Absent">A</button></div></div>`).join('');}

function overlaps(a,b){ return a.day===b.day && a.id!==b.id && a.classId===b.classId && toMin(a.start)<toMin(b.end) && toMin(b.start)<toMin(a.end); }
function openSlotForm(existing,presetDay){
  const edit=!!existing;
  openSheet(`<div class="sheet-header"><h3>${edit?'Modifier la séance':'Nouvelle séance'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="field"><label>Jour</label><select id="fSlotDay">${DAYS_ORDER.map(d=>`<option value="${d}" ${(edit?existing.day:presetDay||1)===d?'selected':''}>${DAYS_FR[d][0].toUpperCase()+DAYS_FR[d].slice(1)}</option>`).join('')}</select></div>
    <div class="field-row"><div class="field"><label>Début</label><input type="time" id="fSlotStart" value="${edit?existing.start:'08:00'}"></div><div class="field"><label>Fin</label><input type="time" id="fSlotEnd" value="${edit?existing.end:'09:00'}"></div></div>
    <div class="field"><label>Classe</label><select id="fSlotClass">${state.classes.map(c=>`<option value="${c.id}" ${edit&&existing.classId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Thème / chapitre <span class="optional">optionnel</span></label><input id="fSlotTopic" value="${edit?escapeHtml(existing.topic||''):''}" placeholder="Ex. Mécanique — forces"></div>
    <button class="btn btn-primary btn-block" id="saveSlotBtn">${edit?'Enregistrer':'Ajouter la séance'}</button>${edit?'<button class="btn btn-danger-outline btn-block" id="deleteSlotBtn">Supprimer la séance</button>':''}`);
  document.getElementById('saveSlotBtn').onclick=async()=>{
    const day=Number(document.getElementById('fSlotDay').value),start=document.getElementById('fSlotStart').value,end=document.getElementById('fSlotEnd').value,classId=document.getElementById('fSlotClass').value,topic=document.getElementById('fSlotTopic').value.trim();
    if(!classId||!start||!end){showToast('Renseigne les champs requis','info');return;}
    if(toMin(end)<=toMin(start)){showToast("L'heure de fin doit être après le début",'info');return;}
    const candidate={id:edit?existing.id:uid(),day,start,end,classId,topic};
    const conflict=state.schedule.find(s=>overlaps(candidate,s));
    if(conflict&&!confirm(`Chevauchement détecté avec ${conflict.start}–${conflict.end} (${classLabel(conflict.classId)}). Enregistrer quand même ?`)) return;
    await dbPut('schedule',candidate);await loadAll();await syncNativeNotifications();state.scheduleDayIndex=day;closeSheet();renderAll();showToast(edit?'Séance modifiée':'Séance ajoutée');
  };
  if(edit) document.getElementById('deleteSlotBtn').onclick=async()=>{if(!confirm('Supprimer cette séance ? Les appels déjà enregistrés resteront conservés.'))return;await dbDelete('schedule',existing.id);await loadAll();await syncNativeNotifications();closeSheet();renderAll();showToast('Séance supprimée');};
}

function renderHomework(){
  const el=document.getElementById('view-homework');let list=[...state.homework];if(state.homeworkFilter==='pending')list=list.filter(h=>!h.done);if(state.homeworkFilter==='done')list=list.filter(h=>h.done);list.sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  el.innerHTML=`<div class="segmented"><button class="${state.homeworkFilter==='pending'?'active':''}" data-f="pending">À faire</button><button class="${state.homeworkFilter==='done'?'active':''}" data-f="done">Terminés</button><button class="${state.homeworkFilter==='all'?'active':''}" data-f="all">Tous</button></div>
    ${list.length?list.map(h=>{const d=daysUntil(h.dueDate),over=!h.done&&d<0,cls=getClass(h.classId);const label=h.done?'Terminé':over?`Retard · ${Math.abs(d)} j`:d===0?"Aujourd'hui":d===1?'Demain':`Dans ${d} j`;return `<div class="hw-card ${over?'overdue':''} ${h.done?'done':''} clickable" data-hw="${h.id}"><div class="hw-top"><div><div class="hw-title">${escapeHtml(h.title)}</div><div class="hw-meta">${escapeHtml(cls?.name||'—')} · ${fmtDateShort(h.dueDate)}</div></div><span class="hw-due">${label}</span></div>${h.description?`<div class="hw-desc">${escapeHtml(h.description)}</div>`:''}</div>`;}).join(''):`<div class="empty"><p>${state.homeworkFilter==='done'?'Aucun devoir terminé.':'Aucun devoir programmé.'}</p><button class="btn btn-primary empty-action" id="emptyAddHw">Programmer un devoir</button></div>`}`;
  document.querySelectorAll('.segmented button').forEach(b=>b.onclick=()=>{state.homeworkFilter=b.dataset.f;renderHomework();});
  document.querySelectorAll('[data-hw]').forEach(c=>c.onclick=()=>openHomeworkDetail(c.dataset.hw));document.getElementById('emptyAddHw')?.addEventListener('click',()=>openHomeworkForm());
}
function openHomeworkForm(existing){
  const edit=!!existing;
  openSheet(`<div class="sheet-header"><h3>${edit?'Modifier le devoir':'Nouveau devoir / exercice'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="field"><label>Titre</label><input id="fHwTitle" value="${edit?escapeHtml(existing.title):''}" placeholder="Ex. Exercices 3 à 7 p.42"></div><div class="field"><label>Classe</label><select id="fHwClass">${state.classes.map(c=>`<option value="${c.id}" ${edit&&existing.classId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="field"><label>Date de rendu</label><input type="date" id="fHwDue" value="${edit?existing.dueDate:todayISO()}"></div><div class="field"><label>Consigne <span class="optional">optionnel</span></label><textarea id="fHwDesc" placeholder="Pages, chapitre, consignes...">${edit?escapeHtml(existing.description||''):''}</textarea></div><button class="btn btn-primary btn-block" id="saveHwBtn">${edit?'Enregistrer':'Programmer'}</button>${edit?'<button class="btn btn-danger-outline btn-block" id="deleteHwBtn">Supprimer</button>':''}`);
  document.getElementById('saveHwBtn').onclick=async()=>{const title=document.getElementById('fHwTitle').value.trim(),classId=document.getElementById('fHwClass').value,dueDate=document.getElementById('fHwDue').value,description=document.getElementById('fHwDesc').value.trim();if(!title||!classId||!dueDate){showToast('Titre, classe et date requis','info');return;}await dbPut('homework',{id:edit?existing.id:uid(),title,classId,dueDate,description,done:edit?existing.done:false});await loadAll();closeSheet();renderAll();showToast(edit?'Devoir modifié':'Devoir programmé');};
  if(edit)document.getElementById('deleteHwBtn').onclick=async()=>{if(!confirm('Supprimer ce devoir ?'))return;await dbDelete('homework',existing.id);await loadAll();closeSheet();renderAll();showToast('Devoir supprimé');};
}
function openHomeworkDetail(id){
  const h=state.homework.find(x=>x.id===id);if(!h)return;const d=daysUntil(h.dueDate);
  openSheet(`<div class="sheet-header"><div><h3>${escapeHtml(h.title)}</h3><p class="sheet-kicker">${escapeHtml(classLabel(h.classId))} · ${fmtDateShort(h.dueDate)}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>${h.description?`<div class="note-card">${escapeHtml(h.description)}</div>`:''}<div class="status-banner ${h.done?'success':d<0?'danger':'warning'}">${h.done?'Devoir terminé':d<0?`En retard de ${Math.abs(d)} jour(s)`:d===0?"À rendre aujourd'hui":`À rendre dans ${d} jour(s)`}</div><div class="sheet-actions"><button class="btn ${h.done?'btn-ghost':'btn-emerald'}" id="toggleDoneBtn">${h.done?'Remettre à faire':'Marquer terminé'}</button><button class="btn btn-ghost" id="editHwBtn">Modifier</button></div>`);
  document.getElementById('toggleDoneBtn').onclick=async()=>{h.done=!h.done;await dbPut('homework',h);await loadAll();closeSheet();renderAll();showToast(h.done?'Devoir marqué terminé':'Devoir remis à faire');};
  document.getElementById('editHwBtn').onclick=()=>openHomeworkForm(h);
}

function openClassManager(){
  openSheet(`<div class="sheet-header"><div><h3>Mes classes</h3><p class="sheet-kicker">${state.classes.length} classe(s)</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="card">${state.classes.map(c=>`<div class="row"><div class="row-main"><div class="row-title">${escapeHtml(c.name)}</div><div class="row-sub">${escapeHtml(c.subject||'')} · ${studentsOf(c.id).length} élève(s)</div></div><button class="btn btn-sm btn-ghost" data-editcls="${c.id}">Modifier</button></div>`).join('')||'<p class="muted">Aucune classe.</p>'}</div><button class="btn btn-primary btn-block" id="addClassBtn">Ajouter une classe</button>`);
  document.querySelectorAll('[data-editcls]').forEach(b=>b.onclick=()=>openClassForm(state.classes.find(c=>c.id===b.dataset.editcls)));document.getElementById('addClassBtn').onclick=()=>openClassForm();
}
function openClassForm(existing){
  const edit=!!existing;
  openSheet(`<div class="sheet-header"><h3>${edit?'Modifier la classe':'Nouvelle classe'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="field"><label>Nom de la classe</label><input id="fClassName" value="${edit?escapeHtml(existing.name):''}" placeholder="Ex. 2nde, 1ère L"></div><div class="field"><label>Matière</label><input id="fClassSubject" value="${edit?escapeHtml(existing.subject||''):''}" placeholder="Ex. Physique-Chimie"></div><button class="btn btn-primary btn-block" id="saveClassBtn">${edit?'Enregistrer':'Créer la classe'}</button>${edit?'<button class="btn btn-danger-outline btn-block" id="deleteClassBtn">Supprimer la classe</button>':''}`);
  document.getElementById('saveClassBtn').onclick=async()=>{const name=document.getElementById('fClassName').value.trim(),subject=document.getElementById('fClassSubject').value.trim();if(!name){showToast('Le nom est requis','info');return;}await dbPut('classes',{id:edit?existing.id:uid(),name,subject,color:existing?.color||'#B85C3E'});await loadAll();closeSheet();renderAll();showToast(edit?'Classe modifiée':'Classe créée');};
  if(edit)document.getElementById('deleteClassBtn').onclick=async()=>{const counts={students:studentsOf(existing.id).length,grades:state.grades.filter(g=>g.classId===existing.id).length,homework:state.homework.filter(h=>h.classId===existing.id).length,schedule:state.schedule.filter(s=>s.classId===existing.id).length};if(!confirm(`Supprimer ${existing.name} ? Cela supprimera aussi ${counts.students} élève(s), ${counts.grades} note(s), ${counts.homework} devoir(s) et ${counts.schedule} séance(s).`))return;await cascadeDeleteClass(existing.id);await loadAll();closeSheet();renderAll();showToast('Classe et données associées supprimées');};
}
async function cascadeDeleteClass(classId){
  const studentIds=new Set(state.students.filter(s=>s.classId===classId).map(s=>s.id));
  for(const s of state.students.filter(x=>x.classId===classId)) await dbDelete('students',s.id);
  for(const g of state.grades.filter(x=>x.classId===classId||studentIds.has(x.studentId))) await dbDelete('grades',g.id);
  for(const a of state.attendance.filter(x=>x.classId===classId||studentIds.has(x.studentId))) await dbDelete('attendance',a.id);
  for(const h of state.homework.filter(x=>x.classId===classId)) await dbDelete('homework',h.id);
  for(const s of state.schedule.filter(x=>x.classId===classId)) await dbDelete('schedule',s.id);
  for(const s of state.sessions.filter(x=>x.classId===classId)) await dbDelete('sessions',s.id);
  await dbDelete('classes',classId);
}

async function exportData(){
  const data={version:2,exportedAt:new Date().toISOString(),stores:{}};
  for(const name of Object.keys(STORES)) data.stores[name]=await dbGetAll(name);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`classe-sauvegarde-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Sauvegarde exportée');
}
let nativeMigrationPlugin;
function getNativeMigrationPlugin(){
  if(nativeMigrationPlugin!==undefined)return nativeMigrationPlugin;
  const cap=globalThis.Capacitor;
  nativeMigrationPlugin=cap?.registerPlugin?cap.registerPlugin('NativeMigration'):null;
  return nativeMigrationPlugin;
}
async function syncNativeMigrationSnapshot(){
  const plugin=getNativeMigrationPlugin();
  if(!plugin?.saveSnapshot)return;
  try{await plugin.saveSnapshot({payload:JSON.stringify({version:2,exportedAt:new Date().toISOString(),stores:{classes:state.classes,subjects:state.subjects,students:state.students,schedule:state.schedule,homework:state.homework,grades:state.grades,attendance:state.attendance,sessions:state.sessions,settings:state.settings}})});}catch(error){console.debug('Native migration mirror unavailable',error);}
}
function openImportPicker(){ document.getElementById('importFileInput').click(); }
async function importData(file){
  try{
    if(!file||file.size>10*1024*1024) throw new Error('Sauvegarde trop volumineuse');
    const parsed=JSON.parse(await file.text());
    if(!parsed?.stores?.classes||!parsed?.stores?.students) throw new Error('Format invalide');
    const arrays=Object.keys(STORES).every(name=>parsed.stores[name]===undefined||Array.isArray(parsed.stores[name]));
    if(!arrays) throw new Error('Structure de sauvegarde invalide');
    for(const row of parsed.stores.students||[]){if(!row||typeof row.id!=='string'||typeof row.name!=='string'||typeof row.classId!=='string')throw new Error('Élève invalide');}
    for(const row of parsed.stores.classes||[]){if(!row||typeof row.id!=='string'||typeof row.name!=='string')throw new Error('Classe invalide');}
    if(!confirm('Restaurer cette sauvegarde ? Les données actuelles seront remplacées.')) return;
    for(const name of Object.keys(STORES)) await clearStore(name);
    for(const name of Object.keys(STORES)){for(const row of (parsed.stores[name]||[])) await dbPut(name,row);}
    await loadAll();await migrateLegacyAttendance();await loadAll();renderAll();closeSheet();showToast('Sauvegarde restaurée');
  }catch(e){console.error(e);showToast('Impossible de restaurer cette sauvegarde','info');}
}
function exportGradesCSV(classId){
  const rows=[['Élève','Classe','Matière','Coef. matière','Évaluation','Note /20','Coef. note','Date']];
  state.grades.filter(g=>g.classId===classId).forEach(g=>{const s=state.students.find(x=>x.id===g.studentId),subject=subjectOf(g.subjectId);rows.push([s?.name||'Élève supprimé',classLabel(g.classId),subject?.name||'Matière générale',subject?.coefficient||1,g.label,g.value,g.coef||1,g.date]);});
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob=new Blob(["\uFEFF"+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`notes-${escapeFileName(classLabel(classId))}-${todayISO()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('CSV exporté');
}
function escapeFileName(s){return String(s||'classe').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'classe';}
async function prepareSafeUpdate(){
  await exportData();
  try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();}catch(e){console.warn('Mise à jour PWA:',e);}
  showToast('Sauvegarde téléchargée avant la mise à jour');
}
function openSettings(){
  const pin=!!localStorage.getItem('classe_pin_hash'), proConfigured=!!localStorage.getItem('classe_pro_password_hash'), notif=localStorage.getItem('classe_notifications')==='1', dark=document.documentElement.classList.contains('dark');
  openSheet(`<div class="sheet-header"><div><h3>Réglages</h3><p class="sheet-kicker">${getAppName()} · v${APP_VERSION}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="settings-brand"><div class="logo"><svg viewBox="0 0 48 48" fill="none"><rect x="7" y="9" width="15" height="27" rx="4" fill="#1E2A2F"/><rect x="26" y="9" width="15" height="27" rx="4" fill="#1E2A2F"/><path d="M24 10v25" stroke="#F7F1E3" stroke-width="3"/><path d="m30 28 4 4 8-10" stroke="#4D8464" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><strong>Classe</strong><small>Votre carnet de bord, même sans connexion.</small></div></div>
    <div class="settings-section"><div class="settings-title">Partager l’application</div><p class="muted">Partage le lien de Classe avec un collègue.</p><button class="btn btn-ghost btn-block" id="shareAppBtn" type="button">↗ Partager l’application</button></div>
    <div class="settings-section"><div class="settings-title">Apparence</div><div class="settings-actions"><button class="btn ${!dark?'btn-primary':'btn-ghost'}" id="themeLight">☀️ Clair</button><button class="btn ${dark?'btn-primary':'btn-ghost'}" id="themeDark">🌙 Sombre</button></div></div>
    <div class="settings-section"><div class="settings-title">Version Pro</div><p class="muted">Accès administrateur protégé par mot de passe. ${proConfigured?'Le mot de passe est configuré sur cet appareil.':'La première ouverture utilisera le mot de passe temporaire indiqué.'}</p><button class="btn btn-ghost btn-block" id="proPasswordBtn">${proConfigured?'Modifier le mot de passe Pro':'Configurer l’accès Pro'}</button></div>
    <div class="settings-section"><div class="settings-title">Sécurité</div><p class="muted">Protège les données locales avec un PIN sur cet appareil.</p><div class="settings-actions"><button class="btn btn-ghost" id="pinBtn">${pin?'Changer le PIN':'Créer un PIN'}</button>${pin?'<button class="btn btn-ghost" id="removePinBtn">Désactiver</button>':''}</div></div>
    <div class="settings-section"><div class="settings-title">Sons d’interface</div><p class="muted">Effets cyberpunk futuristes pour les clics, validations et ouvertures de panneaux.</p><button class="btn ${uiSoundsEnabled()?'btn-primary':'btn-ghost'} btn-block" id="uiSoundsBtn">${uiSoundsEnabled()?'🔊 Sons activés':'🔇 Sons désactivés'}</button></div>
    <div class="settings-section"><div class="settings-title">Notifications</div><p class="muted">${window.ClassNativeNotifications?.available?'Rappels Android planifiés même lorsque Classe est fermée.':'Rappels lorsque l’application est ouverte.'}</p><button class="btn btn-ghost btn-block" id="notifBtn">${notif?'✓ Notifications 24/24 activées':'Activer les notifications 24/24'}</button></div>
    <div class="settings-section"><div class="settings-title">Sauvegarde</div><p class="muted">Garde une copie complète avant de changer de téléphone.</p><div class="settings-actions"><button class="btn btn-ghost" id="exportBtn">Exporter JSON</button><button class="btn btn-ghost" id="importBtn">Restaurer JSON</button></div></div>
    <div class="settings-section update-card"><div class="settings-title">Mise à jour sécurisée</div><p class="muted">Version ${APP_VERSION}. Exporte automatiquement tes données avant de vérifier la nouvelle version.</p><button class="btn btn-primary btn-block" id="safeUpdateBtn">Sauvegarder et vérifier la mise à jour</button></div>
    <div class="settings-section"><div class="settings-title">Import / rapports</div><div class="settings-actions"><button class="btn btn-ghost" id="csvStudentsBtn">Importer CSV élèves + notes</button><button class="btn btn-ghost" id="reportBtn">Rapport / PDF</button></div></div>
    <div class="settings-section"><div class="settings-title">État de l’application</div>${appHealth()}<p class="muted" style="margin-top:9px">Les données scolaires restent dans le stockage local de ce téléphone.</p></div>
    <div class="settings-section danger-zone"><div class="settings-title">Zone sensible</div><button class="btn btn-danger-outline btn-block" id="wipeBtn">Tout effacer</button></div>`);
  updateInstallButtons();
  document.getElementById('themeLight').onclick=()=>{haptic();document.documentElement.classList.remove('dark');localStorage.setItem('classe_theme','light');closeSheet();renderAll();};
  document.getElementById('themeDark').onclick=()=>{haptic();document.documentElement.classList.add('dark');localStorage.setItem('classe_theme','dark');closeSheet();renderAll();};
  document.getElementById('shareAppBtn').onclick=()=>{haptic();shareApp();};
  document.getElementById('proPasswordBtn').onclick=openProPasswordSettings;document.getElementById('pinBtn').onclick=setupPin;document.getElementById('removePinBtn')?.addEventListener('click',removePin);
  document.getElementById('exportBtn').onclick=exportData;document.getElementById('importBtn').onclick=openImportPicker;
  document.getElementById('safeUpdateBtn').onclick=prepareSafeUpdate;
  document.getElementById('csvStudentsBtn').onclick=()=>document.getElementById('studentCsvInput').click();document.getElementById('reportBtn').onclick=openReportChooser;
  document.getElementById('notifBtn').onclick=enableNotifications;
  document.getElementById('uiSoundsBtn').onclick=()=>{const enabled=!uiSoundsEnabled();setUiSounds(enabled);openSettings();};
  document.getElementById('wipeBtn').onclick=async()=>{if(!confirm('Supprimer TOUTES les données locales ? Fais une sauvegarde avant.'))return;for(const n of Object.keys(STORES))await clearStore(n);await dbPut('settings',{key:'seeded',value:true});await loadAll();await syncNativeNotifications();renderAll();closeSheet();showToast('Toutes les données ont été effacées');};
}

/* =========================================================
   CLASSE v4 — expérience mobile améliorée

   Statistiques · notes pondérées · saisie collective · calendrier
   journal de séance · rapports · import CSV · thème sombre · PIN
   notifications locales · fiche élève enrichie
   ========================================================= */

state.scheduleView = state.scheduleView || 'week';
state.calendarMonth = state.calendarMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function weightedAvg(grades){
  if(!grades.length) return null;
  let sum=0, weight=0;
  for(const g of grades){ const w=Math.max(0.01, Number(g.coef)||1); sum += Number(g.value)*w; weight += w; }
  return weight ? sum/weight : null;
}
function subjectOf(id){ return state.subjects.find(s=>s.id===id); }
function weightedSubjectAvg(grades){
  if(!grades.length) return null;
  const groups=new Map();
  for(const grade of grades){const key=grade.subjectId||'__legacy__';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(grade);}
  let sum=0,weight=0;
  for(const [id,list] of groups){
    const subject=id==='__legacy__'?null:subjectOf(id);
    const subjectAvg=weightedAvg(list), subjectCoef=Math.max(0.01,Number(subject?.coefficient)||1);
    if(subjectAvg!==null){sum+=subjectAvg*subjectCoef;weight+=subjectCoef;}
  }
  return weight?sum/weight:null;
}
function runLocalAudit(){
  const issues=[], classes=state.classes, students=state.students, grades=state.grades, subjects=state.subjects, homework=state.homework, attendance=state.attendance;
  const push=(severity,title,detail,action)=>issues.push({severity,title,detail,action});
  classes.filter(c=>!subjects.some(s=>s.classId===c.id)).forEach(c=>push('warning','Matières manquantes',`${c.name} n’a aucune matière configurée.`,'Ajouter une matière dans Notes'));
  students.filter(s=>!grades.some(g=>g.studentId===s.id)).forEach(s=>push('info','Élève sans note',`${s.name} n’a encore aucune évaluation enregistrée.`,'Créer une évaluation'));
  grades.filter(g=>!g.subjectId||!subjectOf(g.subjectId)).forEach(g=>push('warning','Note sans matière',`${g.label||'Évaluation'} est rattachée à une matière introuvable.`,'Corriger la note'));
  grades.filter(g=>Number(g.value)<0||Number(g.value)>20||!Number.isFinite(Number(g.value))).forEach(g=>push('danger','Note incohérente',`${g.label||'Évaluation'} contient une valeur hors de 0 à 20.`,'Vérifier les notes'));
  grades.filter(g=>!Number.isFinite(Number(g.coef))||Number(g.coef)<=0).forEach(g=>push('danger','Coefficient invalide',`${g.label||'Évaluation'} possède un coefficient invalide.`,'Corriger le coefficient'));
  homework.filter(h=>!h.done&&daysUntil(h.dueDate)<0).forEach(h=>push('warning','Devoir en retard',`${h.title} · ${classLabel(h.classId)}.`,'Ouvrir les devoirs'));
  const seen=new Set();students.forEach(s=>{const key=`${s.classId}|${String(s.name||'').toLowerCase().replace(/\s+/g,' ').trim()}`;if(seen.has(key))push('warning','Doublon possible',`${s.name} semble apparaître plusieurs fois dans la même classe.`,'Vérifier les élèves');seen.add(key);});
  if(attendance.filter(a=>a.status==='a').length>0)push('info','Absences à suivre',`${attendance.filter(a=>a.status==='a').length} absence(s) enregistrée(s).`,'Ouvrir les présences');
  const score=Math.max(0,100-issues.reduce((n,x)=>n+(x.severity==='danger'?15:x.severity==='warning'?7:3),0));
  return {issues,score,counts:{classes:classes.length,students:students.length,subjects:subjects.length,grades:grades.length,homework:homework.length,attendance:attendance.length}};
}
function openLocalAudit(){
  const audit=runLocalAudit(), tone=audit.score>=85?'success':audit.score>=65?'warning':'danger';
  openSheet(`<div class="sheet-header"><div><h3>Audit IA local</h3><p class="sheet-kicker">Analyse hors ligne · aucune donnée envoyée</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="status-banner ${tone}"><b>Indice de qualité : ${audit.score}/100</b><br><span>${audit.issues.length?'Points à vérifier détectés.':'Aucun problème prioritaire détecté.'}</span></div><div class="insight-grid"><div class="insight-card"><div class="big">${audit.counts.students}</div><div class="label">Élèves analysés</div></div><div class="insight-card"><div class="big">${audit.counts.grades}</div><div class="label">Notes contrôlées</div></div><div class="insight-card"><div class="big">${audit.counts.subjects}</div><div class="label">Matières</div></div><div class="insight-card"><div class="big">${audit.issues.length}</div><div class="label">Signaux</div></div></div><h3 class="section-title">Résultats de l’audit</h3>${audit.issues.length?`<div class="card">${audit.issues.slice(0,30).map(i=>`<div class="row"><div class="row-main"><div class="row-title">${escapeHtml(i.title)}</div><div class="row-sub">${escapeHtml(i.detail)}</div></div><span class="chip ${i.severity==='danger'?'chip-rouge':i.severity==='warning'?'chip-ocre':'chip-emerald'}">${i.severity==='danger'?'Urgent':i.severity==='warning'?'À vérifier':'Info'}</span></div>`).join('')}</div>`:'<div class="status-banner success">Toutes les données principales sont cohérentes.</div>'}<button class="btn btn-primary btn-block" id="rerunLocalAudit">Relancer l’audit</button><p class="muted" style="margin-top:10px">Cet audit est un moteur local déterministe compatible avec les Android anciens. Il vérifie les données sans serveur ni compte externe.</p>`);
  document.getElementById('rerunLocalAudit').onclick=openLocalAudit;
}
function attendanceStats(classId){
  const arr=state.attendance.filter(a=>!classId||a.classId===classId);
  const p=arr.filter(a=>a.status==='p').length,r=arr.filter(a=>a.status==='r').length,a=arr.filter(a=>a.status==='a').length;
  const total=p+r+a; return {p,r,a,total,rate:total?((p+r)/total*100):null};
}
function attendanceStatsForDate(date=todayISO(),classId=null){
  const arr=state.attendance.filter(a=>a.date===date&&(!classId||a.classId===classId));
  const p=arr.filter(a=>a.status==='p').length,r=arr.filter(a=>a.status==='r').length,a=arr.filter(a=>a.status==='a').length;
  const total=p+r+a; return {p,r,a,total,rate:total?((p+r)/total*100):null};
}
function getSetting(key, fallback=null){ const s=state.settings?.find?.(x=>x.key===key); return s?s.value:fallback; }
async function saveSetting(key,value){ await dbPut('settings',{key,value}); if(!state.settings)state.settings=[]; const i=state.settings.findIndex(x=>x.key===key); if(i>=0)state.settings[i].value=value; else state.settings.push({key,value}); }

/* ---------- Enhanced student profile ---------- */
async function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
}
function openStudentForm(existing){
  const edit=!!existing;
  openSheet(`<div class="sheet-header"><h3>${edit?"Modifier l'élève":'Nouvel élève'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="student-photo-editor">${safePhotoUrl(existing?.photo)?`<img src="${safePhotoUrl(existing.photo)}" alt="Photo de ${escapeHtml(existing.name)}">`:`<div class="student-photo-placeholder">${edit?initials(existing.name):'+'}</div>`}<label class="btn btn-sm btn-ghost">${safePhotoUrl(existing?.photo)?'Changer la photo':'Ajouter une photo'}<input id="fStudentPhoto" type="file" accept="image/*" capture="environment" hidden></label></div>
    <div class="field"><label>Nom complet</label><input id="fStudentName" value="${edit?escapeHtml(existing.name):''}" placeholder="Ex. Aïcha Mahamat" autocomplete="name"></div>
    <div class="field"><label>Classe</label><select id="fStudentClass">${state.classes.map(c=>`<option value="${c.id}" ${edit&&existing.classId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Téléphone parent/tuteur <span class="optional">optionnel</span></label><input type="tel" id="fStudentPhone" value="${edit?escapeHtml(existing.phone||''):''}" placeholder="+235 ..."></div>
    <div class="field"><label>Note interne <span class="optional">optionnel</span></label><textarea id="fStudentNote" placeholder="Remarques particulières...">${edit?escapeHtml(existing.note||''):''}</textarea></div>
    <button class="btn btn-primary btn-block" id="saveStudentBtn">${edit?'Enregistrer':'Ajouter l’élève'}</button>
    ${edit?'<button class="btn btn-danger-outline btn-block" id="deleteStudentBtn">Supprimer l’élève</button>':''}`);
  let photo=existing?.photo||'';
  document.getElementById('fStudentPhoto').onchange=async e=>{const f=e.target.files?.[0];if(f){if(f.size>1200000){showToast('Photo trop volumineuse (1,2 Mo max)','info');return;}photo=await fileToDataUrl(f);const holder=document.querySelector('.student-photo-editor');holder.querySelector('img,.student-photo-placeholder')?.remove();const img=document.createElement('img');img.src=photo;img.alt='Photo';holder.prepend(img);}};
  document.getElementById('saveStudentBtn').onclick=async()=>{const name=document.getElementById('fStudentName').value.trim(),classId=document.getElementById('fStudentClass').value,phone=document.getElementById('fStudentPhone').value.trim(),note=document.getElementById('fStudentNote').value.trim();if(!name||!classId){showToast('Nom et classe requis','info');return;}const duplicate=state.students.find(x=>x.id!==existing?.id&&x.classId===classId&&x.name.trim().toLowerCase()===name.toLowerCase());if(duplicate&&!confirm(`Un élève nommé « ${name} » existe déjà dans cette classe. Ajouter quand même ?`))return;await dbPut('students',{id:edit?existing.id:uid(),classId,name,phone,note,photo});await loadAll();closeSheet();renderAll();showToast(edit?'Élève modifié':'Élève ajouté');};
  if(edit)document.getElementById('deleteStudentBtn').onclick=async()=>{if(!confirm(`Supprimer ${existing.name} et toutes ses données scolaires ?`))return;await cascadeDeleteStudent(existing.id);await loadAll();closeSheet();renderAll();showToast('Élève supprimé');};
}
function openStudentDetail(studentId){
  const s=state.students.find(x=>x.id===studentId); if(!s)return;
  const gs=gradesOfStudent(studentId).sort((a,b)=>b.date.localeCompare(a.date)), a=weightedAvg(gs), at=state.attendance.filter(x=>x.studentId===studentId), p=at.filter(x=>x.status==='p').length,r=at.filter(x=>x.status==='r').length,ab=at.filter(x=>x.status==='a').length,total=at.length,rate=total?Math.round((p+r)/total*100):null;
  const call=s.phone?`<a class="btn btn-ghost" href="tel:${escapeHtml(s.phone)}">Appeler</a>`:'';
  openSheet(`<div class="sheet-header"><div><h3>${escapeHtml(s.name)}</h3><p class="sheet-kicker">${escapeHtml(classLabel(s.classId))}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="student-profile-head">${safePhotoUrl(s.photo)?`<img src="${safePhotoUrl(s.photo)}" alt="Photo">`:`<div class="student-avatar-large">${initials(s.name)}</div>`}<div><div class="student-profile-name">${escapeHtml(s.name)}</div><div class="muted">${s.phone?escapeHtml(s.phone):'Aucun contact enregistré'}</div></div></div>
    <div class="stat-grid"><div class="stat-box"><div class="v">${a!==null?a.toFixed(1):'—'}</div><div class="l">Moyenne /20</div></div><div class="stat-box"><div class="v">${rate!==null?rate+'%':'—'}</div><div class="l">Présence</div></div><div class="stat-box"><div class="v">${ab}</div><div class="l">Absences</div></div></div>
    ${s.note?`<div class="note-card">${escapeHtml(s.note)}</div>`:''}
    <div class="attendance-summary"><span>Présent ${p}</span><span>Retard ${r}</span><span>Absent ${ab}</span></div>
    <div class="sheet-actions">${call}<button class="btn btn-ghost" id="editStudentBtn">Modifier</button><button class="btn btn-primary" id="addGradeForStudentBtn">Note</button></div>
    <h2 class="section-title">Historique des notes</h2>${gs.length?`<div class="card">${gs.slice(0,10).map(g=>`<div class="row clickable" data-edit-grade="${g.id}"><div class="row-main"><div class="row-title">${escapeHtml(subjectOf(g.subjectId)?.name||'Matière générale')} · ${escapeHtml(g.label)}</div><div class="row-sub">${fmtDateShort(g.date)} · note coef. ${Number(g.coef)||1}</div></div><div class="row-end"><span class="grade-pill ${gradeClass(g.value)}">${g.value}/20</span></div></div>`).join('')}</div>`:'<p class="muted">Aucune note enregistrée.</p>'}`);
  document.getElementById('editStudentBtn').onclick=()=>openStudentForm(s);document.getElementById('addGradeForStudentBtn').onclick=()=>openGradeForm(s.classId,s.id);document.querySelectorAll('[data-edit-grade]').forEach(b=>b.onclick=()=>openGradeForm(null,null,state.grades.find(g=>g.id===b.dataset.editGrade)));
}

/* ---------- Weighted grades + bulk entry ---------- */
function renderGrades(){
  const el=document.getElementById('view-grades');
  if(state.gradesClassFilter===null&&state.classes.length)state.gradesClassFilter=state.classes[0].id;
  const cid=state.gradesClassFilter,cls=getClass(cid),grades=state.grades.filter(g=>g.classId===cid).sort((a,b)=>b.date.localeCompare(a.date)),classAvg=weightedSubjectAvg(grades);
  el.innerHTML=`<div class="day-tabs" id="gradeClassTabs">${state.classes.map(c=>`<button class="day-tab ${cid===c.id?'active':''}" data-cls="${c.id}">${escapeHtml(c.name)}</button>`).join('')}</div>${cid?`
    <div class="stat-grid"><div class="stat-box"><div class="v">${classAvg!==null?classAvg.toFixed(1):'—'}</div><div class="l">Moyenne pondérée</div></div><div class="stat-box"><div class="v">${grades.length}</div><div class="l">Notes</div></div><div class="stat-box"><div class="v">${studentsOf(cid).length}</div><div class="l">Élèves</div></div></div>
    <div class="feature-grid"><button class="feature-btn" id="bulkGradeBtn">📝 Nouvelle évaluation<small>Matière, coefficient et saisie collective</small></button><button class="feature-btn" id="manageSubjectsBtn">📚 Matières<small>Ajouter et pondérer les matières</small></button></div>
    <div class="grade-toolbar"><span class="muted">Coefficient intégré · tapote une note pour la modifier</span><button class="btn btn-sm btn-ghost" id="gradeExportCsv">CSV</button></div>
    ${grades.length?`<div class="card">${grades.slice(0,40).map(g=>{const s=state.students.find(x=>x.id===g.studentId);return `<div class="row clickable" data-edit-grade="${g.id}"><div class="avatar">${s?initials(s.name):'?'}</div><div class="row-main"><div class="row-title">${escapeHtml(s?.name||'Élève supprimé')}</div><div class="row-sub">${escapeHtml(subjectOf(g.subjectId)?.name||'Matière générale')} · ${escapeHtml(g.label)} · ${fmtDateShort(g.date)} · note coef. ${Number(g.coef)||1}</div></div><div class="row-end"><span class="grade-pill ${gradeClass(g.value)}">${g.value}/20</span></div></div>`;}).join('')}</div>`:`<div class="empty"><p>Aucune note pour ${escapeHtml(cls.name)}.</p><button class="btn btn-primary empty-action" id="emptyAddGrade">Ajouter une note</button></div>`}`:'<div class="empty"><p>Crée d’abord une classe.</p></div>'}`;
  document.querySelectorAll('#gradeClassTabs .day-tab').forEach(b=>b.onclick=()=>{state.gradesClassFilter=b.dataset.cls;renderGrades();});
  document.querySelectorAll('[data-edit-grade]').forEach(b=>b.onclick=()=>openGradeForm(null,null,state.grades.find(g=>g.id===b.dataset.editGrade)));
  document.getElementById('emptyAddGrade')?.addEventListener('click',()=>openGradeForm(cid));
  document.getElementById('gradeExportCsv')?.addEventListener('click',()=>exportGradesCSV(cid));
  document.getElementById('bulkGradeBtn')?.addEventListener('click',()=>openBulkGradeForm(cid));
  document.getElementById('manageSubjectsBtn')?.addEventListener('click',()=>openSubjectManager(cid));
}
async function ensureSubjectForClass(classId){
  let subject=state.subjects.find(s=>s.classId===classId);
  if(!subject){subject={id:uid(),classId,name:getClass(classId)?.subject||'Matière générale',coefficient:1};await dbPut('subjects',subject);state.subjects.push(subject);}
  return subject;
}
async function openGradeForm(presetClassId,presetStudentId,existing){
  const edit=!!existing,cid=existing?.classId||presetClassId||state.gradesClassFilter||state.classes[0]?.id;
  if(!cid){showToast('Crée d’abord une classe','info');return;}
  await ensureSubjectForClass(cid);
  openSheet(`<div class="sheet-header"><h3>${edit?'Modifier la note':'Nouvelle note'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="field"><label>Classe</label><select id="fGradeClass" ${edit?'disabled':''}>${state.classes.map(c=>`<option value="${c.id}" ${cid===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Matière</label><select id="fGradeSubject" ${edit?'disabled':''}></select><small class="muted">Le coefficient de la matière est géré dans « Matières ».</small></div>
    <div class="field"><label>Élève</label><select id="fGradeStudent" ${edit?'disabled':''}></select></div>
    <div class="field"><label>Intitulé de l’évaluation</label><input id="fGradeLabel" value="${edit?escapeHtml(existing.label):''}" placeholder="Ex. Interro chapitre 3"></div>
    <div class="field-row"><div class="field"><label>Note /20</label><input type="number" id="fGradeValue" min="0" max="20" step="0.25" value="${edit?existing.value:''}" placeholder="14.5"></div><div class="field"><label>Coefficient</label><input type="number" id="fGradeCoef" min="0.25" max="20" step="0.25" value="${edit?(existing.coef||1):1}"></div></div>
    <div class="field"><label>Date</label><input type="date" id="fGradeDate" value="${edit?existing.date:todayISO()}"></div>
    <button class="btn btn-primary btn-block" id="saveGradeBtn">${edit?'Enregistrer':'Ajouter la note'}</button>${edit?'<button class="btn btn-danger-outline btn-block" id="deleteGradeBtn">Supprimer la note</button>':''}`);
  function fill(){const id=document.getElementById('fGradeClass').value;const subjects=state.subjects.filter(s=>s.classId===id);document.getElementById('fGradeSubject').innerHTML=subjects.map(s=>`<option value="${s.id}" ${(existing?.subjectId||subjects[0]?.id)===s.id?'selected':''}>${escapeHtml(s.name)} · coef. ${Number(s.coefficient)||1}</option>`).join('')||'<option value="">Aucune matière</option>';document.getElementById('fGradeStudent').innerHTML=studentsOf(id).map(s=>`<option value="${s.id}" ${(existing?.studentId||presetStudentId)===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')||'<option value="">Aucun élève</option>';}
  fill();document.getElementById('fGradeClass').onchange=fill;
  const gradeFields=['fGradeSubject','fGradeStudent','fGradeLabel','fGradeValue','fGradeCoef','fGradeDate'].map(id=>document.getElementById(id)).filter(Boolean);
  gradeFields.forEach((field,index)=>field.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();if(e.ctrlKey||e.metaKey){document.getElementById('saveGradeBtn').click();return;}gradeFields[index+1]?.focus()||document.getElementById('saveGradeBtn').focus();}));
  document.getElementById('saveGradeBtn').onclick=async()=>{const classId=document.getElementById('fGradeClass').value,subjectId=document.getElementById('fGradeSubject').value,studentId=document.getElementById('fGradeStudent').value,label=document.getElementById('fGradeLabel').value.trim(),value=parseFloat(document.getElementById('fGradeValue').value),coef=parseFloat(document.getElementById('fGradeCoef').value)||1,date=document.getElementById('fGradeDate').value;if(!subjectId||!studentId||!label||Number.isNaN(value)||value<0||value>20||coef<=0||!date){showToast('Vérifie matière, note et coefficient','info');return;}await dbPut('grades',{id:edit?existing.id:uid(),classId,subjectId,studentId,label,value,coef,date});await loadAll();state.gradesClassFilter=classId;closeSheet();renderAll();showToast(edit?'Note modifiée':'Note enregistrée');};
  if(edit)document.getElementById('deleteGradeBtn').onclick=async()=>{if(!confirm('Supprimer cette note ?'))return;await dbDelete('grades',existing.id);await loadAll();closeSheet();renderAll();showToast('Note supprimée');};
}
function openSubjectManager(classId){
  const cls=getClass(classId), subjects=state.subjects.filter(s=>s.classId===classId);
  openSheet(`<div class="sheet-header"><div><h3>Matières · ${escapeHtml(cls?.name||'')}</h3><p class="sheet-kicker">Le coefficient pondère la moyenne de la matière dans la classe.</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="card" id="subjectRows">${subjects.map(s=>`<div class="row"><div class="row-main"><div class="row-title">${escapeHtml(s.name)}</div><div class="row-sub">Coefficient général : ${Number(s.coefficient)||1}</div></div><button class="btn btn-sm btn-ghost" data-edit-subject="${s.id}">Modifier</button></div>`).join('')||'<p class="muted">Aucune matière.</p>'}</div><button class="btn btn-primary btn-block" id="addSubjectBtn">+ Ajouter une matière</button>`);
  document.querySelectorAll('[data-edit-subject]').forEach(b=>b.onclick=()=>openSubjectForm(state.subjects.find(s=>s.id===b.dataset.editSubject)));
  document.getElementById('addSubjectBtn').onclick=()=>openSubjectForm(null);
  function openSubjectForm(existing){
    const edit=!!existing;
    openSheet(`<div class="sheet-header"><h3>${edit?'Modifier la matière':'Nouvelle matière'}</h3><button class="btn-icon" onclick="openSubjectManager('${classId}')" aria-label="Retour">←</button></div><div class="field"><label>Nom de la matière</label><input id="fSubjectName" value="${edit?escapeHtml(existing.name):''}" placeholder="Ex. Mathématiques"></div><div class="field"><label>Coefficient général</label><input id="fSubjectCoef" type="number" min="0.01" max="100" step="0.25" value="${edit?(existing.coefficient||1):1}"></div><button class="btn btn-primary btn-block" id="saveSubjectBtn">${edit?'Enregistrer':'Ajouter la matière'}</button>${edit?'<button class="btn btn-danger-outline btn-block" id="deleteSubjectBtn">Supprimer la matière</button>':''}`);
    document.getElementById('saveSubjectBtn').onclick=async()=>{const name=document.getElementById('fSubjectName').value.trim(),coefficient=parseFloat(document.getElementById('fSubjectCoef').value);if(!name||!Number.isFinite(coefficient)||coefficient<=0){showToast('Nom et coefficient positif requis','info');return;}await dbPut('subjects',{id:edit?existing.id:uid(),classId,name,coefficient});await loadAll();openSubjectManager(classId);};
    document.getElementById('deleteSubjectBtn')?.addEventListener('click',async()=>{if(subjects.length<=1){showToast('Une classe doit garder au moins une matière','info');return;}if(!confirm('Supprimer cette matière ? Les notes seront conservées dans la première matière.'))return;const fallback=state.subjects.find(s=>s.classId===classId&&s.id!==existing.id);for(const g of state.grades.filter(g=>g.subjectId===existing.id)){g.subjectId=fallback.id;await dbPut('grades',g);}await dbDelete('subjects',existing.id);await loadAll();openSubjectManager(classId);});
  }
}
function openBulkGradeForm(classId){
  const students=studentsOf(classId); if(!students.length){showToast('Cette classe n’a aucun élève','info');return;}
  const subjects=state.subjects.filter(s=>s.classId===classId);
  openSheet(`<div class="sheet-header"><div><h3>Saisie collective</h3><p class="sheet-kicker">${escapeHtml(classLabel(classId))}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="field"><label>Matière</label><select id="bulkSubject">${subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)} · coef. ${Number(s.coefficient)||1}</option>`).join('')}</select></div>
    <div class="field"><label>Intitulé de l’évaluation</label><input id="bulkLabel" placeholder="Ex. Devoir surveillé 1"></div>
    <div class="field-row"><div class="field"><label>Coefficient</label><input id="bulkCoef" type="number" min="0.25" step="0.25" value="1"></div><div class="field"><label>Date</label><input id="bulkDate" type="date" value="${todayISO()}"></div></div>
    <div class="bulk-table">${students.map(s=>`<div class="bulk-row"><div>${escapeHtml(s.name)}</div><input class="bulk-value" data-sid="${s.id}" type="number" min="0" max="20" step="0.25" placeholder="/20"></div>`).join('')}</div>
    <button class="btn btn-primary btn-block" id="saveBulkGrades" style="margin-top:12px">Enregistrer les notes saisies</button>`);
  document.getElementById('saveBulkGrades').onclick=async()=>{const subjectId=document.getElementById('bulkSubject').value,label=document.getElementById('bulkLabel').value.trim(),coef=parseFloat(document.getElementById('bulkCoef').value)||1,date=document.getElementById('bulkDate').value,inputs=[...document.querySelectorAll('.bulk-value')];if(!subjectId||!label||!date||coef<=0){showToast('Matière, évaluation et coefficient requis','info');return;}let n=0;for(const i of inputs){if(i.value==='')continue;const v=parseFloat(i.value);if(v>=0&&v<=20){await dbPut('grades',{id:uid(),classId,subjectId,studentId:i.dataset.sid,label,value:v,coef,date});n++;}}await loadAll();state.gradesClassFilter=classId;closeSheet();renderAll();showToast(`${n} note(s) enregistrée(s)`);};
  document.querySelectorAll('.bulk-value').forEach((input,index,all)=>input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();all[index+1]?.focus()||document.getElementById('saveBulkGrades').focus();}}));
}
function openClassGradeStats(classId){
  const grades=state.grades.filter(g=>g.classId===classId),students=studentsOf(classId), bins=[0,0,0,0,0], distribution=[0,0,0,0,0];
  grades.forEach(g=>{const i=Math.min(4,Math.floor(Number(g.value)/4));bins[i]++;});
  const rows=students.map(s=>({s,a:weightedSubjectAvg(grades.filter(g=>g.studentId===s.id))})).filter(x=>x.a!==null).sort((a,b)=>b.a-a.a);
  const max=Math.max(1,...bins);
  openSheet(`<div class="sheet-header"><div><h3>Analyse · ${escapeHtml(classLabel(classId))}</h3><p class="sheet-kicker">${grades.length} note(s)</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="card"><div class="bar-chart">${bins.map((n,i)=>`<div class="bar" style="height:${Math.max(5,n/max*100)}%"><span>${n}</span><small>${i*4}–${i*4+3.99}</small></div>`).join('')}</div></div>
    <h2 class="section-title">Moyennes par élève</h2><div class="card">${rows.slice(0,15).map((x,i)=>`<div class="rank-row"><div class="rank-num">${i+1}</div><div class="rank-name">${escapeHtml(x.s.name)}</div><span class="grade-pill ${gradeClass(x.a)}">${x.a.toFixed(1)}</span></div>`).join('')||'<p class="muted">Pas assez de données.</p>'}</div>`);
}

/* ---------- Statistics dashboard ---------- */
function ultraReviewRisks(){
  return state.students.map(s=>{const avgStudent=weightedAvg(state.grades.filter(g=>g.studentId===s.id)),abs=state.attendance.filter(a=>a.studentId===s.id&&a.status==='a').length,late=state.homework.filter(h=>h.studentId===s.id&&!h.done&&daysUntil(h.dueDate)<0).length;const score=(avgStudent!==null&&avgStudent<10?2:0)+(abs>=3?2:0)+(late>=2?1:0);return {s,avgStudent,abs,late,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
}
function renderStats(){
  const el=document.getElementById('view-stats'), total=state.students.length, classes=state.classes.length, grades=state.grades, avgAll=weightedAvg(grades), at=attendanceStats(), pending=state.homework.filter(h=>!h.done).length;
  const classCards=state.classes.map(c=>{const gs=grades.filter(g=>g.classId===c.id),a=weightedAvg(gs),st=studentsOf(c.id),att=attendanceStats(c.id);return {c,a,st,att,gs};}).sort((a,b)=>(b.a??-1)-(a.a??-1));
  const max=Math.max(1,...classCards.map(x=>x.a||0));
  el.innerHTML=`<div class="settings-brand"><div class="logo"><span style="font-size:24px">◒</span></div><div><strong>UltraReview</strong><small>Revue pédagogique et signaux utiles</small></div></div><div class="insight-grid"><div class="insight-card"><div class="big">${total}</div><div class="label">Élèves</div></div><div class="insight-card"><div class="big">${classes}</div><div class="label">Classes</div></div><div class="insight-card"><div class="big">${avgAll!==null?avgAll.toFixed(1):'—'}</div><div class="label">Moyenne pondérée</div></div><div class="insight-card"><div class="big">${at.rate!==null?Math.round(at.rate)+'%':'—'}</div><div class="label">Présence globale</div></div></div>
    <div class="feature-grid"><button class="feature-btn" id="printReportBtn">📄 Rapport de classe<small>Imprimer / PDF</small></button><button class="feature-btn" id="importStudentsBtn">📥 Importer élèves<small>CSV / Excel export</small></button></div>
    <h2 class="section-title">Vue par classe</h2>
    ${classCards.length?`<div class="card">${classCards.map(x=>`<div class="rank-row"><div class="avatar">${escapeHtml((x.c.name||'?').slice(0,2).toUpperCase())}</div><div class="row-main"><div class="rank-name">${escapeHtml(x.c.name)}</div><div class="muted">${x.st.length} élève(s) · ${x.att.rate!==null?Math.round(x.att.rate)+'% présence':'pas d’appel'}</div><div class="progress"><i style="width:${Math.min(100,((x.a||0)/20)*100)}%"></i></div></div><span class="grade-pill ${x.a!==null?gradeClass(x.a):'grade-mid'}">${x.a!==null?x.a.toFixed(1):'—'}</span></div>`).join('')}</div>`:'<div class="empty"><p>Crée une classe pour commencer.</p></div>'}
    <h2 class="section-title">Élèves à accompagner</h2>${ultraReviewRisks().length?`<div class="card">${ultraReviewRisks().map(x=>`<div class="rank-row"><div class="avatar" style="background:var(--terre)">${escapeHtml(initials(x.s.name))}</div><div class="row-main"><div class="rank-name">${escapeHtml(x.s.name)}</div><div class="muted">${x.avgStudent!==null?'Moyenne '+x.avgStudent.toFixed(1):'Pas de moyenne'} · ${x.abs} absence(s) · ${x.late} devoir(s) en retard</div></div><span class="chip chip-rouge">À suivre</span></div>`).join('')}</div>`:'<div class="status-banner success">Aucun profil prioritaire détecté.</div>'}
    <h2 class="section-title">Répartition des notes</h2>
    <div class="card"><div class="bar-chart">${[0,1,2,3,4].map(i=>{const n=grades.filter(g=>{const v=Number(g.value);return v>=i*4&&v<(i===4?20.01:(i+1)*4);}).length;const m=Math.max(1,...[0,1,2,3,4].map(j=>grades.filter(g=>{const v=Number(g.value);return v>=j*4&&v<(j===4?20.01:(j+1)*4);}).length));return `<div class="bar" style="height:${Math.max(5,n/m*100)}%"><span>${n}</span><small>${i*4}–${i*4+3.99}</small></div>`;}).join('')}</div></div>
    <h2 class="section-title">À surveiller</h2>${computeSuggestions().map(s=>`<div class="suggestion">${suggestionIcon(s.icon)}<div class="suggestion-text">${s.text}</div></div>`).join('')||'<div class="status-banner success">Aucun signal particulier détecté.</div>'}
    <p class="muted" style="margin-top:14px">${pending} devoir(s) encore à faire · ${grades.length} note(s) enregistrée(s).</p>`;
  document.getElementById('printReportBtn').onclick=()=>openReportChooser();
  document.getElementById('importStudentsBtn').onclick=()=>document.getElementById('studentCsvInput').click();
}
function openReportChooser(){
  openSheet(`<div class="sheet-header"><h3>Rapports professionnels</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><p class="muted">Choisis une classe et un rapport. Le document est prêt pour l’impression ou l’export PDF.</p><div class="field"><label>Classe</label><select id="reportClassSelect">${state.classes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="feature-grid"><button class="feature-btn" data-report-type="class">📄 Rapport de classe<small>Synthèse pédagogique</small></button><button class="feature-btn" data-report-type="bulletin">📝 Bulletin de notes<small>Moyennes et appréciations</small></button><button class="feature-btn" data-report-type="attendance">✓ Rapport de présence<small>Présences, retards, absences</small></button><button class="feature-btn" data-report-type="homework">📚 Rapport de devoirs<small>Échéances et retards</small></button></div>`);
  document.querySelectorAll('[data-report-type]').forEach(b=>b.onclick=()=>printProfessionalReport(document.getElementById('reportClassSelect').value,b.dataset.reportType));
}
function professionalAppreciation(value){return value===null?'Non évalué':value>=16?'Très bon travail':value>=12?'Résultats satisfaisants':value>=10?'Ensemble correct':'Des efforts sont nécessaires';}
function printProfessionalReport(classId,type='class'){
  const c=getClass(classId),students=studentsOf(classId),grades=state.grades.filter(g=>g.classId===classId),att=attendanceStats(classId),homework=state.homework.filter(h=>h.classId===classId),rows=students.map(s=>{const a=weightedAvg(grades.filter(g=>g.studentId===s.id)),aa=state.attendance.filter(x=>x.studentId===s.id),abs=aa.filter(x=>x.status==='a').length,ret=aa.filter(x=>x.status==='r').length,pre=aa.filter(x=>x.status==='p').length;return {s,a,abs,ret,pre};});
  const titles={class:'Rapport pédagogique de classe',bulletin:'Bulletin de notes',attendance:'Rapport de présence',homework:'Rapport des devoirs'},title=titles[type]||titles.class;
  let headers='',body='';
  if(type==='bulletin'){headers='<th>Élève</th><th>Moyenne /20</th><th>Évaluations</th><th>Appréciation</th>';body=rows.map(r=>`<tr><td>${escapeHtml(r.s.name)}</td><td>${r.a!==null?r.a.toFixed(2):'—'}</td><td>${grades.filter(g=>g.studentId===r.s.id).length}</td><td>${professionalAppreciation(r.a)}</td></tr>`).join('');}
  else if(type==='attendance'){headers='<th>Élève</th><th>Présences</th><th>Retards</th><th>Absences</th>';body=rows.map(r=>`<tr><td>${escapeHtml(r.s.name)}</td><td>${r.pre}</td><td>${r.ret}</td><td>${r.abs}</td></tr>`).join('');}
  else if(type==='homework'){headers='<th>Devoir</th><th>Échéance</th><th>Statut</th>';body=homework.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(h=>`<tr><td>${escapeHtml(h.title)}</td><td>${fmtDateShort(h.dueDate)}</td><td>${h.done?'Terminé':daysUntil(h.dueDate)<0?'En retard':'À faire'}</td></tr>`).join('');}
  else{headers='<th>Élève</th><th>Moyenne</th><th>Absences</th><th>Appréciation</th>';body=rows.map(r=>`<tr><td>${escapeHtml(r.s.name)}</td><td>${r.a!==null?r.a.toFixed(2):'—'}</td><td>${r.abs}</td><td>${professionalAppreciation(r.a)}</td></tr>`).join('');}
  let root=document.getElementById('printRoot');if(!root){root=document.createElement('div');root.id='printRoot';document.body.appendChild(root);}root.innerHTML=`<div class="print-report"><h1>${escapeHtml(getAppName())}</h1><h2>${escapeHtml(title)}</h2><p><b>${escapeHtml(c?.name||'Classe')}</b> · ${escapeHtml(c?.subject||'')} · ${fmtDateLong(todayISO())}</p><div class="print-summary"><b>Élèves : ${students.length}</b><b>Moyenne : ${weightedAvg(grades)?.toFixed(1)||'—'}/20</b><b>Présence : ${att.rate!==null?Math.round(att.rate)+'%':'—'}</b></div><table><thead><tr>${headers}</tr></thead><tbody>${body||`<tr><td colspan="4">Aucune donnée disponible.</td></tr>`}</tbody></table><p class="print-note">Document professionnel généré localement par Classe · UltraReview. Les données restent sur cet appareil.</p></div>`;closeSheet();setTimeout(()=>window.print(),80);
}
function printClassReport(classId){
  const c=getClass(classId),students=studentsOf(classId),gs=state.grades.filter(g=>g.classId===classId),att=attendanceStats(classId), rows=students.map(s=>({s,a:weightedAvg(gs.filter(g=>g.studentId===s.id)),abs:state.attendance.filter(x=>x.studentId===s.id&&x.classId===classId&&x.status==='a').length})).sort((a,b)=>a.s.name.localeCompare(b.s.name,'fr'));
  let root=document.getElementById('printRoot'); if(!root){root=document.createElement('div');root.id='printRoot';document.body.appendChild(root);}
  root.innerHTML=`<div class="print-report"><h1>${escapeHtml(getAppName())}</h1><h2>${escapeHtml(c?.name||'Classe')} · ${escapeHtml(c?.subject||'')}</h2><p>Rapport du ${fmtDateLong(todayISO())}</p><div class="print-summary"><b>Moyenne : ${weightedAvg(gs)?.toFixed(1)||'—'}/20</b><b>Présence : ${att.rate!==null?Math.round(att.rate)+'%':'—'}</b><b>Élèves : ${students.length}</b></div><table><thead><tr><th>Élève</th><th>Moyenne</th><th>Absences</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.s.name)}</td><td>${r.a!==null?r.a.toFixed(2):'—'}</td><td>${r.abs}</td></tr>`).join('')}</tbody></table><p class="print-note">Document généré localement par Classe. Les données restent sur cet appareil.</p></div>`;
  closeSheet();setTimeout(()=>window.print(),80);
}

/* ---------- Calendar + session journal ---------- */
let sessionTimer=null;
function sessionElapsed(startedAt){
  const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
  const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
  return `${h?String(h).padStart(2,'0')+':':''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function refreshSessionTimer(session){
  clearInterval(sessionTimer); const out=document.getElementById('sessionTimer'); if(!out||!session?.startedAt)return;
  const tick=()=>{out.textContent=session.endedAt?`Durée : ${sessionElapsed(session.startedAt)}`:`Temps écoulé : ${sessionElapsed(session.startedAt)}`;}; tick(); if(!session.endedAt)sessionTimer=setInterval(tick,1000);
}
async function toggleSessionMode(slot){
  let session=await getOrCreateSession(todayISO(),slot.classId,slot.id);
  if(session.endedAt){showToast('Cette séance est déjà terminée','info');return;}
  if(!session.startedAt){session.startedAt=Date.now();session.status='in_progress';await dbPut('sessions',session);await loadAll();document.getElementById('sessionModeBtn').textContent='■ Terminer la séance';document.getElementById('sessionModeBtn').classList.add('btn-danger');refreshSessionTimer(session);showToast('Séance démarrée');}
  else{session.endedAt=Date.now();session.status='completed';await dbPut('sessions',session);await loadAll();clearInterval(sessionTimer);document.getElementById('sessionModeBtn').textContent='✓ Séance terminée';document.getElementById('sessionModeBtn').disabled=true;refreshSessionTimer(session);showToast('Séance terminée — pense à enregistrer le résumé');}
}
function openSessionDetail(scheduleId){
  const slot=state.schedule.find(s=>s.id===scheduleId);if(!slot)return;const c=getClass(slot.classId),session=findSession(todayISO(),slot.classId,slot.id),j=session?.journal||{};
  openSheet(`<div class="sheet-header"><div><h3>${escapeHtml(c?.name||'Séance')}</h3><p class="sheet-kicker">${escapeHtml(slot.topic||'Sans thème')} · ${slot.start}–${slot.end}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="session-mode-card"><div><span class="eyebrow">Mode séance</span><strong id="sessionTimer">${session?.startedAt?`Temps écoulé : ${sessionElapsed(session.startedAt)}`:'Prêt à démarrer'}</strong></div><button class="btn btn-primary btn-sm" id="sessionModeBtn">${session?.endedAt?'✓ Séance terminée':session?.startedAt?'■ Terminer la séance':'▶ Démarrer'}</button></div>
    <div class="feature-grid"><button class="feature-btn" id="sessionCallBtn">✓ Appel<small>Présences du jour</small></button><button class="feature-btn" id="sessionEditBtn">⚙ Modifier<small>Horaire et thème</small></button></div>
    <h2 class="section-title">Préparer / journaliser</h2>
    <div class="field"><label>Objectifs</label><textarea id="jObjectives" placeholder="Ce que les élèves doivent savoir faire...">${escapeHtml(j.objectives||'')}</textarea></div>
    <div class="field"><label>Activités / déroulé</label><textarea id="jActivities" placeholder="Introduction, expérience, exercices...">${escapeHtml(j.activities||'')}</textarea></div>
    <div class="field"><label>Matériel</label><input id="jMaterial" value="${escapeHtml(j.material||'')}" placeholder="Ex. dynamomètre, règle"></div>
    <div class="field"><label>À reprendre / notes</label><textarea id="jNotes" placeholder="Ce qui a été fait, difficultés, suite...">${escapeHtml(j.notes||'')}</textarea></div>
    <button class="btn btn-primary btn-block" id="saveJournalBtn">Enregistrer le journal</button>`);
  document.getElementById('sessionModeBtn').onclick=()=>toggleSessionMode(slot);document.getElementById('sessionCallBtn').onclick=()=>openAttendanceSheet(slot.classId,slot.id);document.getElementById('sessionEditBtn').onclick=()=>openSlotForm(slot);refreshSessionTimer(session);
  document.getElementById('saveJournalBtn').onclick=async()=>{const s=await getOrCreateSession(todayISO(),slot.classId,slot.id);s.journal={objectives:document.getElementById('jObjectives').value.trim(),activities:document.getElementById('jActivities').value.trim(),material:document.getElementById('jMaterial').value.trim(),notes:document.getElementById('jNotes').value.trim()};await dbPut('sessions',s);await loadAll();closeSheet();showToast('Journal de séance enregistré');};
}
function scheduleReportRows(){
  return DAYS_ORDER.flatMap(day=>state.schedule.filter(s=>s.day===day).sort((a,b)=>a.start.localeCompare(b.start)).map(s=>({day:DAYS_FR[day][0].toUpperCase()+DAYS_FR[day].slice(1),start:s.start,end:s.end,className:classLabel(s.classId),subject:getClass(s.classId)?.subject||'',topic:s.topic||'Séance'})));
}
function scheduleReportMeta(){return {school:getSetting('report_school',''),year:getSetting('report_year','2026–2027'),teacher:getSetting('report_teacher',''),subject:getSetting('report_subject',''),level:getSetting('report_level','')}}
function reportRowsPreview(rows){return rows.map(r=>`<tr><td>${escapeHtml(r.day)}</td><td>${escapeHtml(r.start)}</td><td>${escapeHtml(r.end)}</td><td>${escapeHtml(r.className)}</td><td>${escapeHtml(r.topic)}</td></tr>`).join('')||'<tr><td colspan="5">Aucune séance programmée.</td></tr>';}
async function openScheduleReport(){
  const meta=scheduleReportMeta(),rows=scheduleReportRows();
  openSheet(`<div class="sheet-header"><div><h3>Emploi du temps PDF</h3><p class="sheet-kicker">Consultation et téléchargement du planning à venir</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <p class="muted">Ces informations apparaîtront dans l’en-tête centré et en gras du PDF.</p>
    <div class="field"><label>Établissement</label><input id="reportSchool" value="${escapeHtml(meta.school)}" placeholder="Nom de l’établissement"></div>
    <div class="field-row"><div class="field"><label>Année scolaire</label><input id="reportYear" value="${escapeHtml(meta.year)}" placeholder="2026–2027"></div><div class="field"><label>Niveau</label><input id="reportLevel" value="${escapeHtml(meta.level)}" placeholder="Ex. 2nde"></div></div>
    <div class="field-row"><div class="field"><label>Discipline</label><input id="reportSubject" value="${escapeHtml(meta.subject)}" placeholder="Ex. Physique-Chimie"></div><div class="field"><label>Chargé(e) de cours</label><input id="reportTeacher" value="${escapeHtml(meta.teacher)}" placeholder="Nom du professeur"></div></div>
    <h2 class="section-title">Aperçu du planning</h2><div class="schedule-preview"><table><thead><tr><th>Jour</th><th>Début</th><th>Fin</th><th>Classe</th><th>Cours</th></tr></thead><tbody>${reportRowsPreview(rows)}</tbody></table></div>
    <button class="btn btn-primary btn-block" id="downloadSchedulePdf">Télécharger le planning PDF</button>`);
  document.getElementById('downloadSchedulePdf').onclick=async()=>{
    const next={school:document.getElementById('reportSchool').value.trim(),year:document.getElementById('reportYear').value.trim(),level:document.getElementById('reportLevel').value.trim(),subject:document.getElementById('reportSubject').value.trim(),teacher:document.getElementById('reportTeacher').value.trim()};
    await Promise.all(Object.entries(next).map(([key,value])=>saveSetting(`report_${key}`,value)));
    if(!window.ClassSchedulePdf){showToast('Générateur PDF indisponible','info');return;}
    window.ClassSchedulePdf.generate({meta:next,rows,fileName:`emploi-du-temps-${todayISO()}.pdf`});
    showToast('Planning PDF téléchargé');
  };
}
function renderSchedule(){
  const el=document.getElementById('view-schedule'),day=state.scheduleDayIndex;
  const tabs=`<div class="calendar-head"><div class="calendar-mode"><button class="${state.scheduleView==='week'?'active':''}" id="modeWeek">Semaine</button><button class="${state.scheduleView==='month'?'active':''}" id="modeMonth">Mois</button></div><div class="calendar-actions"><button class="btn btn-sm btn-ghost" id="schedulePdfBtn">PDF</button><button class="btn btn-sm btn-ghost" id="scheduleAdd">+ Séance</button></div></div>`;
  if(state.scheduleView==='month'){
    const y=state.calendarMonth.getFullYear(),m=state.calendarMonth.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),start=(first.getDay()+6)%7,totalCells=Math.ceil((start+last.getDate())/7)*7;
    let cells='';for(let i=0;i<totalCells;i++){const n=i-start+1,d=new Date(y,m,n),inMonth=n>=1&&n<=last.getDate(),iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,hasSlot=state.schedule.some(s=>inMonth&&s.day===d.getDay()),hasHw=state.homework.some(h=>h.dueDate===iso),hasGrade=state.grades.some(g=>g.date===iso);cells+=`<button class="calendar-day ${inMonth?'':'muted'} ${iso===todayISO()?'today':''}" data-cal-date="${iso}"><strong>${inMonth?n:''}</strong><div class="calendar-dots">${hasSlot?'<i class="calendar-dot"></i>':''}${hasHw?'<i class="calendar-dot hw"></i>':''}${hasGrade?'<i class="calendar-dot grade"></i>':''}</div></button>`;}
    el.innerHTML=`${tabs}<div class="card"><div class="calendar-head"><button class="btn btn-sm btn-ghost" id="prevMonth">‹</button><div class="calendar-title">${state.calendarMonth.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</div><button class="btn btn-sm btn-ghost" id="nextMonth">›</button></div><div class="calendar-grid">${['L','M','M','J','V','S','D'].map(x=>`<div class="calendar-dow">${x}</div>`).join('')}${cells}</div><p class="muted">● cours · <span style="color:var(--ocre)">●</span> devoir · <span style="color:var(--terre)">●</span> note</p></div>`;
    document.getElementById('prevMonth').onclick=()=>{state.calendarMonth=new Date(y,m-1,1);renderSchedule();};document.getElementById('nextMonth').onclick=()=>{state.calendarMonth=new Date(y,m+1,1);renderSchedule();};document.querySelectorAll('[data-cal-date]').forEach(b=>b.onclick=()=>{const d=new Date(b.dataset.calDate+'T00:00:00');state.scheduleView='week';state.scheduleDayIndex=d.getDay()||1;renderSchedule();});
  }else{
    const slots=state.schedule.filter(s=>s.day===day).sort((a,b)=>a.start.localeCompare(b.start));
    el.innerHTML=`${tabs}<div class="day-tabs" id="dayTabs">${DAYS_ORDER.map(d=>`<button class="day-tab ${day===d?'active':''}" data-day="${d}">${DAYS_FR_SHORT[d]}</button>`).join('')}</div><div class="section-inline"><div><h2 class="section-title">${DAYS_FR[day][0].toUpperCase()+DAYS_FR[day].slice(1)}</h2><p class="muted">${slots.length} séance(s)</p></div></div>${slots.length?`<div class="card">${slots.map(s=>{const c=getClass(s.classId);return `<div class="slot clickable" data-slot="${s.id}"><div class="slot-time">${s.start}<br><span>${s.end}</span></div><div class="slot-bar"></div><div class="slot-body"><div class="cls">${escapeHtml(c?.name||'—')}</div><div class="topic">${escapeHtml(s.topic||'Sans thème')}</div></div><button class="mini-action" data-call="${s.id}" title="Faire l'appel" aria-label="Faire l'appel">✓</button></div>`;}).join('')}</div>`:`<div class="empty"><p>Aucune séance le ${DAYS_FR[day]}.</p><button class="btn btn-primary empty-action" id="emptyAddSlot">Ajouter une séance</button></div>`}`;
    document.querySelectorAll('#dayTabs .day-tab').forEach(b=>b.onclick=()=>{state.scheduleDayIndex=Number(b.dataset.day);renderSchedule();});document.querySelectorAll('[data-slot]').forEach(r=>r.onclick=()=>openSessionDetail(r.dataset.slot));document.querySelectorAll('[data-call]').forEach(b=>b.onclick=e=>{e.stopPropagation();const s=state.schedule.find(x=>x.id===b.dataset.call);openAttendanceSheet(s.classId,s.id);});document.getElementById('emptyAddSlot')?.addEventListener('click',()=>openSlotForm(null,day));
  }
  document.getElementById('modeWeek').onclick=()=>{state.scheduleView='week';renderSchedule();};document.getElementById('modeMonth').onclick=()=>{state.scheduleView='month';renderSchedule();};document.getElementById('schedulePdfBtn').onclick=openScheduleReport;document.getElementById('scheduleAdd').onclick=()=>openSlotForm(null,state.scheduleDayIndex);
}

/* ---------- CSV import ---------- */
function parseCsv(text){
  const lines=text.replace(/\r/g,'').split('\n').filter(x=>x.trim()); if(!lines.length)return [];
  const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
  return lines.map(line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===sep&&!q){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;});
}
async function importStudentsCsv(file){
  try{
    const rows=parseCsv(await file.text()); if(rows.length<2)throw new Error('vide');
    const header=rows[0].map(x=>x.toLowerCase());
    const idx=(pattern)=>header.findIndex(x=>pattern.test(x));
    const nameIdx=Math.max(0,idx(/nom|name/)),phoneIdx=idx(/tel|phone/),classIdx=idx(/classe|class/),subjectIdx=idx(/mati[eè]re|subject/),subjectCoefIdx=idx(/coefficient\s*mati[eè]re|coef.*mati[eè]re/),labelIdx=idx(/[eé]valuation|evaluation|devoir|label/),valueIdx=idx(/note|value|score/),gradeCoefIdx=idx(/coefficient\s*note|coef.*note/),dateIdx=idx(/date/);
    let added=0,gradeAdded=0;
    for(const r of rows.slice(1)){
      const name=r[nameIdx]?.trim(); if(!name)continue;
      const className=(classIdx>=0?r[classIdx]:'6e').trim()||'Classe importée';
      let cls=state.classes.find(c=>c.name.toLowerCase()===className.toLowerCase());
      if(!cls){cls={id:uid(),name:className,subject:'',color:'#1677FF'};await dbPut('classes',cls);state.classes.push(cls);}
      let student=state.students.find(s=>s.classId===cls.id&&s.name.trim().toLowerCase()===name.toLowerCase());
      if(!student){student={id:uid(),classId:cls.id,name,phone:phoneIdx>=0?(r[phoneIdx]||'').trim():'',note:'',photo:''};await dbPut('students',student);state.students.push(student);added++;}
      const subjectName=subjectIdx>=0?(r[subjectIdx]||'').trim():'';
      if(subjectName&&valueIdx>=0&&(r[valueIdx]||'').trim()!==''){
        let subject=state.subjects.find(s=>s.classId===cls.id&&s.name.toLowerCase()===subjectName.toLowerCase());
        const subjectCoefficient=parseFloat(String(subjectCoefIdx>=0?r[subjectCoefIdx]:'1').replace(',','.'))||1;
        if(!subject){subject={id:uid(),classId:cls.id,name:subjectName,coefficient:subjectCoefficient};await dbPut('subjects',subject);state.subjects.push(subject);}
        const value=parseFloat(String(r[valueIdx]).replace(',','.')),gradeCoef=parseFloat(String(gradeCoefIdx>=0?r[gradeCoefIdx]:'1').replace(',','.'))||1,date=dateIdx>=0&&r[dateIdx]?r[dateIdx].trim():todayISO(),label=labelIdx>=0&&r[labelIdx]?r[labelIdx].trim():'Évaluation importée';
        if(Number.isFinite(value)&&value>=0&&value<=20){const duplicate=state.grades.find(g=>g.studentId===student.id&&g.subjectId===subject.id&&g.label===label&&g.date===date);if(!duplicate){await dbPut('grades',{id:uid(),classId:cls.id,subjectId:subject.id,studentId:student.id,label,value,coef:gradeCoef,date});gradeAdded++;}}
      }
    }
    await loadAll();renderAll();showToast(`${added} élève(s) et ${gradeAdded} note(s) importé(s)`);
  }catch(e){console.error(e);showToast('CSV invalide ou impossible à lire','info');}
}

/* ---------- Settings: theme, notifications, PIN, CSV ---------- */
async function hashPin(pin){if(globalThis.crypto?.subtle){const data=new TextEncoder().encode(pin);const buf=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');}return btoa(unescape(encodeURIComponent(pin)));}
const PRO_DEFAULT_PASSWORD='Admin@2026';
function openProGate(){
  const configured=!!localStorage.getItem('classe_pro_password_hash');
  if(!configured){openSheet(`<div class="sheet-header"><div><h3>Activer Version Pro</h3><p class="sheet-kicker">Accès administrateur · première ouverture</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="status-banner warning">Mot de passe temporaire administrateur : <b>${PRO_DEFAULT_PASSWORD}</b></div><p class="muted">Saisis ce mot de passe, puis choisis ton mot de passe personnel. Le mot de passe temporaire ne sera pas conservé.</p><div class="field"><label>Mot de passe temporaire</label><input id="proTempPassword" type="password" autocomplete="current-password"></div><div class="field"><label>Nouveau mot de passe Pro</label><input id="proNewPassword" type="password" autocomplete="new-password" placeholder="8 caractères minimum"></div><div class="field"><label>Confirmer le nouveau mot de passe</label><input id="proConfirmPassword" type="password" autocomplete="new-password"></div><button class="btn btn-primary btn-block" id="proSetupBtn">Activer la Version Pro</button>`);document.getElementById('proSetupBtn').onclick=configureProPassword;return;}
  openSheet(`<div class="sheet-header"><div><h3>Accès Version Pro</h3><p class="sheet-kicker">Réservé à l’administrateur</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="field"><label>Mot de passe Pro</label><input id="proLoginPassword" type="password" autocomplete="current-password" placeholder="Mot de passe administrateur"></div><button class="btn btn-primary btn-block" id="proLoginBtn">Ouvrir la Version Pro</button><p id="proLoginError" class="muted" style="margin-top:10px"></p>`);document.getElementById('proLoginBtn').onclick=loginPro;
}
async function configureProPassword(){const temp=document.getElementById('proTempPassword').value,newPassword=document.getElementById('proNewPassword').value,confirmPassword=document.getElementById('proConfirmPassword').value;if(temp!==PRO_DEFAULT_PASSWORD){showToast('Mot de passe temporaire incorrect','info');return;}if(newPassword.length<8||newPassword!==confirmPassword){showToast('Choisis un mot de passe de 8 caractères minimum et confirme-le','info');return;}localStorage.setItem('classe_pro_password_hash',await hashPin(newPassword));localStorage.setItem('classe_pro_configured_at',new Date().toISOString());closeSheet();openProWorkspace();showToast('Version Pro activée');}
async function loginPro(){const input=document.getElementById('proLoginPassword'),error=document.getElementById('proLoginError');if(await hashPin(input.value)!==localStorage.getItem('classe_pro_password_hash')){error.textContent='Mot de passe incorrect.';input.select();return;}closeSheet();openProWorkspace();}
function openProPasswordSettings(){openSheet(`<div class="sheet-header"><div><h3>Mot de passe Pro</h3><p class="sheet-kicker">Modification locale sur cet appareil</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="field"><label>Mot de passe actuel</label><input id="proCurrentPassword" type="password" autocomplete="current-password"></div><div class="field"><label>Nouveau mot de passe</label><input id="proChangePassword" type="password" autocomplete="new-password" placeholder="8 caractères minimum"></div><div class="field"><label>Confirmation</label><input id="proChangeConfirm" type="password" autocomplete="new-password"></div><button class="btn btn-primary btn-block" id="proChangeBtn">Enregistrer</button>`);document.getElementById('proChangeBtn').onclick=async()=>{const current=document.getElementById('proCurrentPassword').value,next=document.getElementById('proChangePassword').value,confirmNext=document.getElementById('proChangeConfirm').value;if(await hashPin(current)!==localStorage.getItem('classe_pro_password_hash')){showToast('Mot de passe actuel incorrect','info');return;}if(next.length<8||next!==confirmNext){showToast('Confirmation invalide','info');return;}localStorage.setItem('classe_pro_password_hash',await hashPin(next));closeSheet();showToast('Mot de passe Pro modifié');};}
function openProWorkspace(){document.querySelector('.tab[data-tab="stats"]')?.click();showToast('Version Pro ouverte');}
async function setupPin(){
  const current=localStorage.getItem('classe_pin_hash');const pin=prompt(current?'Nouveau PIN (laisser vide pour annuler)':'Créer un PIN à 4–6 chiffres');if(!pin)return;if(!/^\d{4,6}$/.test(pin)){showToast('PIN de 4 à 6 chiffres requis','info');return;}localStorage.setItem('classe_pin_hash',await hashPin(pin));showToast('Verrouillage activé');}
function removePin(){localStorage.removeItem('classe_pin_hash');showToast('Verrouillage désactivé');}
async function lockApp(){const hash=localStorage.getItem('classe_pin_hash');if(!hash)return;let overlay=document.getElementById('lockScreen');if(!overlay){overlay=document.createElement('div');overlay.id='lockScreen';overlay.className='lock-screen';overlay.innerHTML=`<div class="lock-card"><div style="font-size:34px">🔐</div><h2>Classe est verrouillé</h2><p>Entre ton PIN pour accéder aux données.</p><input id="lockPin" inputmode="numeric" maxlength="6" type="password" placeholder="••••••"><button class="btn btn-primary btn-block" id="unlockBtn" style="margin-top:12px">Déverrouiller</button><div id="lockError" class="muted" style="margin-top:8px"></div></div>`;document.body.appendChild(overlay);}overlay.style.display='flex';const input=document.getElementById('lockPin');input.value='';input.focus();const unlock=async()=>{if(await hashPin(input.value)===hash){overlay.style.display='none';input.value='';}else document.getElementById('lockError').textContent='PIN incorrect.';};document.getElementById('unlockBtn').onclick=unlock;input.onkeydown=e=>{if(e.key==='Enter')unlock();};}
/* ---------- Navigation / app bootstrap enhancements ---------- */
function renderTopbar(){
  const el=document.getElementById('topbarTitle'),sub=document.getElementById('topbarSub'),ey=document.getElementById('topbarEyebrow');
  ey.textContent=getAppName();
  const globalSearch=document.getElementById('globalSearch'); if(globalSearch) globalSearch.value=state.studentsSearch||'';
  const titles={today:"Aujourd'hui",students:'Élèves',schedule:'Planning',homework:'Devoirs',grades:'Notes',stats:'Statistiques'};el.textContent=titles[state.currentTab]||'Classe';sub.textContent=state.currentTab==='today'?fmtDateLong(todayISO()):'';
}
function renderAll(){renderTopbar();renderToday();renderStudents();renderSchedule();renderHomework();renderGrades();renderStats();updateFab();}
function setupTabs(){
  document.addEventListener('click',e=>{
    const control=e.target.closest('button,[role="button"],.tab,.side-link');
    if(!control||control.disabled||control.id==='uiSoundsBtn')return;
    const text=(control.textContent||'').toLowerCase();
    const type=/enregistr|activer|valider|confirmer|terminer|export|import|sauvegarder|déverrouiller|ouvrir/.test(text)?'success':/supprimer|effacer|refus|erreur|désactiver/.test(text)?'error':'click';
    playUiSound(type);
  },{passive:true});
  document.querySelectorAll('.tab').forEach(tab=>tab.onclick=()=>{haptic();document.body.classList.remove('sidebar-open');
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!==`view-${tab.dataset.tab}`));
    state.currentTab=tab.dataset.tab;
    renderTopbar(); updateFab(); window.scrollTo(0,0);
  });
  document.getElementById('topbarSettings').onclick=()=>{haptic();openSettings();};
  document.querySelectorAll('.side-link').forEach(link=>link.onclick=()=>{haptic();document.body.classList.remove('sidebar-open');const action=link.dataset.sideAction;if(action==='classes')openClassManager();else if(action==='stats')document.querySelector('.tab[data-tab="stats"]')?.click();else if(action==='audit')openLocalAudit();else if(action==='reports')openReportChooser();else if(action==='settings'||action==='import')openSettings();else if(action==='backup')exportData();else if(action==='help')openSheet(`<div class="sheet-header"><div><h3>Aide &amp; Support</h3><p class="sheet-kicker">Classe · Gestion de classe</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="note-card"><b>Besoin d’aide ?</b><p>Utilise la recherche, le menu latéral et les raccourcis du dashboard pour accéder rapidement aux classes, élèves, devoirs et notes.</p><p class="muted">Les données restent enregistrées localement sur cet appareil.</p></div>`);else if(action==='attendance'){document.querySelector('.tab[data-tab="today"]')?.click();setTimeout(()=>openAttendanceSheet(state.classes[0]?.id),0);}});
  document.querySelector('.pro-button')?.addEventListener('click',()=>{haptic();openProGate();});
  document.getElementById('sidebarToggle')?.addEventListener('click',()=>{haptic();const touchDevice=window.matchMedia('(pointer: coarse)').matches||window.innerWidth<1000;if(touchDevice)document.body.classList.toggle('sidebar-open');else document.body.classList.toggle('sidebar-collapsed');});
  document.addEventListener('click',e=>{if(!document.body.classList.contains('sidebar-open'))return;if(e.target.closest('.tabbar')||e.target.closest('#sidebarToggle'))return;document.body.classList.remove('sidebar-open');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('sidebar-open');});
  document.getElementById('globalSearch')?.addEventListener('input',e=>{state.studentsSearch=e.target.value.trim();const tab=document.querySelector('.tab[data-tab="students"]');if(state.currentTab!=='students'){tab?.click();}else renderStudents();});
  document.getElementById('topbarInsights').onclick=()=>{haptic();
    const tab=document.querySelector('.tab[data-tab="stats"]');
    if(tab) document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!=='view-stats'));
    state.currentTab='stats'; renderTopbar(); updateFab(); renderStats(); window.scrollTo(0,0);
  };
  document.getElementById('importFileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importData(f);e.target.value='';});
  document.getElementById('studentCsvInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importStudentsCsv(f);e.target.value='';});
}

function openHashRoute(){
  const key=location.hash.replace('#','');
  const allowed=['today','students','schedule','homework','grades','stats'];
  if(!allowed.includes(key)) return;
  const tab=document.querySelector(`.tab[data-tab="${key}"]`);
  if(key==='stats'){ document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!=='view-stats')); document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); state.currentTab='stats'; renderTopbar(); renderStats(); return; }
  if(tab){ tab.click(); }
}

function updateFab(){
  const fab=document.getElementById('fab');
  const actions={today:null,students:()=>openStudentForm(),schedule:()=>openSlotForm(null,state.scheduleDayIndex),homework:()=>openHomeworkForm(),grades:()=>openGradeForm(),stats:null};
  if(actions[state.currentTab]){fab.classList.remove('hidden');fab.onclick=actions[state.currentTab];}
  else{fab.classList.add('hidden');fab.onclick=null;}
}
function applyTheme(){if(localStorage.getItem('classe_theme')==='dark')document.documentElement.classList.add('dark');}
async function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  try{
    const marker='classe_functional_reset_4921';
    if(localStorage.getItem(marker)!=='1'){
      const registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg=>reg.unregister()));
      if('caches' in window){ const keys=await caches.keys(); await Promise.all(keys.map(key=>caches.delete(key))); }
      localStorage.setItem(marker,'1');
    }
    const registration=await navigator.serviceWorker.register('./sw.js?v=4921',{updateViaCache:'none'});
    await registration.update();
  }catch(e){ console.warn('SW:',e); }
}
async function enableNotifications(){
  try{
    if(window.ClassNativeNotifications?.available){
      const permission=await window.ClassNativeNotifications.requestPermission();
      if(permission?.display!=='granted'){showToast('Permission de notification refusée dans Android','info');return;}
      localStorage.setItem('classe_notifications','1');
      await syncNativeNotifications();
      showToast('Notifications 24/24 activées');
      return;
    }
    if(!('Notification'in window)){showToast('Notifications non disponibles sur cet appareil','info');return;}
    const p=await Notification.requestPermission();
    if(p==='granted'){localStorage.setItem('classe_notifications','1');showToast('Notifications activées lorsque l’application est ouverte');}
    else showToast('Permission refusée','info');
  }catch(e){console.error('Notification permission:',e);showToast('Impossible d’activer les notifications','info');}
}
async function syncNativeNotifications(){
  const bridge=window.ClassNativeNotifications;
  if(!bridge?.available||localStorage.getItem('classe_notifications')!=='1')return;
  const oldIds=JSON.parse(localStorage.getItem('classe_native_notification_ids')||'[]');
  if(oldIds.length) await bridge.cancel(oldIds.map(Number)).catch(e=>console.warn('Cancel notifications:',e));
  const now=new Date(), notifications=[], start=new Date(now); start.setHours(0,0,0,0);
  for(let offset=0;offset<60;offset++){
    const date=new Date(start); date.setDate(start.getDate()+offset);
    const dateIso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    state.schedule.filter(slot=>slot.day===date.getDay()).forEach(slot=>{
      const [hours,minutes]=String(slot.start||'').split(':').map(Number);
      if(Number.isNaN(hours)||Number.isNaN(minutes))return;
      const at=new Date(date); at.setHours(hours,minutes,0,0);
      const reminders=[{minutes:120,label:'dans 2 heures'},{minutes:30,label:'dans 30 minutes'}];
      reminders.forEach(reminder=>{
        const reminderAt=new Date(at.getTime()-reminder.minutes*60000);
        if(reminderAt<=new Date(Date.now()+30000))return;
        const id=700000+notifications.length+offset*1000;
        notifications.push({id,title:`Cours ${reminder.label} · ${classLabel(slot.classId)}`,body:`${slot.topic||'Séance'} · ${slot.start}–${slot.end}`,schedule:{at:reminderAt,allowWhileIdle:true},channelId:'classe-cours',extra:{classId:slot.classId,scheduleId:slot.id,date:dateIso,reminder:reminder.minutes}});
      });
    });
  }
  if(notifications.length) await bridge.schedule(notifications);
  localStorage.setItem('classe_native_notification_ids',JSON.stringify(notifications.map(n=>n.id)));
}
function startNotificationLoop(){
  if(window.ClassNativeNotifications?.available){
    if(localStorage.getItem('classe_notifications')==='1')syncNativeNotifications().catch(e=>console.warn('Native notifications:',e));
    return;
  }
  setInterval(()=>{if(localStorage.getItem('classe_notifications')!=='1'||!('Notification'in window)||Notification.permission!=='granted')return;const n=nextSlot();if(!n)return;const now=new Date(),[h,m]=n.start.split(':').map(Number),target=new Date(now);target.setHours(h,m,0,0);const diff=target-now;if(diff>0&&diff<=31*60*1000){const key=`notif_${todayISO()}_${n.id}`;if(!localStorage.getItem(key)){new Notification(`Cours dans ${Math.ceil(diff/60000)} min`,{body:`${classLabel(n.classId)} · ${n.topic||'Séance'} · ${n.start}–${n.end}`});localStorage.setItem(key,'1');}}},60000);
}

applyTheme();
if(document.getElementById('printRoot')===null){const pr=document.createElement('div');pr.id='printRoot';document.body.appendChild(pr);}

// Bootstrap après toutes les définitions v3 : évite que des gestionnaires soient remplacés ou que l'état avancé soit encore absent.
(async function init(){
  try{
    await openDB();
    await loadAll();
    await migrateLegacySubjects();
    await migrateLegacyAttendance();
    await seedIfNeeded();
    await loadAll();
    state.scheduleView=state.scheduleView||'week';
    state.calendarMonth=state.calendarMonth||new Date(new Date().getFullYear(),new Date().getMonth(),1);
    const dow=new Date().getDay(); state.scheduleDayIndex=DAYS_ORDER.includes(dow)?dow:1;
    renderAll(); setupTabs(); updateFab(); updateInstallButtons(); registerServiceWorker(); startNotificationLoop(); openHashRoute(); window.addEventListener('hashchange',openHashRoute);
    if(localStorage.getItem('classe_pin_hash')) setTimeout(lockApp,250);
  }catch(e){
    console.error('Classe init error:',e);
    document.body.innerHTML='<div style="padding:30px;font-family:system-ui"><h2>Impossible de charger Classe</h2><p>Une erreur a empêché le démarrage. Recharge l’application.</p><pre style="white-space:pre-wrap;color:#8b3a2f">'+escapeHtml(e?.message||String(e))+'</pre></div>';
  }
})();
