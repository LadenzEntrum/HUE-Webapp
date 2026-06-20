'use strict';

const SCENES = {
  relax:       { label: 'Entspannen', state: { on: true, bri: 144, ct: 447 } },
  read:        { label: 'Lesen',      state: { on: true, bri: 240, ct: 346 } },
  concentrate: { label: 'Fokus',      state: { on: true, bri: 254, ct: 233 } },
  energize:    { label: 'Energie',    state: { on: true, bri: 254, ct: 156 } },
  bright:      { label: 'Hell',       state: { on: true, bri: 254, ct: 366 } },
  dimmed:      { label: 'Gedimmt',    state: { on: true, bri: 77,  ct: 366 } },
  nightlight:  { label: 'Nacht',      state: { on: true, bri: 1,   ct: 447 } },
};

// State
let lights = {};
let groups = {};
let refreshTimer = null;

// ── API ──────────────────────────────────────────────────────────────────────

async function apiGet(path) {
  const r = await fetch(`hue.php?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiPut(path, body) {
  const r = await fetch(`hue.php?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    [lights, groups] = await Promise.all([apiGet('/lights'), apiGet('/groups')]);
    render();
  } catch (e) {
    document.getElementById('status').innerHTML =
      `<span class="error-msg">Fehler: ${e.message} – Bridge erreichbar?</span>`;
    document.getElementById('all-control').style.display = 'none';
  } finally {
    btn.classList.remove('spinning');
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  document.getElementById('status').style.display = 'none';
  renderAllControl();
  renderRooms();
}

function renderAllControl() {
  const el = document.getElementById('all-control');
  el.style.display = 'flex';
  const c = document.getElementById('all-controls');
  c.innerHTML = '';

  // Toggle
  c.appendChild(makeToggle(
    'all-toggle',
    Object.values(lights).some(l => l.state?.on),
    v => apiPut('/groups/0/action', { on: v }).then(fetchAll)
  ));

  // Brightness
  c.appendChild(makeSlider('bri', 'bri', 1, 254,
    avgBri(Object.values(lights).filter(l => l.state?.on).map(l => l.state?.bri ?? 127)),
    v => apiPut('/groups/0/action', { on: true, bri: v })
  ));

  // CT
  c.appendChild(makeSlider('ct', 'ct', 153, 500,
    avgBri(Object.values(lights).filter(l => l.state?.on && l.state?.ct).map(l => l.state.ct ?? 366)),
    v => apiPut('/groups/0/action', { on: true, ct: v })
  ));
}

function renderRooms() {
  const container = document.getElementById('rooms');

  // Remember expanded state before re-render
  const expanded = {};
  container.querySelectorAll('.room-card').forEach(card => {
    const gid = card.dataset.gid;
    const list = card.querySelector('.lights-list');
    if (list && list.style.display !== 'none') expanded[gid] = true;
  });

  container.innerHTML = '';

  const rooms = Object.entries(groups)
    .filter(([, g]) => g.type === 'Room' || g.type === 'Zone')
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  if (rooms.length === 0) {
    document.getElementById('status').textContent = 'Keine Räume gefunden.';
    document.getElementById('status').style.display = 'block';
    return;
  }

  rooms.forEach(([gid, group]) => {
    container.appendChild(makeRoomCard(gid, group, expanded[gid]));
  });
}

// ── Room card ────────────────────────────────────────────────────────────────

function makeRoomCard(gid, group, startExpanded) {
  const action   = group.action || {};
  const isOn     = action.on === true;
  const lightIds = group.lights || [];
  const roomLights = lightIds.map(id => ({ id, ...lights[id] })).filter(l => l.name);

  const card = el('div', 'room-card' + (isOn ? ' is-on' : ''));
  card.dataset.gid = gid;

  // ── Header (toggle + name) ──
  const header = el('div', 'room-header');
  const toggle = makeToggle(`toggle-${gid}`, isOn, v => {
    apiPut(`/groups/${gid}/action`, { on: v }).then(fetchAll);
  });
  const nameEl = el('span', 'room-name');
  nameEl.textContent = group.name;
  const countEl = el('span', 'light-count');
  countEl.textContent = `${lightIds.length} Lampe${lightIds.length !== 1 ? 'n' : ''}`;
  header.append(toggle, nameEl, countEl);
  card.appendChild(header);

  // ── Body ──
  const body = el('div', 'room-body');

  // Brightness
  const curBri = isOn ? (action.bri ?? 127) : 0;
  body.appendChild(makeSlider('bri', 'ct', 1, 254, curBri,
    v => apiPut(`/groups/${gid}/action`, { on: true, bri: v })
  ));

  // Color temperature
  const curCt = action.ct ?? 366;
  body.appendChild(makeSlider('ct', 'ct', 153, 500, curCt,
    v => apiPut(`/groups/${gid}/action`, { on: true, ct: v })
  ));

  // Scenes
  const scenesEl = el('div', 'scenes');
  Object.entries(SCENES).forEach(([key, scene]) => {
    const btn = el('button', 'scene-btn');
    btn.textContent = scene.label;
    // Rough "active" detection: match bri + ct within tolerance
    if (isOn && Math.abs((action.bri ?? 0) - scene.state.bri) < 10 &&
        Math.abs((action.ct  ?? 0) - scene.state.ct)  < 10) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      apiPut(`/groups/${gid}/action`, scene.state).then(fetchAll);
    });
    scenesEl.appendChild(btn);
  });
  body.appendChild(scenesEl);

  // Individual lights (expandable)
  if (roomLights.length > 0) {
    const expandRow = el('div', 'lights-toggle-row');
    const expandLabel = el('span');
    expandLabel.textContent = 'Einzelne Lampen';
    const arrow = el('span', 'expand-arrow' + (startExpanded ? ' open' : ''));
    arrow.textContent = '▼';
    expandRow.append(expandLabel, arrow);

    const lightsList = el('div', 'lights-list');
    lightsList.style.display = startExpanded ? 'flex' : 'none';

    roomLights.forEach(light => {
      lightsList.appendChild(makeLightRow(light));
    });

    expandRow.addEventListener('click', () => {
      const open = lightsList.style.display !== 'none';
      lightsList.style.display = open ? 'none' : 'flex';
      arrow.classList.toggle('open', !open);
    });

    body.append(expandRow, lightsList);
  }

  card.appendChild(body);
  return card;
}

