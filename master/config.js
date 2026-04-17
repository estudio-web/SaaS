import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, updateDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp({
  apiKey: "AIzaSyCC3KTx8ZJatJXBySljIworEdB_REqqTG4",
  authDomain: "saas-9e0a1.firebaseapp.com",
  projectId: "saas-9e0a1",
  storageBucket: "saas-9e0a1.firebasestorage.app",
  messagingSenderId: "1062277368867",
  appId: "1:1062277368867:web:1dfe147e526d3c84583596"
});

const db   = getFirestore(app);
const auth = getAuth(app);

const grid       = document.getElementById('grid');
const modal      = document.getElementById('loginModal');
const userEmail  = document.getElementById('userEmail');
const loginError = document.getElementById('loginError');

let allNegocios   = [];
let currentFilter = 'todos';
let editingId     = null;

// ── TOAST ──
function showToast(msg, duration = 2800) {
  const t = document.getElementById('masterToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── LOGIN ──
window.login = async () => {
  const email = document.getElementById('email').value.trim();
  const pass  = document.getElementById('pass').value;
  loginError.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    loginError.style.display = 'block';
  }
};

// ── LOGOUT ──
window.logout = async () => { await signOut(auth); };

// ── FILTRO ──
window.setFilter = (filter, el) => {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderGrid();
};

// ── VERIFICAR ADMIN ──
async function esAdmin(uid) {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

// ── SESIÓN ──
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    modal.style.display = 'flex';
    grid.innerHTML = '';
    userEmail.textContent = '';
    return;
  }
  const isAdmin = await esAdmin(user.uid);
  if (!isAdmin) {
    alert("No tenés acceso de administrador.");
    await signOut(auth);
    return;
  }
  modal.style.display = 'none';
  userEmail.textContent = user.email;
  loadNegocios();
});

// ── HELPERS ──
function initials(nombre) {
  if (!nombre) return '?';
  const parts = nombre.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : nombre.slice(0, 2).toUpperCase();
}

function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
}

function buildStoreURL(negocioId) {
  const base = window.location.origin +
    window.location.pathname.replace(/master\/.*$/, 'public/index.html');
  return `${base}?n=${negocioId}`;
}

// ── CARGAR ──
async function loadNegocios() {
  grid.innerHTML = `<div class="empty">Cargando...</div>`;
  const snap = await getDocs(collection(db, 'negocios'));
  allNegocios = [];
  snap.forEach(d => allNegocios.push({ id: d.id, ...d.data() }));
  updateStats();
  renderGrid();
}

// ── STATS ──
function updateStats() {
  const now = new Date();
  let active = 0, soon = 0, expired = 0;
  allNegocios.forEach(n => {
    if (n.activo === false) return;
    const exp = n.expiresAt?.toDate();
    if (!exp) { active++; return; }
    const dias = Math.floor((exp - now) / 864e5);
    if (dias <= 0)       expired++;
    else if (dias <= 5)  soon++;
    else                 active++;
  });
  document.getElementById('statTotal').textContent  = allNegocios.length;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statSoon').textContent   = soon;
  document.getElementById('statExp').textContent    = expired;
}

