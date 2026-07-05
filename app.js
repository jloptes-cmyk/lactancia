const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'gota-a-gota-v2';
const defaults = { settings:{motiliumStart:'08:00',motiliumEvery:8,pumpStart:'08:00',pumpEvery:3,nightPump:'04:30'}, entries:[] };
let state = load(); let deferredPrompt = null; let currentNext = null; let timers=[];
function load(){ try{return JSON.parse(localStorage.getItem(KEY)) || structuredClone(defaults)}catch{return structuredClone(defaults)} }
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowTime(){ return new Date().toTimeString().slice(0,5); }
function fmtDate(d=new Date()){ return d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}); }
function minutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function timeFromMin(n){ n=(n+1440)%1440; return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
function icon(type){ return {pump:'🍼',power:'⚡',breast:'❤️',motilium:'💊',night:'🌙'}[type] || '💧'; }
function label(type){ return {pump:'Sacaleches',power:'Extracción poderosa',breast:'Niña al pecho',motilium:'Motilium',night:'Sacaleches noche'}[type] || type; }
function dayEntries(date=todayISO()){ return state.entries.filter(e=>e.date===date).sort((a,b)=>a.time.localeCompare(b.time)); }
function milkTotal(e){ return (+e.leftMl||0)+(+e.rightMl||0); }
function weekStart(d=new Date()){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function dateAdd(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function iso(d){ return d.toISOString().slice(0,10); }
function dayMilk(date){ return state.entries.filter(e=>e.date===date && ['pump','power'].includes(e.type)).reduce((s,e)=>s+milkTotal(e),0); }
function getSchedule(date=todayISO()){
  const s=state.settings, items=[];
  for(let m=minutes(s.pumpStart); m<24*60; m+=Number(s.pumpEvery)*60) items.push({type:'pump', time:timeFromMin(m), title:'Sacaleches'});
  [s.nightPump].forEach(t=>items.push({type:'night', time:t, title:'Sacaleches noche'}));
  for(let m=minutes(s.motiliumStart); m<24*60; m+=Number(s.motiliumEvery)*60) items.push({type:'motilium', time:timeFromMin(m), title:'Motilium'});
  return items.sort((a,b)=>a.time.localeCompare(b.time)).map((it,i)=>({...it,id:`${date}-${it.type}-${it.time}-${i}`}));
}
function isDone(item,date=todayISO()){ return state.entries.some(e=>e.date===date && (e.type===item.type || (item.type==='night'&&e.type==='pump')) && Math.abs(minutes(e.time)-minutes(item.time))<=45); }
function nextItem(){ const n=new Date(), cur=n.getHours()*60+n.getMinutes(); const sched=getSchedule().filter(i=>!isDone(i)); return sched.find(i=>minutes(i.time)>=cur) || sched[0]; }
function render(){
  const hour=new Date().getHours(); document.body.classList.toggle('night', hour>=22 || hour<7);
  $('#todayLabel').textContent = fmtDate(); $('#helloText').textContent = hour<12?'Buenos días':hour<20?'Buenas tardes':'Buenas noches';
  const messages=['Cada gota cuenta.','Un día más cerca de vuestro objetivo.','La recuperación es un proceso, no una carrera.','Hoy también estás haciendo un gran trabajo.','Poquito a poquito, gota a gota.'];
  $('#encouragement').textContent = messages[new Date().getDate()%messages.length];
  const entries=dayEntries(), total=dayMilk(), pumpEntries=entries.filter(e=>['pump','power'].includes(e.type)), breast=entries.filter(e=>e.type==='breast').length, mot=entries.filter(e=>e.type==='motilium').length;
  $('#dailyTotal').textContent = `${total} ml`; $('#pumpCount').textContent = `${pumpEntries.length} extracciones`; $('#breastCount').textContent = `${breast} tomas al pecho`; $('#motiliumCount').textContent = `${mot}/3 Motilium`;
  $('#bottleFill').style.height = `${Math.min(100, total/8)}%`;
  currentNext = nextItem();
  if(currentNext){ $('#nextIcon').textContent=icon(currentNext.type); $('#nextTitle').textContent=currentNext.title; $('#nextTime').textContent=currentNext.time; updateCountdown(); }
  renderTimeline(); renderEntries(); renderProgress(); scheduleNotifications();
}
function updateCountdown(){ if(!currentNext) return; const now=new Date(); let target=new Date(); const [h,m]=currentNext.time.split(':').map(Number); target.setHours(h,m,0,0); if(target<now) target.setDate(target.getDate()+1); const diff=Math.max(0,target-now); const mins=Math.floor(diff/60000); $('#nextCountdown').textContent = mins<60?`en ${mins} min`:`en ${Math.floor(mins/60)} h ${mins%60} min`; }
setInterval(updateCountdown,30000);
function renderTimeline(){
  const doneEntries=dayEntries().map(e=>({type:e.type,time:e.time,title:label(e.type), sub: ['pump','power'].includes(e.type)?`${milkTotal(e)} ml`: e.type==='breast'?`${e.duration||0} min ${e.breastSide||''}`:'' , done:true, real:true}));
  const plan=getSchedule().map(i=>({...i,done:isDone(i),sub:i.done?'Hecho':''}));
  const all=[...plan,...doneEntries].sort((a,b)=>a.time.localeCompare(b.time));
  $('#timeline').innerHTML = all.map(i=>`<div class="time-item ${i.done?'done':''}"><strong>${i.time}</strong><div class="time-dot">${icon(i.type)}</div><div><div class="time-title">${i.title}</div><div class="time-sub">${i.sub|| (i.real?'Registrado':'Pendiente')}</div></div><div class="done-badge">${i.done?'✓':'○'}</div></div>`).join('') || '<p class="muted">Aún no hay plan para hoy.</p>';
}
function renderEntries(){
  const list=dayEntries(); $('#entriesList').innerHTML = list.length?list.map(e=>`<div class="entry"><div><strong>${icon(e.type)} ${label(e.type)} · ${e.time}</strong><small>${['pump','power'].includes(e.type)?`Izq ${e.leftMl||0} ml · Der ${e.rightMl||0} ml`: e.type==='breast'?`${e.duration||0} min · ${e.breastSide||'sin pecho'} · ${e.babyMood||''}`: 'Tomado'}${e.notes?` · ${e.notes}`:''}</small></div><strong>${['pump','power'].includes(e.type)?milkTotal(e)+' ml':'✓'}</strong></div>`).join(''):'<p class="muted">Todavía no has guardado registros hoy.</p>';
}
function renderProgress(){
  const start=weekStart(), days=[0,1,2,3,4,5,6].map(n=>dateAdd(start,n)), vals=days.map(d=>dayMilk(iso(d))), week=vals.reduce((a,b)=>a+b,0);
  $('#weeklyTotal').textContent=`${week} ml`;
  const prevStart=dateAdd(start,-7), prev=[0,1,2,3,4,5,6].map(n=>dayMilk(iso(dateAdd(prevStart,n)))).reduce((a,b)=>a+b,0);
  $('#weeklyDelta').textContent = prev?`${week>=prev?'↑':'↓'} ${Math.round(((week-prev)/prev)*100)}% respecto a la semana anterior (${week-prev>=0?'+':''}${week-prev} ml)`:'Aún no hay datos de la semana anterior.';
  const pumps=state.entries.filter(e=>['pump','power'].includes(e.type)); const totals=pumps.map(milkTotal); const sum=totals.reduce((a,b)=>a+b,0);
  $('#bestPump').textContent=`${Math.max(0,...totals)} ml`; $('#avgPump').textContent=`${totals.length?Math.round(sum/totals.length):0} ml`; $('#leftTotal').textContent=`${pumps.reduce((s,e)=>s+(+e.leftMl||0),0)} ml`; $('#rightTotal').textContent=`${pumps.reduce((s,e)=>s+(+e.rightMl||0),0)} ml`;
  $('#weekSummary').innerHTML = days.map((d,i)=>`<div class="summary-row"><div><strong>${d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric'})}</strong><br><small>${state.entries.filter(e=>e.date===iso(d)).length} registros</small></div><strong>${vals[i]} ml</strong></div>`).join('');
  drawChart(vals, days);
}
function drawChart(vals,days){ const c=$('#weekChart'), ctx=c.getContext('2d'), w=c.width,h=c.height; ctx.clearRect(0,0,w,h); const max=Math.max(100,...vals); ctx.font='24px system-ui'; ctx.fillStyle='#7d7480'; ctx.fillText('ml por día',20,35); vals.forEach((v,i)=>{ const x=50+i*(w-80)/7, barW=48, bh=(h-100)*v/max; const y=h-55-bh; const grad=ctx.createLinearGradient(0,y,0,h-55); grad.addColorStop(0,'#f36b9c'); grad.addColorStop(1,'#ffdce9'); ctx.fillStyle=grad; roundRect(ctx,x,y,barW,bh,14); ctx.fill(); ctx.fillStyle='#7d7480'; ctx.font='18px system-ui'; ctx.fillText(days[i].toLocaleDateString('es-ES',{weekday:'short'}),x-2,h-20); }); }
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function setType(type){ $('#entryType').value=type; $$('.type-chip').forEach(b=>b.classList.toggle('active',b.dataset.type===type)); const milk=['pump','power'].includes(type); $('#milkBlock').style.display=milk?'block':'none'; $('#breastBlock').style.display=type==='breast'?'block':'none'; }
function openLog(type){ $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab==='log')); $$('.view').forEach(v=>v.classList.toggle('active',v.id==='log')); setType(type); $('#entryDate').value=todayISO(); $('#entryTime').value=nowTime(); window.scrollTo(0,0); }
function updateMilkTotal(){ $('#entryTotal').textContent=`Total: ${(+$('#leftMl').value||0)+(+$('#rightMl').value||0)} ml`; }
function toast(msg='Guardado ✨'){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); }
$('#entryForm').addEventListener('submit', e=>{ e.preventDefault(); const type=$('#entryType').value; const entry={id:crypto.randomUUID(), type, date:$('#entryDate').value, time:$('#entryTime').value, leftMl:+$('#leftMl').value||0, rightMl:+$('#rightMl').value||0, duration:+$('#entryDuration').value||0, breastSide:$('#breastSide').value, babyMood:$('#babyMood').value, notes:$('#entryNotes').value.trim()}; state.entries.push(entry); save(); toast(type==='motilium'?'Motilium registrado 💊':'Guardado ✨'); $('#entryForm').reset(); $('#entryDate').value=todayISO(); $('#entryTime').value=nowTime(); $('#leftMl').value=0; $('#rightMl').value=0; updateMilkTotal(); render(); });
$$('.type-chip').forEach(b=>b.addEventListener('click',()=>setType(b.dataset.type))); $$('.quick-action').forEach(b=>b.addEventListener('click',()=>openLog(b.dataset.type)));
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>{ $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.view').forEach(v=>v.classList.toggle('active',v.id===b.dataset.tab)); window.scrollTo(0,0); }));
$$('.stepper button').forEach(b=>b.addEventListener('click',()=>{ const input=$('#'+b.dataset.field); input.value=Math.max(0,(+input.value||0)+(+b.dataset.step)); updateMilkTotal(); })); ['leftMl','rightMl'].forEach(id=>$('#'+id).addEventListener('input',updateMilkTotal));
$('#quickDoneBtn').addEventListener('click',()=> currentNext && openLog(currentNext.type==='night'?'pump':currentNext.type));
$('#closeFormBtn').addEventListener('click',()=>{$('#entryForm').reset(); $('#entryDate').value=todayISO(); $('#entryTime').value=nowTime(); $('#leftMl').value=0; $('#rightMl').value=0; updateMilkTotal();});
$('#settingsForm').addEventListener('submit',e=>{ e.preventDefault(); state.settings={motiliumStart:$('#motiliumStart').value,motiliumEvery:+$('#motiliumEvery').value,pumpStart:$('#pumpStart').value,pumpEvery:+$('#pumpEvery').value,nightPump:$('#nightPump').value}; save(); toast('Ajustes guardados'); render(); });
$('#rebuildBtn').addEventListener('click',()=>{toast('Plan recalculado'); render();});
$('#clearBtn').addEventListener('click',()=>{ if(confirm('¿Borrar todos los datos?')){ state=structuredClone(defaults); save(); location.reload(); }});
$('#exportBtn').addEventListener('click',()=>{ const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gota-a-gota-datos.json'; a.click(); });
$('#notifyBtn').addEventListener('click',async()=>{ if(!('Notification' in window)) return alert('Este navegador no permite notificaciones.'); const p=await Notification.requestPermission(); toast(p==='granted'?'Notificaciones activadas':'Permiso no concedido'); render(); });
function scheduleNotifications(){ timers.forEach(clearTimeout); timers=[]; if(!('Notification' in window)||Notification.permission!=='granted') return; const now=new Date(); getSchedule().filter(i=>!isDone(i)).forEach(i=>{ const [h,m]=i.time.split(':').map(Number); const t=new Date(); t.setHours(h,m,0,0); if(t>now){ const delay=t-now; if(delay<2147483647) timers.push(setTimeout(()=>new Notification(`Gota a Gota: ${i.title}`,{body:'Cada gota cuenta. Toca registrar este paso 💧',icon:'icon-192.png'}),delay)); } }); }
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredPrompt=e; $('#installBtn').classList.remove('hidden'); }); $('#installBtn').addEventListener('click',async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; $('#installBtn').classList.add('hidden'); }});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
function init(){ $('#entryDate').value=todayISO(); $('#entryTime').value=nowTime(); const s=state.settings; Object.entries(s).forEach(([k,v])=>{ const el=$('#'+k); if(el) el.value=v; }); setType('pump'); updateMilkTotal(); render(); }
init();
