/* =========================================================
   CLASSE — Gestion de classe · UltraReview
   Offline-first · IndexedDB · PWA · Vanilla JS
   ========================================================= */

const DB_NAME = 'classe_db';
const DB_VERSION = 3;
const APP_VERSION = '4.0.0';
let db = null;

const STORES = {
  classes:   { keyPath: 'id' },
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
  classes: [], students: [], schedule: [], homework: [], grades: [],
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
  const [classes,students,schedule,homework,grades,attendance,sessions,settings]=await Promise.all([
    dbGetAll('classes'),dbGetAll('students'),dbGetAll('schedule'),dbGetAll('homework'),dbGetAll('grades'),dbGetAll('attendance'),dbGetAll('sessions'),dbGetAll('settings')
  ]);
  Object.assign(state,{classes,students,schedule,homework,grades,attendance,sessions,settings});
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
  const existing=await dbGetAll('classes');
  if(existing.length){ await dbPut('settings',{key:'seeded',value:true}); return; }
  const c1={id:uid(),name:'2nde',subject:'Physique-Chimie',color:'#B85C3E'};
  const c2={id:uid(),name:'1ère L',subject:'Physique-Chimie',color:'#4A7C5D'};
  await dbPut('classes',c1); await dbPut('classes',c2);
  for(const n of ['Aïcha Mahamat','Ibrahim Ousmane','Fatimé Adam','Djimet Nodjita','Halimé Youssouf','Mbaïnodji Rimtebaye','Achta Idriss','Naïmata Sougui']) await dbPut('students',{id:uid(),classId:c1.id,name:n,phone:'',note:''});
  for(const n of ['Kaltouma Brahim','Ndilbé Success','Hawa Mahamat','Djibrine Ali','Rosine Ngarmbatinan']) await dbPut('students',{id:uid(),classId:c2.id,name:n,phone:'',note:''});
  const demo=[
    {day:1,start:'07:30',end:'09:00',classId:c1.id,topic:'Mécanique — forces'},
    {day:1,start:'10:30',end:'12:00',classId:c2.id,topic:'Électricité — circuits'},
    {day:2,start:'08:00',end:'09:30',classId:c1.id,topic:'TP mesures'},
    {day:3,start:'07:30',end:'09:00',classId:c2.id,topic:'Chimie des solutions'},
    {day:4,start:'10:30',end:'12:00',classId:c1.id,topic:'Optique'},
    {day:5,start:'08:00',end:'09:30',classId:c2.id,topic:'Thermodynamique'}
  ];
  for(const s of demo) await dbPut('schedule',{id:uid(),...s});
  await dbPut('settings',{key:'seeded',value:true});
}