// ── RENDER ──
function renderGrid() {
  const now    = new Date();
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

  const filtered = allNegocios.filter(n => {
    const exp  = n.expiresAt?.toDate();
    const dias = exp ? Math.floor((exp - now) / 864e5) : 999;
    if (currentFilter === 'activos')  { if (n.activo === false || dias <= 0) return false; }
    if (currentFilter === 'vencidos') { if (dias > 0) return false; }
    if (search) {
      const haystack = `${n.nombre || ''} ${n.email || ''} ${n.rubro || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  document.getElementById('gridCount').textContent =
    `${filtered.length} de ${allNegocios.length}`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">Sin resultados para este filtro.</div>`;
    return;
  }

  grid.innerHTML = '';

  filtered.forEach(n => {
    const created = n.createdAt?.toDate() || new Date();
    const exp     = n.expiresAt?.toDate();
    const storeURL = buildStoreURL(n.id);

    let porcentaje = 0, dias = null;
    let estado = 'Activo', badgeClass = 'badge-green', stripColor = 'var(--green)';
    let barColor = '#22c55e';

    if (exp) {
      const total  = 30;
      const usado  = (now - created) / 864e5;
      porcentaje   = Math.min((usado / total) * 100, 100);
      dias         = Math.floor((exp - now) / 864e5);

      if (dias <= 0) {
        estado = 'Vencido'; badgeClass = 'badge-red';
        stripColor = 'var(--red)'; barColor = '#ef4444';
      } else if (dias <= 5) {
        estado = 'Por vencer'; badgeClass = 'badge-amber';
        stripColor = 'var(--amber)'; barColor = '#f59e0b';
      }
    }

    if (n.activo === false) {
      estado = 'Inactivo'; badgeClass = 'badge-gray';
      stripColor = 'var(--text3)'; barColor = '#4a5a75';
    }

    const diasLabel = dias !== null
      ? (dias <= 0 ? 'Vencido' : `${dias}d restantes`)
      : 'Sin vencimiento';

    const div = document.createElement('div');
    div.className = 'card';

    div.innerHTML = `
      <div class="card-status-strip" style="background:${stripColor}"></div>

      <div class="card-top">
        <div class="card-avatar">${initials(n.nombre)}</div>
        <div class="card-info">
          <div class="card-name">${n.nombre || 'Sin nombre'}</div>
          <div class="card-email">${n.email || 'Sin email'}</div>
        </div>
        <span class="status-badge ${badgeClass}">${estado}</span>
      </div>

      <div class="card-link-row">
        <span class="card-link-text">${storeURL}</span>
        <button class="btn-icon" data-copy="${storeURL}">📋</button>
        <button class="btn-icon" data-link="${n.id}">🔗 Ver</button>
      </div>

      <div class="card-meta">
        <div class="meta-item">
          <div class="meta-key">Creado</div>
          <div class="meta-val">${fmtDate(created)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Vence</div>
          <div class="meta-val">${exp ? fmtDate(exp) : '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Plan</div>
          <div class="meta-val">${n.plan || 'Estándar'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Tiempo</div>
          <div class="meta-val">${diasLabel}</div>
        </div>
      </div>

      <div class="progress-section">
        <div class="progress-meta">
          <span class="progress-label">Vida del plan</span>
          <span class="progress-value">${Math.floor(porcentaje)}%</span>
        </div>
        <div class="bar">
          <div class="bar-fill" style="width:${porcentaje}%; background:${barColor}"></div>
        </div>
      </div>

      <div class="card-actions">
        <button class="btn btn-renew" data-renew="${n.id}">+ 30 días</button>
        <button class="btn btn-icon" data-detail="${n.id}" style="flex:1;padding:7px 12px;font-size:12px">✏️ Editar</button>
        <button class="btn ${n.activo !== false ? 'btn-disable' : 'btn-enable'}" data-toggle="${n.id}" data-activo="${n.activo !== false}">
          ${n.activo !== false ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    `;

    // Bind events dentro del card (sin onclick inline)
    div.querySelector('[data-copy]').addEventListener('click', e => {
      copyText(e.currentTarget.dataset.copy);
    });
    div.querySelector('[data-link]').addEventListener('click', e => {
      openLinkModalFor(e.currentTarget.dataset.link);
    });
    div.querySelector('[data-renew]').addEventListener('click', e => {
      renovar(e.currentTarget.dataset.renew);
    });
    div.querySelector('[data-detail]').addEventListener('click', e => {
      openDetailModal(e.currentTarget.dataset.detail);
    });
    div.querySelector('[data-toggle]').addEventListener('click', e => {
      const btn = e.currentTarget;
      toggleAdmin(btn.dataset.toggle, btn.dataset.activo === 'true');
    });

    grid.appendChild(div);
  });
}

// ── COPY ──
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    ta.remove();
  }
  showToast('✅ Enlace copiado');
}