function makeLightRow(light) {
  const row  = el('div', 'light-row');
  const name = el('span', 'light-name' + (light.state?.reachable === false ? ' unreachable' : ''));
  name.textContent = light.name;
  const bri = el('span', 'light-bri');
  bri.textContent = light.state?.on
    ? `${Math.round((light.state.bri ?? 0) / 254 * 100)}%`
    : 'aus';

  const tog = makeToggle(`light-tog-${light.id}`, light.state?.on ?? false, v => {
    apiPut(`/lights/${light.id}/state`, { on: v }).then(fetchAll);
  });

  row.append(name, bri, tog);
  return row;
}

// ── Widgets ──────────────────────────────────────────────────────────────────

function makeToggle(id, checked, onChange) {
  const label = el('label', 'toggle');
  const input = el('input');
  input.type = 'checkbox';
  input.id   = id;
  input.checked = checked;
  const track = el('span', 'track');
  const thumb = el('span', 'thumb');
  input.addEventListener('change', () => onChange(input.checked));
  label.append(input, track, thumb);
  return label;
}

function makeSlider(type, cssClass, min, max, value, onCommit) {
  const row   = el('div', 'slider-row');
  const label = el('span', 'slider-label');
  const valEl = el('span', 'slider-val');
  const input = el('input');

  if (type === 'bri') {
    label.textContent = '☀️';
    valEl.textContent = `${Math.round((value / 254) * 100)}%`;
  } else {
    label.textContent = '🌡️';
    valEl.textContent = `${value}`;
  }

  input.type  = 'range';
  input.min   = min;
  input.max   = max;
  input.value = value;
  input.className = type === 'bri' ? 'bri-slider' : 'ct-slider';

  input.addEventListener('input', () => {
    const v = parseInt(input.value, 10);
    if (type === 'bri') valEl.textContent = `${Math.round((v / 254) * 100)}%`;
    else valEl.textContent = `${v}`;
  });

  let debounce;
  input.addEventListener('change', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => onCommit(parseInt(input.value, 10)), 200);
  });

  row.append(label, input, valEl);
  return row;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function avgBri(values) {
  if (!values.length) return 127;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

document.getElementById('refresh-btn').addEventListener('click', () => {
  clearInterval(refreshTimer);
  fetchAll().then(() => { refreshTimer = setInterval(fetchAll, 10000); });
});

fetchAll().then(() => {
  refreshTimer = setInterval(fetchAll, 10000);
});
