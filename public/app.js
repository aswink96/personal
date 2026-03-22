// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('token'),
  username: localStorage.getItem('username'),
  currentSpot: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(`page${name.charAt(0).toUpperCase() + name.slice(1)}`).classList.add('active');
  window.scrollTo(0, 0);

  // Update bottom nav active state
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
  if (name === 'feed') $('navHome')?.classList.add('active');
  if (name === 'create') $('navPost')?.classList.add('active');
}

function toast(msg, duration = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(id) {
  $(id).classList.add('hidden');
}

async function api(path, opts = {}) {
  const headers = { ...opts.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  if (opts.json) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function formatTimeLeft(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function formatDate(dt) {
  return new Date(dt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function updateAuthUI() {
  const loggedIn = !!state.token;
  $('navActions').style.display = loggedIn ? 'none' : 'flex';
  $('bottomNav').style.display = loggedIn ? 'flex' : 'none';
  if (loggedIn && state.username) {
    $('navUsername').textContent = state.username.substring(0, 8);
  }
}

function doLogout() {
  state.token = null;
  state.username = null;
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  updateAuthUI();
  showPage('feed');
  toast('Logged out');
}

// ── Feed ──────────────────────────────────────────────────────────────────────
async function loadFeed() {
  const list = $('feedList');
  list.innerHTML = '<div class="loader">Loading...</div>';
  try {
    const spots = await api('/api/spots');
    $('spotCount').textContent = `${spots.length} active`;
    if (spots.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🍽️</span>
          <h3>No food spots yet</h3>
          <p>Be the first to share free food!</p>
        </div>`;
      return;
    }
    list.innerHTML = spots.map(spot => renderCard(spot)).join('');
    list.querySelectorAll('.food-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><h3>Couldn't load</h3><p>${e.message}</p></div>`;
  }
}

function renderCard(spot) {
  const timeLeft = formatTimeLeft(spot.expires_at);
  const imgHtml = spot.photo
    ? `<img class="food-card-img" src="${spot.photo}" alt="${spot.title}" loading="lazy">`
    : `<div class="food-card-img-placeholder">🍛</div>`;

  return `
    <div class="food-card" data-id="${spot.id}">
      ${imgHtml}
      <div class="food-card-body">
        <div class="food-card-title">${escHtml(spot.title)}</div>
        <div class="food-card-desc">${escHtml(spot.description)}</div>
        <div class="food-card-meta">
          <span class="meta-chip">👥 ${spot.people_count} people</span>
          <span class="meta-chip location">📍 ${escHtml(spot.location.split(',')[0])}</span>
          ${timeLeft
            ? `<span class="meta-chip time">⏰ ${timeLeft}</span>`
            : `<span class="meta-chip expired">Expired</span>`}
        </div>
      </div>
    </div>`;
}

// ── Detail Page ───────────────────────────────────────────────────────────────
async function openDetail(id) {
  showPage('detail');
  $('detailContent').innerHTML = '<div class="loader" style="padding:60px">Loading...</div>';
  try {
    const spot = await api(`/api/spots/${id}`);
    state.currentSpot = spot;
    renderDetail(spot);
  } catch (e) {
    $('detailContent').innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><h3>${e.message}</h3></div>`;
  }
}

function renderDetail(spot) {
  const timeLeft = formatTimeLeft(spot.expires_at);
  const isOwner = state.token && state.username === spot.username;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.location)}`;

  const imgHtml = spot.photo
    ? `<img class="detail-img" src="${spot.photo}" alt="${escHtml(spot.title)}">`
    : `<div class="detail-img-placeholder">🍛</div>`;

  $('detailContent').innerHTML = `
    <div class="detail-wrap">
      ${imgHtml}
      <div class="detail-body">
        <div class="detail-title">${escHtml(spot.title)}</div>
        <div class="detail-chips">
          <span class="meta-chip">👥 Feeds ${spot.people_count} people</span>
          ${timeLeft
            ? `<span class="meta-chip time">⏰ ${timeLeft}</span>`
            : `<span class="meta-chip expired">⏰ Expired</span>`}
        </div>
        <div class="detail-desc">${escHtml(spot.description)}</div>

        <div class="detail-info-row">
          <span class="icon">📍</span>
          <div>
            <div class="label">Location</div>
            <div class="value">${escHtml(spot.location)}</div>
          </div>
        </div>
        <div class="detail-info-row">
          <span class="icon">⏰</span>
          <div>
            <div class="label">Available till</div>
            <div class="value">${formatDate(spot.expires_at)}</div>
          </div>
        </div>
        <div class="detail-info-row">
          <span class="icon">🗓️</span>
          <div>
            <div class="label">Posted on</div>
            <div class="value">${formatDate(spot.created_at)}</div>
          </div>
        </div>

        <div class="posted-by">
          <div class="avatar">${spot.username.charAt(0).toUpperCase()}</div>
          <div><div class="label">Shared by</div><strong>${escHtml(spot.username)}</strong></div>
        </div>

        <button class="btn-maps" onclick="window.open('${mapsUrl}','_blank')">
          🗺️ Open in Google Maps
        </button>

        ${isOwner ? `<button class="delete-btn" id="deleteBtn">🗑️ Delete this post</button>` : ''}
      </div>
    </div>`;

  if (isOwner) {
    $('deleteBtn').addEventListener('click', () => deleteSpot(spot.id));
  }
}

async function deleteSpot(id) {
  if (!confirm('Delete this food spot?')) return;
  try {
    await api(`/api/spots/${id}`, { method: 'DELETE' });
    toast('Food spot deleted');
    showPage('feed');
    loadFeed();
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

// ── Create Post ───────────────────────────────────────────────────────────────
function initCreateForm() {
  // Set min datetime to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $('expiresAt').min = now.toISOString().slice(0, 16);

  // Photo preview
  $('photoInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      $('photoPreview').src = ev.target.result;
      $('photoPreview').classList.remove('hidden');
      $('photoPlaceholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  });
}

$('createForm').addEventListener('submit', async e => {
  e.preventDefault();
  hideError('createError');
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Posting...';

  try {
    const fd = new FormData(form);
    const res = await fetch('/api/spots', {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    form.reset();
    $('photoPreview').classList.add('hidden');
    $('photoPlaceholder').classList.remove('hidden');
    toast('Food spot posted! 🎉');
    showPage('feed');
    loadFeed();
  } catch (err) {
    showError('createError', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post Food Spot';
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  hideError('loginError');
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Logging in...';

  try {
    const data = await api('/api/login', {
      method: 'POST',
      json: { email: fd.get('email'), password: fd.get('password') }
    });
    state.token = data.token;
    state.username = data.username;
    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    updateAuthUI();
    e.target.reset();
    showPage('feed');
    toast(`Welcome back, ${data.username}! 👋`);
  } catch (err) {
    showError('loginError', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});

// ── Register ──────────────────────────────────────────────────────────────────
$('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  hideError('registerError');
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const data = await api('/api/register', {
      method: 'POST',
      json: {
        username: fd.get('username'),
        email: fd.get('email'),
        password: fd.get('password')
      }
    });
    state.token = data.token;
    state.username = data.username;
    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    updateAuthUI();
    e.target.reset();
    showPage('feed');
    toast(`Welcome to Anadhaan, ${data.username}! 🎉`);
  } catch (err) {
    showError('registerError', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
});

// ── Navigation wiring ─────────────────────────────────────────────────────────
$('btnLogin').addEventListener('click', () => showPage('login'));
$('btnRegister').addEventListener('click', () => showPage('register'));
$('switchToRegister').addEventListener('click', e => { e.preventDefault(); showPage('register'); });
$('switchToLogin').addEventListener('click', e => { e.preventDefault(); showPage('login'); });

$('btnPostFood').addEventListener('click', () => {
  if (!state.token) { showPage('login'); return; }
  showPage('create');
});

$('btnBack').addEventListener('click', () => { showPage('feed'); loadFeed(); });
$('btnBackCreate').addEventListener('click', () => showPage('feed'));

$('navHome').addEventListener('click', () => { showPage('feed'); loadFeed(); });
$('navPost').addEventListener('click', () => {
  if (!state.token) { showPage('login'); return; }
  showPage('create');
});
$('navLogout').addEventListener('click', () => {
  if (confirm(`Logout, ${state.username}?`)) doLogout();
});

// ── Escape HTML ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
updateAuthUI();
initCreateForm();
loadFeed();
