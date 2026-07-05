(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const KEY = 'gota-a-gota-v3';
  const OLD_KEYS = ['gota-a-gota-v2', 'gota-a-gota'];
  const defaultState = {
    settings: { motiliumStart: '08:00', pumpStart: '08:00', nightPump: '04:00', pumpEvery: 3 },
    entries: [],
    created: new Date().toISOString()
  };

  const icons = { pump: '🍼', breast: '❤️', motilium: '💊', power: '⚡' };
  const labels = { pump: 'Sacaleches', breast: 'Lactancia', motilium: 'Motilium', power: 'Extracción poderosa' };
  const milkTypes = new Set(['pump', 'power']);
  let state = loadState();
  let lastNotificationMinute = '';

  function loadState() {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const k of OLD_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) break;
      }
    }
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      return normalizeState(parsed || defaultState);
    } catch {
      return structuredClone(defaultState);
    }
  }

  function normalizeState(s) {
    const merged = {
      settings: { ...defaultState.settings, ...(s.settings || {}) },
      entries: Array.isArray(s.entries) ? s.entries : [],
      created: s.created || new Date().toISOString()
    };
    merged.entries = merged.entries.map(e => ({
      id: e.id || makeId(),
      type: e.type || 'pump',
      date: e.date || localDate(),
      time: e.time || localTime(),
      left: Number(e.left || 0),
      right: Number(e.right || 0),
      duration: Number(e.duration || 0),
      side: e.side || 'Ambos',
      mood: e.mood || '',
      notes: e.notes || '',
      completed: e.completed !== false,
      scheduledTime: e.scheduledTime || e.time
    }));
    return merged;
  }

  function makeId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function localDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function localTime(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function minutes(t) { const [h, m] = String(t || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
  function toTime(min) { min = ((min % 1440) + 1440) % 1440; return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
  function today() { return localDate(); }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); render(); }

  function entriesFor(date = today()) {
    return state.entries.filter(e => e.date === date).sort((a, b) => a.time.localeCompare(b.time));
  }
  function milkTotal(list = entriesFor()) {
    return list.reduce((sum, e) => sum + (milkTypes.has(e.type) ? Number(e.left || 0) + Number(e.right || 0) : 0), 0);
  }
  function count(type, list = entriesFor()) { return list.filter(e => e.type === type).length; }

  function scheduleForDay() {
    const s = state.settings;
    const arr = [];
    for (let m = minutes(s.motiliumStart); m < 1440; m += 8 * 60) arr.push({ time: toTime(m), type: 'motilium' });
    for (let m = minutes(s.pumpStart); m < 22 * 60; m += Number(s.pumpEvery || 3) * 60) arr.push({ time: toTime(m), type: 'pump' });
    arr.push({ time: s.nightPump || '04:00', type: 'pump', night: true });
    return arr.sort((a, b) => minutes(a.time) - minutes(b.time));
  }

  function matchingEntry(item) {
    return entriesFor().find(e => e.type === item.type && Math.abs(minutes(e.scheduledTime || e.time) - minutes(item.time)) <= 35);
  }
  function isDone(item) { return Boolean(matchingEntry(item)); }
  function nextEvent() {
    const now = minutes(localTime());
    return scheduleForDay().find(x => minutes(x.time) >= now && !isDone(x)) || scheduleForDay().find(x => !isDone(x)) || scheduleForDay()[0];
  }

  function dateText() {
    $('#dateLabel').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const h = new Date().getHours();
    $('#greeting').textContent = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    document.body.classList.toggle('night', h >= 22 || h < 7);
  }

  function renderHome() {
    const list = entriesFor();
    const ml = milkTotal(list);
    $('#todayMl').textContent = `${ml} ml`;
    $('#pumpStat').textContent = `${count('pump', list) + count('power', list)} extracciones`;
    $('#breastStat').textContent = `${count('breast', list)} tomas`;
    $('#pillStat').textContent = `${count('motilium', list)}/3 💊`;

    const pct = Math.min(1, ml / 700);
    const fillHeight = Math.round(150 * pct);
    $('#milkFill').setAttribute('y', 180 - fillHeight);
    $('#milkFill').setAttribute('height', fillHeight);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yMl = milkTotal(entriesFor(localDate(yesterday)));
    $('#trendText').textContent = yMl
      ? (ml >= yMl ? `Vas ${ml - yMl} ml por encima de ayer 🎉` : `Ayer cerraste con ${yMl} ml. Seguimos paso a paso.`)
      : 'Empieza con el primer registro de hoy.';

    const n = nextEvent();
    $('#nextEmoji').textContent = icons[n.type];
    $('#nextTitle').textContent = labels[n.type];
    $('#nextTime').textContent = n.time;
    let diff = minutes(n.time) - minutes(localTime());
    if (diff < 0) diff += 1440;
    $('#nextSub').textContent = diff === 0 ? 'Ahora' : `faltan ${Math.floor(diff / 60)} h ${diff % 60} min`;

    const tl = $('#timeline');
    tl.innerHTML = '';
    scheduleForDay().forEach(item => {
      const entry = matchingEntry(item);
      const row = document.createElement('div');
      row.className = `time-row ${entry ? 'done' : ''}`;
      row.innerHTML = `
        <span class="time">${item.time}</span>
        <span>${icons[item.type]}</span>
        <span>${labels[item.type]}</span>
        <button class="status" type="button" aria-label="${entry ? 'Editar' : 'Marcar hecho'}">${entry ? '✓' : '○'}</button>`;
      row.addEventListener('click', () => entry ? editEntry(entry.id) : openSheet(item.type, item.time));
      $('.status', row).addEventListener('click', ev => {
        ev.stopPropagation();
        entry ? editEntry(entry.id) : markDone(item);
      });
      tl.append(row);
    });
  }

  function renderEntries() {
    const box = $('#entriesList');
    const list = entriesFor();
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<article class="card muted">Todavía no hay registros hoy.</article>';
      return;
    }
    list.forEach(e => {
      const total = Number(e.left || 0) + Number(e.right || 0);
      const detail = e.type === 'breast' ? `${e.duration || 0} min · ${e.side || 'Ambos'}` : e.type === 'motilium' ? 'Tomado' : `${total} ml`;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'entry-row done';
      row.innerHTML = `<span class="time">${e.time}</span><span>${icons[e.type]}</span><span><b>${labels[e.type]}</b><br><small>${detail}</small></span><span>›</span>`;
      row.addEventListener('click', () => editEntry(e.id));
      box.append(row);
    });
  }

  function last7() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = localDate(d);
      days.push({ iso, label: d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 2), ml: milkTotal(entriesFor(iso)) });
    }
    return days;
  }
  function renderProgress() {
    const days = last7();
    const sum = days.reduce((a, d) => a + d.ml, 0);
    $('#weekTotal').textContent = `${sum} ml esta semana`;
    let prev = 0;
    for (let i = 13; i >= 7; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      prev += milkTotal(entriesFor(localDate(d)));
    }
    $('#weekCompare').textContent = prev ? `${sum >= prev ? '↑' : '↓'} ${Math.abs(Math.round((sum - prev) / prev * 100))}% respecto a la semana anterior` : 'Cuando haya más días, verás la comparación semanal.';
    const max = Math.max(...days.map(d => d.ml), 1);
    $('#bars').innerHTML = days.map(d => `<div class="bar" style="height:${Math.max(8, d.ml / max * 140)}px" title="${d.ml} ml"><span>${d.label}</span></div>`).join('');
    const milkEntries = state.entries.filter(e => milkTypes.has(e.type));
    const totals = milkEntries.map(e => Number(e.left || 0) + Number(e.right || 0));
    $('#avgPump').textContent = `${totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0} ml`;
    $('#recordPump').textContent = `${Math.max(...totals, 0)} ml`;
    $('#leftTotal').textContent = `${milkEntries.reduce((s, e) => s + Number(e.left || 0), 0)} ml`;
    $('#rightTotal').textContent = `${milkEntries.reduce((s, e) => s + Number(e.right || 0), 0)} ml`;
  }
  function renderStory() {
    const days = Math.max(1, Math.ceil((new Date() - new Date(state.created)) / 864e5));
    $('#daysUsing').textContent = `${days} día${days > 1 ? 's' : ''}`;
    $('#allMilk').textContent = `${milkTotal(state.entries)} ml`;
    $('#allPumps').textContent = state.entries.filter(e => milkTypes.has(e.type)).length;
    $('#allBreasts').textContent = state.entries.filter(e => e.type === 'breast').length;
  }
  function renderSettings() {
    const s = state.settings;
    $('#motiliumStart').value = s.motiliumStart;
    $('#pumpStart').value = s.pumpStart;
    $('#nightPump').value = s.nightPump;
    $('#pumpEvery').value = s.pumpEvery;
  }
  function render() { dateText(); renderHome(); renderEntries(); renderProgress(); renderStory(); renderSettings(); }

  function setTab(tab) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#screen-${tab}`)?.classList.add('active');
    $$('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  }
  function updateTypeUI() {
    const type = $('#entryType').value;
    $$('#typePicker button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    $('#milkFields').classList.toggle('hidden', !milkTypes.has(type));
    $('#breastFields').classList.toggle('hidden', type !== 'breast');
    updateFormTotal();
  }
  function updateFormTotal() {
    $('#formTotal').textContent = `Total: ${(Number($('#leftMl').value) || 0) + (Number($('#rightMl').value) || 0)} ml`;
  }
  function openSheet(type = 'pump', time = localTime()) {
    $('#sheet').classList.remove('hidden');
    $('#sheetTitle').textContent = 'Nuevo registro';
    $('#editingId').value = '';
    $('#entryType').value = type;
    $('#entryDate').value = today();
    $('#entryTime').value = time;
    $('#leftMl').value = 0;
    $('#rightMl').value = 0;
    $('#duration').value = '';
    $('#side').value = 'Ambos';
    $('#mood').value = '';
    $('#notes').value = '';
    $('#deleteEntry').classList.add('hidden');
    updateTypeUI();
  }
  function editEntry(id) {
    const e = state.entries.find(x => x.id === id);
    if (!e) return;
    $('#sheet').classList.remove('hidden');
    $('#sheetTitle').textContent = 'Editar registro';
    $('#editingId').value = e.id;
    $('#entryType').value = e.type;
    $('#entryDate').value = e.date;
    $('#entryTime').value = e.time;
    $('#leftMl').value = e.left || 0;
    $('#rightMl').value = e.right || 0;
    $('#duration').value = e.duration || '';
    $('#side').value = e.side || 'Ambos';
    $('#mood').value = e.mood || '';
    $('#notes').value = e.notes || '';
    $('#deleteEntry').classList.remove('hidden');
    updateTypeUI();
  }
  function entryFromForm() {
    const type = $('#entryType').value;
    return {
      id: $('#editingId').value || makeId(),
      type,
      date: $('#entryDate').value || today(),
      time: $('#entryTime').value || localTime(),
      scheduledTime: $('#entryTime').value || localTime(),
      left: milkTypes.has(type) ? Number($('#leftMl').value || 0) : 0,
      right: milkTypes.has(type) ? Number($('#rightMl').value || 0) : 0,
      duration: type === 'breast' ? Number($('#duration').value || 0) : 0,
      side: type === 'breast' ? $('#side').value : '',
      mood: type === 'breast' ? $('#mood').value : '',
      notes: $('#notes').value || '',
      completed: true
    };
  }
  function markDone(item) {
    const e = {
      id: makeId(), type: item.type, date: today(), time: localTime(), scheduledTime: item.time,
      left: 0, right: 0, duration: 0, side: '', mood: '', notes: `Programado ${item.time}`, completed: true
    };
    state.entries.push(e);
    save();
    showToast(`✓ ${labels[item.type]} marcado`);
  }
  function showToast(text) {
    $('#toast').textContent = text;
    $('#toast').classList.remove('hidden');
    $('#bottleWrap .bottle')?.classList.add('bump');
    if (navigator.vibrate) navigator.vibrate(35);
    setTimeout(() => {
      $('#toast').classList.add('hidden');
      $('#bottleWrap .bottle')?.classList.remove('bump');
    }, 1000);
  }

  function initEvents() {
    $$('#typePicker button').forEach(b => { b.type = 'button'; b.addEventListener('click', () => { $('#entryType').value = b.dataset.type; updateTypeUI(); }); });
    $$('.bottom-nav button').forEach(b => { b.type = 'button'; b.addEventListener('click', () => setTab(b.dataset.tab)); });
    $$('[data-open]').forEach(b => { b.type = 'button'; b.addEventListener('click', () => openSheet(b.dataset.open)); });
    $('#fab').addEventListener('click', () => openSheet('pump'));
    $('#newEntry').addEventListener('click', () => openSheet('pump'));
    $('#closeSheet').addEventListener('click', () => $('#sheet').classList.add('hidden'));
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') $('#sheet').classList.add('hidden'); });
    ['leftMl', 'rightMl'].forEach(id => $(`#${id}`).addEventListener('input', updateFormTotal));
    $('#entryForm').addEventListener('submit', e => {
      e.preventDefault();
      const entry = entryFromForm();
      const i = state.entries.findIndex(x => x.id === entry.id);
      if (i >= 0) state.entries[i] = entry; else state.entries.push(entry);
      $('#sheet').classList.add('hidden');
      save();
      const ml = entry.left + entry.right;
      showToast(entry.type === 'motilium' ? '✨ Motilium guardado' : milkTypes.has(entry.type) ? `✨ ${ml} ml guardados` : '✨ Registro guardado');
    });
    $('#deleteEntry').addEventListener('click', () => {
      const id = $('#editingId').value;
      if (!id) return;
      if (confirm('¿Eliminar este registro?')) {
        state.entries = state.entries.filter(e => e.id !== id);
        $('#sheet').classList.add('hidden');
        save();
        showToast('Registro eliminado');
      }
    });
    $('#quickDone').addEventListener('click', () => markDone(nextEvent()));
    $('#recalc').addEventListener('click', render);
    $('#saveSettings').addEventListener('click', () => {
      state.settings = {
        motiliumStart: $('#motiliumStart').value || '08:00',
        pumpStart: $('#pumpStart').value || '08:00',
        nightPump: $('#nightPump').value || '04:00',
        pumpEvery: Number($('#pumpEvery').value || 3)
      };
      save();
      showToast('✨ Ajustes guardados');
    });
    $('#clearData').addEventListener('click', () => {
      if (confirm('¿Borrar todos los registros?')) {
        state = normalizeState({ ...defaultState, created: new Date().toISOString(), entries: [] });
        save();
        showToast('Datos borrados');
      }
    });
    $('#exportData').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gota-a-gota-${today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('#enableNotifications').addEventListener('click', async () => {
      if (!('Notification' in window)) return alert('Este navegador no soporta notificaciones.');
      const p = await Notification.requestPermission();
      showToast(p === 'granted' ? '🔔 Notificaciones activadas' : 'No se activaron');
    });
  }

  function initInstallAndNotifications() {
    let deferred;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); deferred = e; $('#installBtn').classList.remove('hidden');
    });
    $('#installBtn').addEventListener('click', () => deferred?.prompt());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
    setInterval(() => {
      const n = nextEvent();
      const now = localTime();
      if (now === n.time && lastNotificationMinute !== now && 'Notification' in window && Notification.permission === 'granted') {
        lastNotificationMinute = now;
        new Notification('Gota a Gota', { body: `Ahora toca: ${labels[n.type]}. Cada gota cuenta 💜`, icon: 'icon-192.png' });
      }
      renderHome();
    }, 60000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    initInstallAndNotifications();
    render();
  });
})();