// ── LINK MODAL ──
let _linkNegocio = null;

function openLinkModalFor(id) {
  _linkNegocio = allNegocios.find(n => n.id === id);
  if (!_linkNegocio) return;
  const url = buildStoreURL(id);
  document.getElementById('lm-nombre').textContent = _linkNegocio.nombre || 'Tienda';
  document.getElementById('lm-url').value = url;
  document.getElementById('lm-qr').innerHTML =
    `<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}" alt="QR" />`;
  document.getElementById('linkModal').classList.add('open');
}

window.closeLinkModal = () => {
  document.getElementById('linkModal').classList.remove('open');
};
window.copyLinkModal = () => {
  copyText(document.getElementById('lm-url').value);
};
window.openLinkModal = () => {
  window.open(document.getElementById('lm-url').value, '_blank');
};
window.shareLinkWhatsapp = () => {
  const url  = document.getElementById('lm-url').value;
  const name = _linkNegocio?.nombre || 'la tienda';
  window.open(`https://wa.me/?text=${encodeURIComponent(`¡Hola! 👋 Hacé tus pedidos en ${name}: ${url}`)}`, '_blank');
};

// ── DETAIL / EDIT MODAL ──
function openDetailModal(id) {
  editingId = id;
  const n = allNegocios.find(x => x.id === id);
  if (!n) return;
  document.getElementById('dm-title').textContent   = n.nombre || 'Negocio';
  document.getElementById('dm-id').textContent      = `ID: ${id}`;
  document.getElementById('dm-nombre').value        = n.nombre    || '';
  document.getElementById('dm-email').value         = n.email     || '';
  document.getElementById('dm-telefono').value      = n.telefono  || '';
  document.getElementById('dm-direccion').value     = n.direccion || '';
  document.getElementById('dm-plan').value          = n.plan      || 'Estándar';
  document.getElementById('dm-rubro').value         = n.rubro     || '';
  document.getElementById('dm-ownerid').value       = n.ownerId   || '—';
  document.getElementById('dm-storeurl').value      = buildStoreURL(id);
  document.getElementById('detailModal').classList.add('open');
}

window.closeDetailModal = () => {
  document.getElementById('detailModal').classList.remove('open');
  editingId = null;
};

window.saveDetail = async () => {
  if (!editingId) return;
  const btn = document.querySelector('.btn-dm-save');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await updateDoc(doc(db, 'negocios', editingId), {
      nombre:    document.getElementById('dm-nombre').value.trim(),
      email:     document.getElementById('dm-email').value.trim(),
      telefono:  document.getElementById('dm-telefono').value.trim(),
      direccion: document.getElementById('dm-direccion').value.trim(),
      plan:      document.getElementById('dm-plan').value,
      rubro:     document.getElementById('dm-rubro').value.trim(),
    });
    showToast('✅ Cambios guardados');
    window.closeDetailModal();
    await loadNegocios();
  } catch (e) {
    showToast('❌ Error al guardar');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = '💾 Guardar cambios';
  }
};

// Cerrar modales al hacer click en backdrop
document.getElementById('detailModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) window.closeDetailModal();
});
document.getElementById('linkModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) window.closeLinkModal();
});

// ── ACCIONES ──
async function renovar(id) {
  const now = new Date();
  const exp = new Date();
  exp.setDate(now.getDate() + 30);
  await updateDoc(doc(db, 'negocios', id), { createdAt: now, expiresAt: exp });
  showToast('✅ Plan renovado por 30 días');
  loadNegocios();
}

async function toggleAdmin(id, activo) {
  await updateDoc(doc(db, 'negocios', id), { activo: !activo });
  showToast(activo ? '🔴 Negocio desactivado' : '🟢 Negocio activado');
  loadNegocios();
}