let toastTimer=null;
function showToast(msg,icon='check'){
  const el=document.getElementById('toast');
  const icons={check:'<path d="M20 6 9 17l-5-5"/>',info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'};
  el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${icons[icon]||icons.check}</svg><span>${escapeHtml(msg)}</span>`;
  el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
}
function openSheet(html){ document.getElementById('sheet').innerHTML='<div class="sheet-handle"></div>'+html; document.getElementById('sheetOverlay').classList.add('open'); }
function closeSheet(){ document.getElementById('sheetOverlay').classList.remove('open'); }
document.getElementById('sheetOverlay').addEventListener('click',e=>{ if(e.target.id==='sheetOverlay') closeSheet(); });

function renderAll(){ renderTopbar(); renderToday(); renderStudents(); renderSchedule(); renderHomework(); renderGrades(); updateFab(); }
function renderTopbar(){
  const titles={today:"Aujourd'hui",students:'Élèves',schedule:'Emploi du temps',homework:'Devoirs & exercices',grades:'Notes'};
  document.getElementById('topbarTitle').textContent=titles[state.currentTab]||'Classe';
  document.getElementById('topbarSub').textContent=state.currentTab==='today'?fmtDateLong(todayISO()):'';
  document.getElementById('topbarEyebrow').textContent=getAppName();
}
function getAppName(){ return localStorage.getItem('classe_app_name') || 'Classe · Gestion de classe'; }

function currentSlot(){
  const now=new Date(), dow=now.getDay(), hm=now.getHours()*60+now.getMinutes();
  return state.schedule.filter(s=>s.day===dow).sort((a,b)=>a.start.localeCompare(b.start)).find(s=>hm>=toMin(s.start)&&hm<toMin(s.end))||null;
}
function nextSlot(){
  const now=new Date(), dow=now.getDay(), hm=now.getHours()*60+now.getMinutes();
  return state.schedule.filter(s=>s.day===dow).sort((a,b)=>a.start.localeCompare(b.start)).find(s=>toMin(s.start)>hm)||null;
}
function toMin(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function minutesUntilSlot(slot){
  const now=new Date(), target=new Date(now); const [h,m]=slot.start.split(':').map(Number); target.setHours(h,m,0,0);
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
  const due=state.homework.filter(h=>!h.done&&h.dueDate===today), overdue=state.homework.filter(h=>!h.done&&daysUntil(h.dueDate)<0);
  let hero='';
  if(now){const c=getClass(now.classId); hero=`<p class="hero-label">Séance en cours</p><div class="hero-main"><span class="num">${now.start}</span><span class="lab">${escapeHtml(c?.name||'—')}</span></div><div class="now-session"><span class="tag">Maintenant</span><div class="cls">${escapeHtml(now.topic||'Séance')}</div><div class="time">${studentsOf(now.classId).length} élève(s) · ${now.start}–${now.end}</div></div>`;}
  else if(next){const c=getClass(next.classId); hero=`<p class="hero-label">Prochaine séance</p><div class="hero-main"><span class="num">${next.start}</span><span class="lab">${escapeHtml(c?.name||'—')}</span></div><p class="hero-note">${escapeHtml(next.topic||'Séance')} · dans ${minutesUntilSlot(next)}</p>`;}
  else hero=`<p class="hero-label">${slots.length?'Aujourd’hui':'Journée libre'}</p><p class="hero-empty">${slots.length?'Toutes tes séances du jour sont terminées.':'Aucune séance programmée. Profites-en pour préparer tes prochains cours.'}</p>`;
  const suggestions=computeSuggestions();
  const totalStudents=state.students.length, pending=state.homework.filter(h=>!h.done).length;
  const classCount=state.classes.length, avgAll=avg(state.grades.map(g=>g.value));
  el.innerHTML=`
    <div class="hero">${hero}</div>
    ${!isStandalone()?`<div class="install-banner"><div class="install-icon">📲</div><div class="install-copy"><strong>Installe Classe sur ce téléphone</strong><span>Accès rapide, plein écran et fonctionnement hors connexion.</span></div><button id="todayInstallBtn" type="button">Installer</button></div>`:''}
    <div class="quick-grid">
      <button class="quick-btn" id="qaPresence"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>Appel</span></button>
      <button class="quick-btn" id="qaDevoir"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg><span>Devoir</span></button>
      <button class="quick-btn" id="qaNote"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m18.7 8-5.7 5.7-3.5-3.5L4 15.7"/></svg><span>Note</span></button>
      <button class="quick-btn" id="qaEleve"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span>Élève</span></button>
    </div>
    <div class="metric-grid">
      <div class="metric"><span>${classCount}</span><small>Classes</small></div>
      <div class="metric"><span>${totalStudents}</span><small>Élèves</small></div>
      <div class="metric"><span>${avgAll!==null?avgAll.toFixed(1):'—'}</span><small>Moyenne</small></div>
      <div class="metric"><span>${pending}</span><small>Devoirs à faire</small></div>
    </div>
    ${suggestions.length?`<h2 class="section-title">À surveiller</h2>${suggestions.map(s=>`<div class="suggestion">${suggestionIcon(s.icon)}<div class="suggestion-text">${s.text}</div></div>`).join('')}`:''}
    <h2 class="section-title">Programme du jour</h2>
    ${slots.length?`<div class="card">${slots.map(s=>{const c=getClass(s.classId),isNow=now?.id===s.id;return `<div class="slot"><div class="slot-time">${s.start}</div><div class="slot-bar ${isNow?'is-now':''}"></div><div class="slot-body"><div class="cls">${escapeHtml(c?.name||'—')}</div><div class="topic">${escapeHtml(s.topic||'Sans thème')} · ${s.start}–${s.end}</div></div><button class="mini-action" data-att-slot="${s.id}" title="Faire l'appel" aria-label="Faire l'appel">✓</button></div>`;}).join('')}</div>`:`<div class="empty"><p>Pas de cours prévu aujourd'hui.</p></div>`}
    ${(due.length||overdue.length)?`<h2 class="section-title">Devoirs à surveiller</h2><div class="card">${[...due,...overdue].slice(0,4).map(h=>`<div class="row"><div class="row-main"><div class="row-title">${escapeHtml(h.title)}</div><div class="row-sub">${escapeHtml(classLabel(h.classId))} · ${daysUntil(h.dueDate)<0?'en retard':"à rendre aujourd'hui"}</div></div><div class="row-end"><span class="chip ${daysUntil(h.dueDate)<0?'chip-rouge':'chip-ocre'}">${daysUntil(h.dueDate)<0?'Retard':'Auj.'}</span></div></div>`).join('')}</div>`:''}
  `;
  document.getElementById('todayInstallBtn')?.addEventListener('click',()=>{haptic();installApp();});
  document.getElementById('qaPresence').onclick=()=>{haptic();openAttendanceSheet(now?.classId||state.classes[0]?.id,now?.id);};
  document.getElementById('qaDevoir').onclick=()=>{haptic();openHomeworkForm();};
  document.getElementById('qaNote').onclick=()=>{haptic();openGradeForm();};
  document.getElementById('qaEleve').onclick=()=>{haptic();openStudentForm();};
  document.querySelectorAll('[data-att-slot]').forEach(b=>b.onclick=e=>{e.stopPropagation();const s=state.schedule.find(x=>x.id===b.dataset.attSlot);if(s)openAttendanceSheet(s.classId,s.id);});
}

function renderStudents(){
  const el=document.getElementById('view-students');
  const filtered=state.students.filter(s=>(state.studentsClassFilter==='all'||s.classId===state.studentsClassFilter)&&(!state.studentsSearch||s.name.toLowerCase().includes(state.studentsSearch.toLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  el.innerHTML=`
    <div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="studentSearchInput" value="${escapeHtml(state.studentsSearch)}" placeholder="Rechercher un élève..." aria-label="Rechercher un élève"></div>
    <div class="filter-row"><div class="day-tabs" id="classFilterTabs"><button class="day-tab ${state.studentsClassFilter==='all'?'active':''}" data-cls="all">Toutes (${state.students.length})</button>${state.classes.map(c=>`<button class="day-tab ${state.studentsClassFilter===c.id?'active':''}" data-cls="${c.id}">${escapeHtml(c.name)} (${studentsOf(c.id).length})</button>`).join('')}</div><button class="btn-icon" id="manageClassesBtn" title="Gérer les classes" aria-label="Gérer les classes">⚙</button></div>
    ${filtered.length?`<div class="card">${filtered.map(s=>{const gs=gradesOfStudent(s.id),a=avg(gs.map(g=>g.value)),att=state.attendance.filter(x=>x.studentId===s.id);const abs=att.filter(x=>x.status==='a').length;return `<div class="row clickable" data-student="${s.id}"><div class="avatar">${initials(s.name)}</div><div class="row-main"><div class="row-title">${escapeHtml(s.name)}</div><div class="row-sub">${escapeHtml(classLabel(s.classId))} · ${gs.length} note(s) · ${abs} absence(s)</div></div><div class="row-end">${a!==null?`<span class="grade-pill ${gradeClass(a)}">${a.toFixed(1)}</span>`:''}</div></div>`;}).join('')}</div>`:`<div class="empty"><p>Aucun élève ${state.studentsSearch?'ne correspond à ta recherche':'enregistré'}.</p><button class="btn btn-primary empty-action" id="emptyAddStudent">Ajouter un élève</button></div>`}
  `;
  document.getElementById('studentSearchInput').oninput=e=>{state.studentsSearch=e.target.value;renderStudents();const i=document.getElementById('studentSearchInput');i.focus();i.setSelectionRange(i.value.length,i.value.length);};
  document.querySelectorAll('#classFilterTabs .day-tab').forEach(b=>b.onclick=()=>{state.studentsClassFilter=b.dataset.cls;renderStudents();});
  document.getElementById('manageClassesBtn').onclick=openClassManager;
  document.querySelectorAll('[data-student]').forEach(r=>r.onclick=()=>openStudentDetail(r.dataset.student));
  document.getElementById('emptyAddStudent')?.addEventListener('click',()=>openStudentForm());
}

function openStudentForm(existing){
  const edit=!!existing;
  openSheet(`<div class="sheet-header"><h3>${edit?"Modifier l'élève":'Nouvel élève'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="field"><label>Nom complet</label><input id="fStudentName" value="${edit?escapeHtml(existing.name):''}" placeholder="Ex. Aïcha Mahamat" autocomplete="name"></div>
    <div class="field"><label>Classe</label><select id="fStudentClass">${state.classes.map(c=>`<option value="${c.id}" ${edit&&existing.classId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Téléphone parent/tuteur <span class="optional">optionnel</span></label><input type="tel" id="fStudentPhone" value="${edit?escapeHtml(existing.phone||''):''}" placeholder="+235 ..."></div>
    <div class="field"><label>Note interne <span class="optional">optionnel</span></label><textarea id="fStudentNote" placeholder="Remarques particulières...">${edit?escapeHtml(existing.note||''):''}</textarea></div>
    <button class="btn btn-primary btn-block" id="saveStudentBtn">${edit?'Enregistrer':'Ajouter l’élève'}</button>
    ${edit?'<button class="btn btn-danger-outline btn-block" id="deleteStudentBtn">Supprimer l’élève</button>':''}`);
  document.getElementById('saveStudentBtn').onclick=async()=>{
    const name=document.getElementById('fStudentName').value.trim(),classId=document.getElementById('fStudentClass').value,phone=document.getElementById('fStudentPhone').value.trim(),note=document.getElementById('fStudentNote').value.trim();
    if(!name||!classId){showToast('Nom et classe requis','info');return;}
    await dbPut('students',{id:edit?existing.id:uid(),classId,name,phone,note}); await loadAll(); closeSheet(); renderAll(); showToast(edit?'Élève modifié':'Élève ajouté');
  };
  if(edit) document.getElementById('deleteStudentBtn').onclick=async()=>{
    if(!confirm(`Supprimer ${existing.name} et ses données scolaires associées ?`)) return;
    await cascadeDeleteStudent(existing.id); await loadAll(); closeSheet(); renderAll(); showToast('Élève et données associées supprimés');
  };
}

async function cascadeDeleteStudent(studentId){
  for(const g of state.grades.filter(x=>x.studentId===studentId)) await dbDelete('grades',g.id);
  for(const a of state.attendance.filter(x=>x.studentId===studentId)) await dbDelete('attendance',a.id);
  await dbDelete('students',studentId);
}

function openStudentDetail(studentId){
  const s=state.students.find(x=>x.id===studentId); if(!s)return;
  const gs=gradesOfStudent(studentId).sort((a,b)=>b.date.localeCompare(a.date)), a=avg(gs.map(g=>g.value));
  const att=state.attendance.filter(x=>x.studentId===studentId), p=att.filter(x=>x.status==='p').length,r=att.filter(x=>x.status==='r').length,ab=att.filter(x=>x.status==='a').length;
  openSheet(`<div class="sheet-header"><div><h3>${escapeHtml(s.name)}</h3><p class="sheet-kicker">${escapeHtml(classLabel(s.classId))}${s.phone?' · '+escapeHtml(s.phone):''}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="stat-grid"><div class="stat-box"><div class="v">${a!==null?a.toFixed(1):'—'}</div><div class="l">Moyenne /20</div></div><div class="stat-box"><div class="v">${p}</div><div class="l">Présences</div></div><div class="stat-box"><div class="v">${ab}</div><div class="l">Absences</div></div></div>
    ${s.note?`<div class="note-card">${escapeHtml(s.note)}</div>`:''}
    <div class="attendance-summary"><span>Présent ${p}</span><span>Retard ${r}</span><span>Absent ${ab}</span></div>
    <h2 class="section-title">Dernières notes</h2>${gs.length?`<div class="card">${gs.slice(0,8).map(g=>`<div class="row clickable" data-edit-grade="${g.id}"><div class="row-main"><div class="row-title">${escapeHtml(g.label)}</div><div class="row-sub">${fmtDateShort(g.date)}</div></div><div class="row-end"><span class="grade-pill ${gradeClass(g.value)}">${g.value}/20</span></div></div>`).join('')}</div>`:'<p class="muted">Aucune note enregistrée.</p>'}
    <div class="sheet-actions"><button class="btn btn-ghost" id="editStudentBtn">Modifier</button><button class="btn btn-primary" id="addGradeForStudentBtn">Ajouter une note</button></div>`);
  document.getElementById('editStudentBtn').onclick=()=>openStudentForm(s);
  document.getElementById('addGradeForStudentBtn').onclick=()=>openGradeForm(s.classId,s.id);
  document.querySelectorAll('[data-edit-grade]').forEach(b=>b.onclick=()=>openGradeForm(null,null,state.grades.find(g=>g.id===b.dataset.editGrade)));
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

function renderSchedule(){
  const el=document.getElementById('view-schedule'), day=state.scheduleDayIndex, slots=state.schedule.filter(s=>s.day===day).sort((a,b)=>a.start.localeCompare(b.start));
  el.innerHTML=`<div class="day-tabs" id="dayTabs">${DAYS_ORDER.map(d=>`<button class="day-tab ${day===d?'active':''}" data-day="${d}">${DAYS_FR_SHORT[d]}</button>`).join('')}</div>
    <div class="section-inline"><div><h2 class="section-title">${DAYS_FR[day][0].toUpperCase()+DAYS_FR[day].slice(1)}</h2><p class="muted">${slots.length} séance(s)</p></div><button class="btn btn-sm btn-ghost" id="scheduleAdd">+ Séance</button></div>
    ${slots.length?`<div class="card">${slots.map(s=>{const c=getClass(s.classId);return `<div class="slot clickable" data-slot="${s.id}"><div class="slot-time">${s.start}<br><span>${s.end}</span></div><div class="slot-bar"></div><div class="slot-body"><div class="cls">${escapeHtml(c?.name||'—')}</div><div class="topic">${escapeHtml(s.topic||'Sans thème')}</div></div><button class="mini-action" data-call="${s.id}" title="Faire l'appel" aria-label="Faire l'appel">✓</button></div>`;}).join('')}</div>`:`<div class="empty"><p>Aucune séance le ${DAYS_FR[day]}.</p><button class="btn btn-primary empty-action" id="emptyAddSlot">Ajouter une séance</button></div>`}`;
  document.querySelectorAll('#dayTabs .day-tab').forEach(b=>b.onclick=()=>{state.scheduleDayIndex=Number(b.dataset.day);renderSchedule();});
  document.getElementById('scheduleAdd').onclick=()=>openSlotForm(null,day);
  document.querySelectorAll('[data-slot]').forEach(r=>r.onclick=()=>openSlotForm(state.schedule.find(s=>s.id===r.dataset.slot)));
  document.querySelectorAll('[data-call]').forEach(b=>b.onclick=e=>{e.stopPropagation();const s=state.schedule.find(x=>x.id===b.dataset.call);openAttendanceSheet(s.classId,s.id);});
  document.getElementById('emptyAddSlot')?.addEventListener('click',()=>openSlotForm(null,day));
}
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
    await dbPut('schedule',candidate);await loadAll();state.scheduleDayIndex=day;closeSheet();renderAll();showToast(edit?'Séance modifiée':'Séance ajoutée');
  };
  if(edit) document.getElementById('deleteSlotBtn').onclick=async()=>{if(!confirm('Supprimer cette séance ? Les appels déjà enregistrés resteront conservés.'))return;await dbDelete('schedule',existing.id);await loadAll();closeSheet();renderAll();showToast('Séance supprimée');};
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

function renderGrades(){
  const el=document.getElementById('view-grades');if(state.gradesClassFilter===null&&state.classes.length)state.gradesClassFilter=state.classes[0].id;const cid=state.gradesClassFilter,cls=getClass(cid),grades=state.grades.filter(g=>g.classId===cid).sort((a,b)=>b.date.localeCompare(a.date)),classAvg=avg(grades.map(g=>g.value));
  el.innerHTML=`<div class="day-tabs" id="gradeClassTabs">${state.classes.map(c=>`<button class="day-tab ${cid===c.id?'active':''}" data-cls="${c.id}">${escapeHtml(c.name)}</button>`).join('')}</div>${cid?`<div class="stat-grid"><div class="stat-box"><div class="v">${classAvg!==null?classAvg.toFixed(1):'—'}</div><div class="l">Moyenne classe</div></div><div class="stat-box"><div class="v">${grades.length}</div><div class="l">Notes saisies</div></div><div class="stat-box"><div class="v">${studentsOf(cid).length}</div><div class="l">Élèves</div></div></div><div class="grade-toolbar"><span class="muted">Tapote une note pour la modifier</span><button class="btn btn-sm btn-ghost" id="gradeExportCsv">CSV</button></div>${grades.length?`<div class="card">${grades.slice(0,30).map(g=>{const s=state.students.find(x=>x.id===g.studentId);return `<div class="row clickable" data-edit-grade="${g.id}"><div class="avatar">${s?initials(s.name):'?'}</div><div class="row-main"><div class="row-title">${escapeHtml(s?.name||'Élève supprimé')}</div><div class="row-sub">${escapeHtml(g.label)} · ${fmtDateShort(g.date)}</div></div><div class="row-end"><span class="grade-pill ${gradeClass(g.value)}">${g.value}/20</span></div></div>`;}).join('')}</div>`:`<div class="empty"><p>Aucune note pour ${escapeHtml(cls.name)}.</p><button class="btn btn-primary empty-action" id="emptyAddGrade">Ajouter une note</button></div>`}`:'<div class="empty"><p>Crée d’abord une classe.</p></div>'}`;
  document.querySelectorAll('#gradeClassTabs .day-tab').forEach(b=>b.onclick=()=>{state.gradesClassFilter=b.dataset.cls;renderGrades();});document.querySelectorAll('[data-edit-grade]').forEach(b=>b.onclick=()=>openGradeForm(null,null,state.grades.find(g=>g.id===b.dataset.editGrade)));document.getElementById('emptyAddGrade')?.addEventListener('click',()=>openGradeForm(cid));document.getElementById('gradeExportCsv')?.addEventListener('click',()=>exportGradesCSV(cid));
}
function openGradeForm(presetClassId,presetStudentId,existing){
  const edit=!!existing,cid=existing?.classId||presetClassId||state.gradesClassFilter||state.classes[0]?.id;
  openSheet(`<div class="sheet-header"><h3>${edit?'Modifier la note':'Nouvelle note'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><div class="field"><label>Classe</label><select id="fGradeClass" ${edit?'disabled':''}>${state.classes.map(c=>`<option value="${c.id}" ${cid===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="field"><label>Élève</label><select id="fGradeStudent" ${edit?'disabled':''}></select></div><div class="field"><label>Intitulé de l’évaluation</label><input id="fGradeLabel" value="${edit?escapeHtml(existing.label):''}" placeholder="Ex. Interro chapitre 3"></div><div class="field-row"><div class="field"><label>Note /20</label><input type="number" id="fGradeValue" min="0" max="20" step="0.25" value="${edit?existing.value:''}" placeholder="14.5"></div><div class="field"><label>Date</label><input type="date" id="fGradeDate" value="${edit?existing.date:todayISO()}"></div></div><button class="btn btn-primary btn-block" id="saveGradeBtn">${edit?'Enregistrer':'Ajouter la note'}</button>${edit?'<button class="btn btn-danger-outline btn-block" id="deleteGradeBtn">Supprimer la note</button>':''}`);
  function fill(){const id=document.getElementById('fGradeClass').value;document.getElementById('fGradeStudent').innerHTML=studentsOf(id).map(s=>`<option value="${s.id}" ${(existing?.studentId||presetStudentId)===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')||'<option value="">Aucun élève</option>';}
  fill();document.getElementById('fGradeClass').onchange=fill;
  document.getElementById('saveGradeBtn').onclick=async()=>{const classId=document.getElementById('fGradeClass').value,studentId=document.getElementById('fGradeStudent').value,label=document.getElementById('fGradeLabel').value.trim(),value=parseFloat(document.getElementById('fGradeValue').value),date=document.getElementById('fGradeDate').value;if(!studentId||!label||Number.isNaN(value)||value<0||value>20||!date){showToast('Vérifie les champs (note de 0 à 20)','info');return;}await dbPut('grades',{id:edit?existing.id:uid(),classId,studentId,label,value,date});await loadAll();state.gradesClassFilter=classId;closeSheet();renderAll();showToast(edit?'Note modifiée':'Note enregistrée');};
  if(edit)document.getElementById('deleteGradeBtn').onclick=async()=>{if(!confirm('Supprimer cette note ?'))return;await dbDelete('grades',existing.id);await loadAll();closeSheet();renderAll();showToast('Note supprimée');};
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
function openImportPicker(){ document.getElementById('importFileInput').click(); }
async function importData(file){
  try{
    const parsed=JSON.parse(await file.text());
    if(!parsed?.stores?.classes||!parsed?.stores?.students) throw new Error('Format invalide');
    if(!confirm('Restaurer cette sauvegarde ? Les données actuelles seront remplacées.')) return;
    for(const name of Object.keys(STORES)) await clearStore(name);
    for(const name of Object.keys(STORES)){for(const row of (parsed.stores[name]||[])) await dbPut(name,row);}
    await loadAll();await migrateLegacyAttendance();await loadAll();renderAll();closeSheet();showToast('Sauvegarde restaurée');
  }catch(e){console.error(e);showToast('Impossible de restaurer cette sauvegarde','info');}
}
function exportGradesCSV(classId){
  const rows=[['Élève','Classe','Évaluation','Note /20','Date']];
  state.grades.filter(g=>g.classId===classId).forEach(g=>{const s=state.students.find(x=>x.id===g.studentId);rows.push([s?.name||'Élève supprimé',classLabel(g.classId),g.label,g.value,g.date]);});
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob=new Blob(["\uFEFF"+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`notes-${escapeFileName(classLabel(classId))}-${todayISO()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('CSV exporté');
}
function escapeFileName(s){return String(s||'classe').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'classe';}
function openSettings(){
  const pin=!!localStorage.getItem('classe_pin_hash'), notif=localStorage.getItem('classe_notifications')==='1', dark=document.documentElement.classList.contains('dark');
  openSheet(`<div class="sheet-header"><div><h3>Réglages</h3><p class="sheet-kicker">${getAppName()} · v${APP_VERSION}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="settings-brand"><div class="logo"><svg viewBox="0 0 48 48" fill="none"><rect x="7" y="9" width="15" height="27" rx="4" fill="#1E2A2F"/><rect x="26" y="9" width="15" height="27" rx="4" fill="#1E2A2F"/><path d="M24 10v25" stroke="#F7F1E3" stroke-width="3"/><path d="m30 28 4 4 8-10" stroke="#4D8464" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><strong>Classe</strong><small>Votre carnet de bord, même sans connexion.</small></div></div>
    <div class="settings-section install-card"><div class="install-badge">📱 Application</div><div class="settings-title">Installer sur ce téléphone</div><p class="muted" id="installHint">Installe Classe pour l'ouvrir comme une vraie application.</p><button class="btn btn-primary btn-block" id="installAppBtn" type="button" onclick="installApp()">📲 Installer Classe</button><button class="btn btn-ghost btn-block" id="shareAppBtn" type="button">↗ Partager l’application</button></div>
    <div class="settings-section"><div class="settings-title">Apparence</div><div class="settings-actions"><button class="btn ${!dark?'btn-primary':'btn-ghost'}" id="themeLight">☀️ Clair</button><button class="btn ${dark?'btn-primary':'btn-ghost'}" id="themeDark">🌙 Sombre</button></div></div>
    <div class="settings-section"><div class="settings-title">Sécurité</div><p class="muted">Protège les données locales avec un PIN sur cet appareil.</p><div class="settings-actions"><button class="btn btn-ghost" id="pinBtn">${pin?'Changer le PIN':'Créer un PIN'}</button>${pin?'<button class="btn btn-ghost" id="removePinBtn">Désactiver</button>':''}</div></div>
    <div class="settings-section"><div class="settings-title">Notifications</div><p class="muted">Rappels des prochaines séances lorsque l’application est ouverte.</p><button class="btn btn-ghost btn-block" id="notifBtn">${notif?'✓ Notifications activées':'Activer les notifications'}</button></div>
    <div class="settings-section"><div class="settings-title">Sauvegarde</div><p class="muted">Garde une copie complète avant de changer de téléphone.</p><div class="settings-actions"><button class="btn btn-ghost" id="exportBtn">Exporter JSON</button><button class="btn btn-ghost" id="importBtn">Restaurer JSON</button></div></div>
    <div class="settings-section"><div class="settings-title">Import / rapports</div><div class="settings-actions"><button class="btn btn-ghost" id="csvStudentsBtn">Importer élèves CSV</button><button class="btn btn-ghost" id="reportBtn">Rapport / PDF</button></div></div>
    <div class="settings-section"><div class="settings-title">État de l’application</div>${appHealth()}<p class="muted" style="margin-top:9px">Les données scolaires restent dans le stockage local de ce téléphone.</p></div>
    <div class="settings-section"><div class="settings-title">Données de démonstration</div><p class="muted">Recharge un jeu de données d’exemple pour tester toutes les fonctions.</p><button class="btn btn-ghost btn-block" id="demoResetBtn">Réinitialiser avec la démo</button></div>
    <div class="settings-section danger-zone"><div class="settings-title">Zone sensible</div><button class="btn btn-danger-outline btn-block" id="wipeBtn">Tout effacer</button></div>`);
  updateInstallButtons();
  document.getElementById('themeLight').onclick=()=>{haptic();document.documentElement.classList.remove('dark');localStorage.setItem('classe_theme','light');closeSheet();renderAll();};
  document.getElementById('themeDark').onclick=()=>{haptic();document.documentElement.classList.add('dark');localStorage.setItem('classe_theme','dark');closeSheet();renderAll();};
  document.getElementById('shareAppBtn').onclick=()=>{haptic();shareApp();};
  document.getElementById('pinBtn').onclick=setupPin;document.getElementById('removePinBtn')?.addEventListener('click',removePin);
  document.getElementById('exportBtn').onclick=exportData;document.getElementById('importBtn').onclick=openImportPicker;
  document.getElementById('csvStudentsBtn').onclick=()=>document.getElementById('studentCsvInput').click();document.getElementById('reportBtn').onclick=openReportChooser;
  document.getElementById('notifBtn').onclick=async()=>{if(!('Notification'in window)){showToast('Notifications non disponibles sur cet appareil','info');return;}const p=await Notification.requestPermission();if(p==='granted'){localStorage.setItem('classe_notifications','1');showToast('Notifications activées');}else showToast('Permission refusée','info');};
  document.getElementById('demoResetBtn').onclick=async()=>{if(!confirm('Remplacer les données actuelles par la démo ?'))return;for(const n of Object.keys(STORES))await clearStore(n);await dbPut('settings',{key:'seeded',value:false});await seedIfNeeded();await loadAll();renderAll();closeSheet();showToast('Démo réinitialisée');};
  document.getElementById('wipeBtn').onclick=async()=>{if(!confirm('Supprimer TOUTES les données locales ? Fais une sauvegarde avant.'))return;for(const n of Object.keys(STORES))await clearStore(n);await dbPut('settings',{key:'seeded',value:true});await loadAll();renderAll();closeSheet();showToast('Toutes les données ont été effacées');};
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
function attendanceStats(classId){
  const arr=state.attendance.filter(a=>!classId||a.classId===classId);
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
    <div class="student-photo-editor">${existing?.photo?`<img src="${existing.photo}" alt="Photo de ${escapeHtml(existing.name)}">`:`<div class="student-photo-placeholder">${edit?initials(existing.name):'+'}</div>`}<label class="btn btn-sm btn-ghost">${existing?.photo?'Changer la photo':'Ajouter une photo'}<input id="fStudentPhoto" type="file" accept="image/*" capture="environment" hidden></label></div>
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
    <div class="student-profile-head">${s.photo?`<img src="${s.photo}" alt="Photo">`:`<div class="student-avatar-large">${initials(s.name)}</div>`}<div><div class="student-profile-name">${escapeHtml(s.name)}</div><div class="muted">${s.phone?escapeHtml(s.phone):'Aucun contact enregistré'}</div></div></div>
    <div class="stat-grid"><div class="stat-box"><div class="v">${a!==null?a.toFixed(1):'—'}</div><div class="l">Moyenne /20</div></div><div class="stat-box"><div class="v">${rate!==null?rate+'%':'—'}</div><div class="l">Présence</div></div><div class="stat-box"><div class="v">${ab}</div><div class="l">Absences</div></div></div>
    ${s.note?`<div class="note-card">${escapeHtml(s.note)}</div>`:''}
    <div class="attendance-summary"><span>Présent ${p}</span><span>Retard ${r}</span><span>Absent ${ab}</span></div>
    <div class="sheet-actions">${call}<button class="btn btn-ghost" id="editStudentBtn">Modifier</button><button class="btn btn-primary" id="addGradeForStudentBtn">Note</button></div>
    <h2 class="section-title">Historique des notes</h2>${gs.length?`<div class="card">${gs.slice(0,10).map(g=>`<div class="row clickable" data-edit-grade="${g.id}"><div class="row-main"><div class="row-title">${escapeHtml(g.label)}</div><div class="row-sub">${fmtDateShort(g.date)} · coef. ${Number(g.coef)||1}</div></div><div class="row-end"><span class="grade-pill ${gradeClass(g.value)}">${g.value}/20</span></div></div>`).join('')}</div>`:'<p class="muted">Aucune note enregistrée.</p>'}`);
  document.getElementById('editStudentBtn').onclick=()=>openStudentForm(s);document.getElementById('addGradeForStudentBtn').onclick=()=>openGradeForm(s.classId,s.id);document.querySelectorAll('[data-edit-grade]').forEach(b=>b.onclick=()=>openGradeForm(null,null,state.grades.find(g=>g.id===b.dataset.editGrade)));
}

/* ---------- Weighted grades + bulk entry ---------- */
function renderGrades(){
  const el=document.getElementById('view-grades');
  if(state.gradesClassFilter===null&&state.classes.length)state.gradesClassFilter=state.classes[0].id;
  const cid=state.gradesClassFilter,cls=getClass(cid),grades=state.grades.filter(g=>g.classId===cid).sort((a,b)=>b.date.localeCompare(a.date)),classAvg=weightedAvg(grades);
  el.innerHTML=`<div class="day-tabs" id="gradeClassTabs">${state.classes.map(c=>`<button class="day-tab ${cid===c.id?'active':''}" data-cls="${c.id}">${escapeHtml(c.name)}</button>`).join('')}</div>${cid?`
    <div class="stat-grid"><div class="stat-box"><div class="v">${classAvg!==null?classAvg.toFixed(1):'—'}</div><div class="l">Moyenne pondérée</div></div><div class="stat-box"><div class="v">${grades.length}</div><div class="l">Notes</div></div><div class="stat-box"><div class="v">${studentsOf(cid).length}</div><div class="l">Élèves</div></div></div>
    <div class="feature-grid"><button class="feature-btn" id="bulkGradeBtn">📝 Saisie collective<small>Noter toute la classe</small></button><button class="feature-btn" id="gradeStatsBtn">📊 Analyse<small>Distribution & progression</small></button></div>
    <div class="grade-toolbar"><span class="muted">Coefficient intégré · tapote une note pour la modifier</span><button class="btn btn-sm btn-ghost" id="gradeExportCsv">CSV</button></div>
    ${grades.length?`<div class="card">${grades.slice(0,40).map(g=>{const s=state.students.find(x=>x.id===g.studentId);return `<div class="row clickable" data-edit-grade="${g.id}"><div class="avatar">${s?initials(s.name):'?'}</div><div class="row-main"><div class="row-title">${escapeHtml(s?.name||'Élève supprimé')}</div><div class="row-sub">${escapeHtml(g.label)} · ${fmtDateShort(g.date)} · coef. ${Number(g.coef)||1}</div></div><div class="row-end"><span class="grade-pill ${gradeClass(g.value)}">${g.value}/20</span></div></div>`;}).join('')}</div>`:`<div class="empty"><p>Aucune note pour ${escapeHtml(cls.name)}.</p><button class="btn btn-primary empty-action" id="emptyAddGrade">Ajouter une note</button></div>`}`:'<div class="empty"><p>Crée d’abord une classe.</p></div>'}`;
  document.querySelectorAll('#gradeClassTabs .day-tab').forEach(b=>b.onclick=()=>{state.gradesClassFilter=b.dataset.cls;renderGrades();});
  document.querySelectorAll('[data-edit-grade]').forEach(b=>b.onclick=()=>openGradeForm(null,null,state.grades.find(g=>g.id===b.dataset.editGrade)));
  document.getElementById('emptyAddGrade')?.addEventListener('click',()=>openGradeForm(cid));
  document.getElementById('gradeExportCsv')?.addEventListener('click',()=>exportGradesCSV(cid));
  document.getElementById('bulkGradeBtn')?.addEventListener('click',()=>openBulkGradeForm(cid));
  document.getElementById('gradeStatsBtn')?.addEventListener('click',()=>openClassGradeStats(cid));
}
function openGradeForm(presetClassId,presetStudentId,existing){
  const edit=!!existing,cid=existing?.classId||presetClassId||state.gradesClassFilter||state.classes[0]?.id;
  openSheet(`<div class="sheet-header"><h3>${edit?'Modifier la note':'Nouvelle note'}</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="field"><label>Classe</label><select id="fGradeClass" ${edit?'disabled':''}>${state.classes.map(c=>`<option value="${c.id}" ${cid===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Élève</label><select id="fGradeStudent" ${edit?'disabled':''}></select></div>
    <div class="field"><label>Intitulé de l’évaluation</label><input id="fGradeLabel" value="${edit?escapeHtml(existing.label):''}" placeholder="Ex. Interro chapitre 3"></div>
    <div class="field-row"><div class="field"><label>Note /20</label><input type="number" id="fGradeValue" min="0" max="20" step="0.25" value="${edit?existing.value:''}" placeholder="14.5"></div><div class="field"><label>Coefficient</label><input type="number" id="fGradeCoef" min="0.25" max="20" step="0.25" value="${edit?(existing.coef||1):1}"></div></div>
    <div class="field"><label>Date</label><input type="date" id="fGradeDate" value="${edit?existing.date:todayISO()}"></div>
    <button class="btn btn-primary btn-block" id="saveGradeBtn">${edit?'Enregistrer':'Ajouter la note'}</button>${edit?'<button class="btn btn-danger-outline btn-block" id="deleteGradeBtn">Supprimer la note</button>':''}`);
  function fill(){const id=document.getElementById('fGradeClass').value;document.getElementById('fGradeStudent').innerHTML=studentsOf(id).map(s=>`<option value="${s.id}" ${(existing?.studentId||presetStudentId)===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')||'<option value="">Aucun élève</option>';}
  fill();document.getElementById('fGradeClass').onchange=fill;
  document.getElementById('saveGradeBtn').onclick=async()=>{const classId=document.getElementById('fGradeClass').value,studentId=document.getElementById('fGradeStudent').value,label=document.getElementById('fGradeLabel').value.trim(),value=parseFloat(document.getElementById('fGradeValue').value),coef=parseFloat(document.getElementById('fGradeCoef').value)||1,date=document.getElementById('fGradeDate').value;if(!studentId||!label||Number.isNaN(value)||value<0||value>20||coef<=0||!date){showToast('Vérifie les champs (0 à 20, coefficient positif)','info');return;}await dbPut('grades',{id:edit?existing.id:uid(),classId,studentId,label,value,coef,date});await loadAll();state.gradesClassFilter=classId;closeSheet();renderAll();showToast(edit?'Note modifiée':'Note enregistrée');};
  if(edit)document.getElementById('deleteGradeBtn').onclick=async()=>{if(!confirm('Supprimer cette note ?'))return;await dbDelete('grades',existing.id);await loadAll();closeSheet();renderAll();showToast('Note supprimée');};
}
function openBulkGradeForm(classId){
  const students=studentsOf(classId); if(!students.length){showToast('Cette classe n’a aucun élève','info');return;}
  openSheet(`<div class="sheet-header"><div><h3>Saisie collective</h3><p class="sheet-kicker">${escapeHtml(classLabel(classId))}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="field"><label>Évaluation</label><input id="bulkLabel" placeholder="Ex. Devoir surveillé 1"></div>
    <div class="field-row"><div class="field"><label>Coefficient</label><input id="bulkCoef" type="number" min="0.25" step="0.25" value="1"></div><div class="field"><label>Date</label><input id="bulkDate" type="date" value="${todayISO()}"></div></div>
    <div class="bulk-table">${students.map(s=>`<div class="bulk-row"><div>${escapeHtml(s.name)}</div><input class="bulk-value" data-sid="${s.id}" type="number" min="0" max="20" step="0.25" placeholder="/20"></div>`).join('')}</div>
    <button class="btn btn-primary btn-block" id="saveBulkGrades" style="margin-top:12px">Enregistrer les notes saisies</button>`);
  document.getElementById('saveBulkGrades').onclick=async()=>{const label=document.getElementById('bulkLabel').value.trim(),coef=parseFloat(document.getElementById('bulkCoef').value)||1,date=document.getElementById('bulkDate').value,inputs=[...document.querySelectorAll('.bulk-value')];if(!label||!date){showToast('Évaluation et date requises','info');return;}let n=0;for(const i of inputs){if(i.value==='')continue;const v=parseFloat(i.value);if(v>=0&&v<=20){await dbPut('grades',{id:uid(),classId,studentId:i.dataset.sid,label,value:v,coef,date});n++;}}await loadAll();state.gradesClassFilter=classId;closeSheet();renderAll();showToast(`${n} note(s) enregistrée(s)`);};
}
function openClassGradeStats(classId){
  const grades=state.grades.filter(g=>g.classId===classId),students=studentsOf(classId), bins=[0,0,0,0,0], distribution=[0,0,0,0,0];
  grades.forEach(g=>{const i=Math.min(4,Math.floor(Number(g.value)/4));bins[i]++;});
  const rows=students.map(s=>({s,a:weightedAvg(grades.filter(g=>g.studentId===s.id))})).filter(x=>x.a!==null).sort((a,b)=>b.a-a.a);
  const max=Math.max(1,...bins);
  openSheet(`<div class="sheet-header"><div><h3>Analyse · ${escapeHtml(classLabel(classId))}</h3><p class="sheet-kicker">${grades.length} note(s)</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="card"><div class="bar-chart">${bins.map((n,i)=>`<div class="bar" style="height:${Math.max(5,n/max*100)}%"><span>${n}</span><small>${i*4}–${i*4+3.99}</small></div>`).join('')}</div></div>
    <h2 class="section-title">Moyennes par élève</h2><div class="card">${rows.slice(0,15).map((x,i)=>`<div class="rank-row"><div class="rank-num">${i+1}</div><div class="rank-name">${escapeHtml(x.s.name)}</div><span class="grade-pill ${gradeClass(x.a)}">${x.a.toFixed(1)}</span></div>`).join('')||'<p class="muted">Pas assez de données.</p>'}</div>`);
}

/* ---------- Statistics dashboard ---------- */
function renderStats(){
  const el=document.getElementById('view-stats'), total=state.students.length, classes=state.classes.length, grades=state.grades, avgAll=weightedAvg(grades), at=attendanceStats(), pending=state.homework.filter(h=>!h.done).length;
  const classCards=state.classes.map(c=>{const gs=grades.filter(g=>g.classId===c.id),a=weightedAvg(gs),st=studentsOf(c.id),att=attendanceStats(c.id);return {c,a,st,att,gs};}).sort((a,b)=>(b.a??-1)-(a.a??-1));
  const max=Math.max(1,...classCards.map(x=>x.a||0));
  el.innerHTML=`<div class="insight-grid"><div class="insight-card"><div class="big">${total}</div><div class="label">Élèves</div></div><div class="insight-card"><div class="big">${classes}</div><div class="label">Classes</div></div><div class="insight-card"><div class="big">${avgAll!==null?avgAll.toFixed(1):'—'}</div><div class="label">Moyenne pondérée</div></div><div class="insight-card"><div class="big">${at.rate!==null?Math.round(at.rate)+'%':'—'}</div><div class="label">Présence globale</div></div></div>
    <div class="feature-grid"><button class="feature-btn" id="printReportBtn">📄 Rapport de classe<small>Imprimer / PDF</small></button><button class="feature-btn" id="importStudentsBtn">📥 Importer élèves<small>CSV / Excel export</small></button></div>
    <h2 class="section-title">Vue par classe</h2>
    ${classCards.length?`<div class="card">${classCards.map(x=>`<div class="rank-row"><div class="avatar">${escapeHtml((x.c.name||'?').slice(0,2).toUpperCase())}</div><div class="row-main"><div class="rank-name">${escapeHtml(x.c.name)}</div><div class="muted">${x.st.length} élève(s) · ${x.att.rate!==null?Math.round(x.att.rate)+'% présence':'pas d’appel'}</div><div class="progress"><i style="width:${Math.min(100,((x.a||0)/20)*100)}%"></i></div></div><span class="grade-pill ${x.a!==null?gradeClass(x.a):'grade-mid'}">${x.a!==null?x.a.toFixed(1):'—'}</span></div>`).join('')}</div>`:'<div class="empty"><p>Crée une classe pour commencer.</p></div>'}
    <h2 class="section-title">Répartition des notes</h2>
    <div class="card"><div class="bar-chart">${[0,1,2,3,4].map(i=>{const n=grades.filter(g=>{const v=Number(g.value);return v>=i*4&&v<(i===4?20.01:(i+1)*4);}).length;const m=Math.max(1,...[0,1,2,3,4].map(j=>grades.filter(g=>{const v=Number(g.value);return v>=j*4&&v<(j===4?20.01:(j+1)*4);}).length));return `<div class="bar" style="height:${Math.max(5,n/m*100)}%"><span>${n}</span><small>${i*4}–${i*4+3.99}</small></div>`;}).join('')}</div></div>
    <h2 class="section-title">À surveiller</h2>${computeSuggestions().map(s=>`<div class="suggestion">${suggestionIcon(s.icon)}<div class="suggestion-text">${s.text}</div></div>`).join('')||'<div class="status-banner success">Aucun signal particulier détecté.</div>'}
    <p class="muted" style="margin-top:14px">${pending} devoir(s) encore à faire · ${grades.length} note(s) enregistrée(s).</p>`;
  document.getElementById('printReportBtn').onclick=()=>openReportChooser();
  document.getElementById('importStudentsBtn').onclick=()=>document.getElementById('studentCsvInput').click();
}
function openReportChooser(){
  openSheet(`<div class="sheet-header"><h3>Générer un rapport</h3><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div><p class="muted">Le rapport est optimisé pour l’impression et l’export PDF depuis le menu d’impression du téléphone.</p><div class="feature-grid">${state.classes.map(c=>`<button class="feature-btn" data-report="${c.id}">📄 ${escapeHtml(c.name)}<small>Bulletin synthétique</small></button>`).join('')}</div>`);
  document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>printClassReport(b.dataset.report));
}
function printClassReport(classId){
  const c=getClass(classId),students=studentsOf(classId),gs=state.grades.filter(g=>g.classId===classId),att=attendanceStats(classId), rows=students.map(s=>({s,a:weightedAvg(gs.filter(g=>g.studentId===s.id)),abs:state.attendance.filter(x=>x.studentId===s.id&&x.classId===classId&&x.status==='a').length})).sort((a,b)=>a.s.name.localeCompare(b.s.name,'fr'));
  let root=document.getElementById('printRoot'); if(!root){root=document.createElement('div');root.id='printRoot';document.body.appendChild(root);}
  root.innerHTML=`<div class="print-report"><h1>${escapeHtml(getAppName())}</h1><h2>${escapeHtml(c?.name||'Classe')} · ${escapeHtml(c?.subject||'')}</h2><p>Rapport du ${fmtDateLong(todayISO())}</p><div class="print-summary"><b>Moyenne : ${weightedAvg(gs)?.toFixed(1)||'—'}/20</b><b>Présence : ${att.rate!==null?Math.round(att.rate)+'%':'—'}</b><b>Élèves : ${students.length}</b></div><table><thead><tr><th>Élève</th><th>Moyenne</th><th>Absences</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.s.name)}</td><td>${r.a!==null?r.a.toFixed(2):'—'}</td><td>${r.abs}</td></tr>`).join('')}</tbody></table><p class="print-note">Document généré localement par Classe. Les données restent sur cet appareil.</p></div>`;
  closeSheet();setTimeout(()=>window.print(),80);
}

/* ---------- Calendar + session journal ---------- */
function openSessionDetail(scheduleId){
  const slot=state.schedule.find(s=>s.id===scheduleId);if(!slot)return;const c=getClass(slot.classId),session=findSession(todayISO(),slot.classId,slot.id);const j=session?.journal||{};
  openSheet(`<div class="sheet-header"><div><h3>${escapeHtml(c?.name||'Séance')}</h3><p class="sheet-kicker">${escapeHtml(slot.topic||'Sans thème')} · ${slot.start}–${slot.end}</p></div><button class="btn-icon" onclick="closeSheet()" aria-label="Fermer">×</button></div>
    <div class="feature-grid"><button class="feature-btn" id="sessionCallBtn">✓ Appel<small>Présences du jour</small></button><button class="feature-btn" id="sessionEditBtn">⚙ Modifier<small>Horaire et thème</small></button></div>
    <h2 class="section-title">Préparer / journaliser</h2>
    <div class="field"><label>Objectifs</label><textarea id="jObjectives" placeholder="Ce que les élèves doivent savoir faire...">${escapeHtml(j.objectives||'')}</textarea></div>
    <div class="field"><label>Activités / déroulé</label><textarea id="jActivities" placeholder="Introduction, expérience, exercices...">${escapeHtml(j.activities||'')}</textarea></div>
    <div class="field"><label>Matériel</label><input id="jMaterial" value="${escapeHtml(j.material||'')}" placeholder="Ex. dynamomètre, règle"></div>
    <div class="field"><label>À reprendre / notes</label><textarea id="jNotes" placeholder="Ce qui a été fait, difficultés, suite...">${escapeHtml(j.notes||'')}</textarea></div>
    <button class="btn btn-primary btn-block" id="saveJournalBtn">Enregistrer le journal</button>`);
  document.getElementById('sessionCallBtn').onclick=()=>openAttendanceSheet(slot.classId,slot.id);document.getElementById('sessionEditBtn').onclick=()=>openSlotForm(slot);
  document.getElementById('saveJournalBtn').onclick=async()=>{const s=await getOrCreateSession(todayISO(),slot.classId,slot.id);s.journal={objectives:document.getElementById('jObjectives').value.trim(),activities:document.getElementById('jActivities').value.trim(),material:document.getElementById('jMaterial').value.trim(),notes:document.getElementById('jNotes').value.trim()};await dbPut('sessions',s);await loadAll();closeSheet();showToast('Journal de séance enregistré');};
}
function renderSchedule(){
  const el=document.getElementById('view-schedule'),day=state.scheduleDayIndex;
  const tabs=`<div class="calendar-head"><div class="calendar-mode"><button class="${state.scheduleView==='week'?'active':''}" id="modeWeek">Semaine</button><button class="${state.scheduleView==='month'?'active':''}" id="modeMonth">Mois</button></div><button class="btn btn-sm btn-ghost" id="scheduleAdd">+ Séance</button></div>`;
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
  document.getElementById('modeWeek').onclick=()=>{state.scheduleView='week';renderSchedule();};document.getElementById('modeMonth').onclick=()=>{state.scheduleView='month';renderSchedule();};document.getElementById('scheduleAdd').onclick=()=>openSlotForm(null,state.scheduleDayIndex);
}

/* ---------- CSV import ---------- */
function parseCsv(text){
  const lines=text.replace(/\r/g,'').split('\n').filter(x=>x.trim()); if(!lines.length)return [];
  const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
  return lines.map(line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===sep&&!q){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;});
}
async function importStudentsCsv(file){
  try{const rows=parseCsv(await file.text());if(rows.length<2)throw new Error('vide');const header=rows[0].map(x=>x.toLowerCase());const nameIdx=Math.max(0,header.findIndex(x=>/nom|name/.test(x))),phoneIdx=header.findIndex(x=>/tel|phone/.test(x)),classIdx=header.findIndex(x=>/classe|class/.test(x));let added=0;for(const r of rows.slice(1)){const name=r[nameIdx]?.trim();if(!name)continue;let classId=classIdx>=0?r[classIdx]?.trim():'';let cls=state.classes.find(c=>c.name.toLowerCase()===classId.toLowerCase());if(!cls){cls=state.classes[0];}if(!cls)continue;await dbPut('students',{id:uid(),classId:cls.id,name,phone:phoneIdx>=0?(r[phoneIdx]||'').trim():'',note:'',photo:''});added++;}await loadAll();renderAll();showToast(`${added} élève(s) importé(s)`);}catch(e){console.error(e);showToast('CSV invalide ou impossible à lire','info');}}

/* ---------- Settings: theme, notifications, PIN, CSV ---------- */
async function hashPin(pin){if(globalThis.crypto?.subtle){const data=new TextEncoder().encode(pin);const buf=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');}return btoa(unescape(encodeURIComponent(pin)));}
async function setupPin(){
  const current=localStorage.getItem('classe_pin_hash');const pin=prompt(current?'Nouveau PIN (laisser vide pour annuler)':'Créer un PIN à 4–6 chiffres');if(!pin)return;if(!/^\d{4,6}$/.test(pin)){showToast('PIN de 4 à 6 chiffres requis','info');return;}localStorage.setItem('classe_pin_hash',await hashPin(pin));showToast('Verrouillage activé');}
function removePin(){localStorage.removeItem('classe_pin_hash');showToast('Verrouillage désactivé');}
async function lockApp(){const hash=localStorage.getItem('classe_pin_hash');if(!hash)return;let overlay=document.getElementById('lockScreen');if(!overlay){overlay=document.createElement('div');overlay.id='lockScreen';overlay.className='lock-screen';overlay.innerHTML=`<div class="lock-card"><div style="font-size:34px">🔐</div><h2>Classe est verrouillé</h2><p>Entre ton PIN pour accéder aux données.</p><input id="lockPin" inputmode="numeric" maxlength="6" type="password" placeholder="••••••"><button class="btn btn-primary btn-block" id="unlockBtn" style="margin-top:12px">Déverrouiller</button><div id="lockError" class="muted" style="margin-top:8px"></div></div>`;document.body.appendChild(overlay);}overlay.style.display='flex';const input=document.getElementById('lockPin');input.value='';input.focus();const unlock=async()=>{if(await hashPin(input.value)===hash){overlay.style.display='none';input.value='';}else document.getElementById('lockError').textContent='PIN incorrect.';};document.getElementById('unlockBtn').onclick=unlock;input.onkeydown=e=>{if(e.key==='Enter')unlock();};}
/* ---------- Navigation / app bootstrap enhancements ---------- */
function renderTopbar(){
  const el=document.getElementById('topbarTitle'),sub=document.getElementById('topbarSub'),ey=document.getElementById('topbarEyebrow');
  ey.textContent=getAppName();
  const titles={today:"Aujourd'hui",students:'Élèves',schedule:'Planning',homework:'Devoirs',grades:'Notes',stats:'Statistiques'};el.textContent=titles[state.currentTab]||'Classe';sub.textContent=state.currentTab==='today'?fmtDateLong(todayISO()):'';
}
function renderAll(){renderTopbar();renderToday();renderStudents();renderSchedule();renderHomework();renderGrades();renderStats();updateFab();}
function setupTabs(){
  document.querySelectorAll('.tab').forEach(tab=>tab.onclick=()=>{haptic();
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!==`view-${tab.dataset.tab}`));
    state.currentTab=tab.dataset.tab;
    renderTopbar(); updateFab(); window.scrollTo(0,0);
  });
  document.getElementById('topbarSettings').onclick=()=>{haptic();openSettings();};
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
function registerServiceWorker(){if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW:',e));}
function startNotificationLoop(){setInterval(()=>{if(localStorage.getItem('classe_notifications')!=='1'||!('Notification'in window)||Notification.permission!=='granted')return;const n=nextSlot();if(!n)return;const now=new Date(),[h,m]=n.start.split(':').map(Number),target=new Date(now);target.setHours(h,m,0,0);const diff=target-now;if(diff>0&&diff<=31*60*1000){const key=`notif_${todayISO()}_${n.id}`;if(!localStorage.getItem(key)){new Notification(`Cours dans ${Math.ceil(diff/60000)} min`,{body:`${classLabel(n.classId)} · ${n.topic||'Séance'} · ${n.start}–${n.end}`});localStorage.setItem(key,'1');}}},60000);}

applyTheme();
if(document.getElementById('printRoot')===null){const pr=document.createElement('div');pr.id='printRoot';document.body.appendChild(pr);}

// Bootstrap après toutes les définitions v3 : évite que des gestionnaires soient remplacés ou que l'état avancé soit encore absent.
(async function init(){
  try{
    await openDB();
    await loadAll();
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
