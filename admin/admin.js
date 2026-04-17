// ============================================================
// admin/admin.js — Panel de administración SaaS multi-rubro
// ============================================================

import { db, auth } from '../firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, orderBy,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const IMGBB_API_KEY = '9ed686117bdb0d5263132a2e5ec5b094';

// ── Utilidades ────────────────────────────────────────────── //
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const PAGE_IS_LOGIN = window.location.pathname.includes('login');
const PAGE_IS_DASH  = window.location.pathname.includes('dashboard');

// ── Toast ──────────────────────────────────────────────────── //
function showToast(msg, type = 'info', duration = 3500) {
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.textContent = `${icons[type] || ''} ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + 350);
}

// ── Slug ──────────────────────────────────────────────────── //
function generarSlug(texto) {
  return texto.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Estado admin ──────────────────────────────────────────── //
const admin = {
  uid:       null,
  negocioId: null,
  negocio:   null,
  productos: [],
  pedidos:   [],
  promos:    [],
};

let categoriasActuales = [];

// ── Obtener negocioId del usuario ─────────────────────────── //
async function fetchNegocioId(uid) {
  const snap = await getDocs(collection(db, 'negocios'));
  for (const d of snap.docs) {
    if (d.data().ownerId === uid) return d.id;
  }
  return null;
}

// ════════════════════════════════════════════════════════════ //
//                     PÁGINA LOGIN                            //
// ════════════════════════════════════════════════════════════ //
if (PAGE_IS_LOGIN) {

  onAuthStateChanged(auth, user => {
    if (user) window.location.href = 'dashboard.html';
  });

  const form    = $('#login-form');
  const errDiv  = $('#login-error');
  const btnText = $('#login-text');
  const btnLoad = $('#login-loading');
  const btnBtn  = $('#btn-login');

  $('#toggle-pw')?.addEventListener('click', () => {
    const pw = $('#password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = $('#email').value.trim();
    const password = $('#password').value.trim();
    if (!email || !password) return;

    errDiv.classList.add('hidden');
    btnText.classList.add('hidden');
    btnLoad.classList.remove('hidden');
    btnBtn.disabled = true;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'dashboard.html';
    } catch (err) {
      console.error('Login error:', err);
      errDiv.classList.remove('hidden');
      btnText.classList.remove('hidden');
      btnLoad.classList.add('hidden');
      btnBtn.disabled = false;
    }
  });
}

// ════════════════════════════════════════════════════════════ //
//                   PÁGINA DASHBOARD                          //
// ════════════════════════════════════════════════════════════ //
if (PAGE_IS_DASH) {

  const loader = $('#global-loader');
  function hideLoader() {
    loader?.classList.add('fade-out');
    setTimeout(() => loader?.remove(), 450);
  }

  // ── Auth guard ──────────────────────────────────────────── //
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = 'login.html'; return; }

    admin.uid = user.uid;
    $('#topbar-user').textContent = user.email || '';

    admin.negocioId = await fetchNegocioId(user.uid);
    if (!admin.negocioId) {
      hideLoader();
      showToast('No se encontró un negocio asociado a tu cuenta.', 'error', 8000);
      return;
    }

    try {
      const negSnap = await getDoc(doc(db, 'negocios', admin.negocioId));
      if (negSnap.exists()) {
        admin.negocio = negSnap.data();
        const n = admin.negocio.nombre || 'Mi Negocio';
        $('#sidebar-negocio-name').textContent = n;
        document.title = `Admin — ${n}`;
        // Actualizar emoji del sidebar si existe
        const ap = admin.negocio.apariencia;
        if (ap?.emoji) {
          const logo = $('#sidebar-logo');
          if (logo) logo.textContent = ap.emoji;
        }
      }
    } catch (_) {}

    await initDashboard();
    hideLoader();
  });

  // ── Navegación ─────────────────────────────────────────── //
  const SECTIONS = ['dashboard', 'productos', 'pedidos', 'promociones', 'configuracion'];

  function showSection(id) {
    SECTIONS.forEach(s => {
      $(`#section-${s}`)?.classList.toggle('hidden', s !== id);
    });
    $$('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.section === id);
    });
    const titles = {
      dashboard:     'Dashboard',
      productos:     'Productos',
      pedidos:       'Pedidos',
      promociones:   'Promociones',
      configuracion: 'Configuración',
    };
    $('#topbar-title').textContent = titles[id] || id;
    $('#sidebar').classList.remove('open');

    if (id === 'pedidos')       renderPedidos($('#filtro-estado')?.value || 'all');
    if (id === 'dashboard')     { renderDashboardStats(); renderRecentPedidos(); }
    if (id === 'configuracion') renderConfiguracion();
  }

  $$('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });

  $('#menu-toggle')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  $('#btn-logout')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'login.html';
  });

  // ── Inicializar dashboard ──────────────────────────────── //
  async function initDashboard() {
    await Promise.all([
      loadProductos(),
      loadPedidos(),
      loadPromos(),
      loadCategorias(),
    ]);
    renderDashboardStats();
    renderRecentPedidos();
    renderPedidos();
    setupProductoModal();
    setupPromoModal();
    setupFiltroEstado();
    setupShareModal();
    setupConfiguracion();
    setupApariencia();   // ← registra listeners UNA sola vez
  }

  // ── STATS ──────────────────────────────────────────────── //
  function renderDashboardStats() {
    const hoy   = new Date(); hoy.setHours(0, 0, 0, 0);
    const hoyTs = Timestamp.fromDate(hoy);
    const pedHoy = admin.pedidos.filter(p =>
      p.createdAt && p.createdAt.toMillis() >= hoyTs.toMillis()
    ).length;
    $('#stat-pedidos-hoy').textContent  = pedHoy;
    $('#stat-productos').textContent    = admin.productos.filter(p => p.disponible !== false).length;
    $('#stat-pendientes').textContent   = admin.pedidos.filter(p => p.estado === 'pendiente').length;
    $('#stat-promos').textContent       = admin.promos.filter(p => p.activo).length;
  }

  function renderRecentPedidos() {
    const container = $('#recent-pedidos');
    const ultimos   = admin.pedidos.slice(0, 5);
    if (!ultimos.length) {
      container.innerHTML = '<p class="loading-msg">Sin pedidos aún.</p>';
      return;
    }
    container.innerHTML = buildPedidosTable(ultimos);
    bindEstadoBtns(container);
  }

  // ── CATEGORÍAS ─────────────────────────────────────────── //
  async function loadCategorias() {
    if (!admin.negocio) return;
    categoriasActuales = admin.negocio.categorias?.length
      ? admin.negocio.categorias
      : ['General'];
    renderCategoriasSelects();
  }

  function renderCategoriasSelects() {
    const sel = $('#prod-categoria');
    if (sel) {
      sel.innerHTML = categoriasActuales.map(cat =>
        `<option value="${cat}">${cat}</option>`
      ).join('');
    }
    const filtro = $('#filtro-categoria');
    if (filtro) {
      filtro.innerHTML = `<option value="all">Todas</option>` +
        categoriasActuales.map(cat =>
          `<option value="${cat}">${cat}</option>`
        ).join('');
    }
  }

  // ── PRODUCTOS ──────────────────────────────────────────── //
  async function loadProductos() {
    try {
      const snap = await getDocs(
        query(collection(db, 'negocios', admin.negocioId, 'productos'), orderBy('nombre'))
      );
      admin.productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderProductosGrid();
    } catch (e) {
      console.error('Error productos:', e);
    }
  }

  function renderProductosGrid() {
    const grid = $('#productos-lista');
    if (!admin.productos.length) {
      grid.innerHTML = '<p class="loading-msg">No hay productos. ¡Creá el primero!</p>';
      return;
    }
    grid.innerHTML = admin.productos.map(p => {
      const precio    = typeof p.precio === 'number' ? `$${p.precio.toLocaleString('es-AR')}` : p.precio || '';
      const dispoText = p.disponible !== false ? '✅ Disponible' : '❌ Sin stock';
      return `
        <div class="prod-admin-card" data-id="${p.id}">
          <img src="${p.imagen || 'https://via.placeholder.com/400x300/F5ECD8/6B4226?text=📦'}"
               alt="${p.nombre}" loading="lazy" />
          <div class="card-body">
            <span class="card-cat">${p.categoria || ''}</span>
            <div class="card-name">${p.nombre}</div>
            <div class="card-price">${precio}</div>
            ${p.variantes?.length ? `<div class="card-variantes">🔀 ${p.variantes.join(', ')}</div>` : ''}
            <div class="card-available" style="color:${p.disponible !== false ? 'var(--green-ok)' : 'var(--red-no)'}">
              ${dispoText}
            </div>
          </div>
          <div class="card-actions">
            <button class="btn-edit"   data-id="${p.id}">✏️ Editar</button>
            <button class="btn-toggle" data-id="${p.id}" data-disp="${p.disponible !== false}"
              style="color:${p.disponible !== false ? 'var(--red-no)' : 'var(--green-ok)'};
                     border:1.5px solid ${p.disponible !== false ? 'rgba(192,57,43,.25)' : 'rgba(61,122,92,.3)'};
                     border-radius:7px;padding:.4rem .55rem;font-size:.73rem;font-weight:600">
              ${p.disponible !== false ? '🔴 Quitar' : '🟢 Activar'}
            </button>
            <button class="btn-delete" data-id="${p.id}">🗑</button>
          </div>
        </div>`;
    }).join('');

    $$('.btn-edit',   grid).forEach(btn => btn.addEventListener('click', () => openProductoModal(btn.dataset.id)));
    $$('.btn-delete', grid).forEach(btn => btn.addEventListener('click', () => deleteProducto(btn.dataset.id)));
    $$('.btn-toggle', grid).forEach(btn => btn.addEventListener('click', () => toggleDisponible(btn.dataset.id, btn.dataset.disp === 'true')));
  }

  async function toggleDisponible(id, actual) {
    try {
      await updateDoc(doc(db, 'negocios', admin.negocioId, 'productos', id), { disponible: !actual });
      showToast(`Producto ${!actual ? 'activado' : 'desactivado'}.`, 'success');
      await loadProductos();
    } catch (e) {
      showToast('Error al cambiar disponibilidad.', 'error');
    }
  }

  async function deleteProducto(id) {
    if (!confirm('¿Seguro que querés eliminar este producto?')) return;
    try {
      await deleteDoc(doc(db, 'negocios', admin.negocioId, 'productos', id));
      showToast('Producto eliminado.', 'success');
      await loadProductos();
    } catch (e) {
      showToast('Error al eliminar.', 'error');
    }
  }

  // ── Modal Producto ─────────────────────────────────────── //
  let editingProdId = null;

  function setupProductoModal() {
    $('#btn-nuevo-producto').addEventListener('click', () => openProductoModal(null));
    $('#btn-cancel-prod').addEventListener('click', closeProductoModal);
    $('#overlay-producto').addEventListener('click', closeProductoModal);
    $('#form-producto').addEventListener('submit', saveProducto);
  }

  function openProductoModal(id) {
    editingProdId = id;
    renderCategoriasSelects();
    $('#modal-producto').classList.remove('hidden');
    if (id) {
      const p = admin.productos.find(x => x.id === id);
      if (!p) return;
      $('#modal-prod-title').textContent = 'Editar producto';
      $('#prod-nombre').value            = p.nombre      || '';
      $('#prod-precio').value            = p.precio      || '';
      $('#prod-descripcion').value       = p.descripcion || '';
      $('#prod-categoria').value         = p.categoria   || categoriasActuales[0] || 'General';
      $('#prod-variantes').value         = p.variantes?.join(', ') || '';
      $('#prod-disponible').checked      = p.disponible !== false;
    } else {
      $('#modal-prod-title').textContent = 'Nuevo producto';
      $('#form-producto').reset();
      $('#prod-disponible').checked = true;
    }
  }

  function closeProductoModal() {
    $('#modal-producto').classList.add('hidden');
    editingProdId = null;
  }

  async function saveProducto(e) {
    e.preventDefault();
    const nombre = $('#prod-nombre').value.trim();
    const precio = parseFloat($('#prod-precio').value);
    if (!nombre || isNaN(precio)) { showToast('Nombre y precio son requeridos.', 'error'); return; }

    const btn    = $('#btn-save-prod');
    const status = $('#img-upload-status');
    btn.disabled = true; btn.textContent = 'Procesando...';

    let imagenURL = '';
    try {
      const fileInput = $('#prod-imagen-file');
      if (fileInput && fileInput.files.length > 0) {
        if (status) status.innerText = '⏳ Subiendo imagen...';
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        const res     = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
        const imgData = await res.json();
        if (!imgData.success) throw new Error('Error ImgBB');
        imagenURL = imgData.data.url;
        if (status) status.innerText = '✅ Imagen lista';
      } else {
        const prod = editingProdId ? admin.productos.find(x => x.id === editingProdId) : null;
        imagenURL = prod?.imagen || '';
      }

      const variantesRaw = $('#prod-variantes')?.value || '';
      const variantes = variantesRaw
        ? variantesRaw.split(',').map(v => v.trim()).filter(Boolean)
        : [];

      const data = {
        nombre, precio,
        descripcion: $('#prod-descripcion').value.trim(),
        imagen:      imagenURL,
        categoria:   $('#prod-categoria').value,
        variantes,
        disponible:  $('#prod-disponible').checked,
      };

      if (editingProdId) {
        await updateDoc(doc(db, 'negocios', admin.negocioId, 'productos', editingProdId), data);
        showToast('Producto actualizado ✅', 'success');
      } else {
        await addDoc(collection(db, 'negocios', admin.negocioId, 'productos'), { ...data, createdAt: serverTimestamp() });
        showToast('Producto creado ✅', 'success');
      }
      closeProductoModal();
      await loadProductos();
    } catch (err) {
      console.error(err);
      showToast('Error al guardar el producto.', 'error');
      if (status) status.innerText = '❌ Error al subir imagen';
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }

  // ── PEDIDOS ────────────────────────────────────────────── //
  async function loadPedidos() {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'negocios', admin.negocioId, 'pedidos'),
          orderBy('createdAt', 'desc')
        )
      );
      admin.pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('Error pedidos:', e);
    }
  }

  function buildPedidosTable(lista) {
    if (!lista.length) return '<p class="loading-msg">No hay pedidos.</p>';

    return lista.map(p => {
      const fecha = p.createdAt?.toDate
        ? p.createdAt.toDate().toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })
        : '—';
      const estadoCls  = `estado-${(p.estado || 'pendiente').replace(' ', '-')}`;
      const estadoBtns = ['pendiente', 'confirmado', 'entregado', 'sin stock']
        .map(s => `<button class="btn-estado${p.estado === s ? ' active' : ''}"
                     data-id="${p.id}" data-estado="${s}">${s}</button>`)
        .join('');

      const detallePedido = p.items?.length
        ? p.items.map(i => `${i.cantidad}x ${i.nombre}${i.variante ? ` (${i.variante})` : ''} — $${i.precio}`).join('\n')
        : (p.pedido || '—');

      return `
        <div class="pedido-card" data-id="${p.id}">
          <div class="pedido-row-main">
            <div class="pedido-nombre">
              <strong>${p.nombre || '—'}</strong>
              <span class="estado-badge ${estadoCls}">${p.estado || 'pendiente'}</span>
            </div>
            <div class="pedido-fecha">🕐 ${fecha}</div>
            <button class="btn-ver-info" data-id="${p.id}">Ver info ▾</button>
          </div>
          <div class="pedido-detalle hidden" id="detalle-${p.id}">
            <div class="pedido-detalle-grid">
              <div><span class="det-label">📱 Teléfono</span><span>${p.telefono || '—'}</span></div>
              <div><span class="det-label">📍 Dirección</span><span>${p.direccion || '—'}</span></div>
              <div class="det-full"><span class="det-label">🛍 Pedido</span>
                <span style="white-space:pre-wrap">${detallePedido}</span></div>
              ${p.total ? `<div><span class="det-label">💰 Total</span><span>$${p.total.toLocaleString('es-AR')}</span></div>` : ''}
            </div>
            <div class="pedido-acciones">${estadoBtns}</div>
          </div>
        </div>`;
    }).join('');
  }

  function bindEstadoBtns(ctx) {
    $$('.btn-ver-info', ctx).forEach(btn => {
      btn.addEventListener('click', () => {
        const card    = btn.closest('.pedido-card');
        const detalle = card.querySelector('.pedido-detalle');
        const abierto = !detalle.classList.contains('hidden');
        detalle.classList.toggle('hidden', abierto);
        btn.textContent = abierto ? 'Ver info ▾' : 'Ocultar ▴';
      });
    });
    $$('.btn-estado', ctx).forEach(btn => {
      btn.addEventListener('click', () => cambiarEstado(btn.dataset.id, btn.dataset.estado));
    });
  }

  function renderPedidos(filtroEstado = 'all') {
    const container = $('#pedidos-lista');
    if (!container) return;
    let lista = admin.pedidos;
    if (filtroEstado !== 'all') lista = lista.filter(p => p.estado === filtroEstado);
    container.innerHTML = buildPedidosTable(lista);
    bindEstadoBtns(container);
  }

  async function cambiarEstado(id, nuevoEstado) {
    try {
      await updateDoc(doc(db, 'negocios', admin.negocioId, 'pedidos', id), { estado: nuevoEstado });
      showToast(`Estado actualizado: ${nuevoEstado}`, 'success');
      await loadPedidos();
      renderPedidos($('#filtro-estado')?.value || 'all');
      renderDashboardStats();
    } catch (e) {
      showToast('Error al actualizar estado.', 'error');
    }
  }

  function setupFiltroEstado() {
    $('#filtro-estado')?.addEventListener('change', e => renderPedidos(e.target.value));
  }

  // ── PROMOCIONES ────────────────────────────────────────── //
  async function loadPromos() {
    try {
      const snap = await getDocs(collection(db, 'negocios', admin.negocioId, 'promociones'));
      admin.promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderPromos();
    } catch (e) {
      console.error('Error promos:', e);
    }
  }

  function renderPromos() {
    const container = $('#promos-lista');
    if (!admin.promos.length) {
      container.innerHTML = '<p class="loading-msg">No hay promociones. ¡Creá la primera!</p>';
      return;
    }
    container.innerHTML = admin.promos.map(p => `
      <div class="promo-admin-card">
        <div class="promo-head">
          <div>
            <h3>${p.titulo}</h3>
            <p>${p.descripcion || 'Sin descripción'}</p>
          </div>
          <span class="estado-badge ${p.activo ? 'estado-confirmado' : 'estado-sin-stock'}">
            ${p.activo ? '✅ Activa' : '❌ Inactiva'}
          </span>
        </div>
        <div class="promo-actions">
          <button class="btn-edit"         data-id="${p.id}">✏️ Editar</button>
          <button class="btn-toggle-promo" data-id="${p.id}" data-activo="${p.activo}">
            ${p.activo ? '🔴 Desactivar' : '🟢 Activar'}
          </button>
          <button class="btn-delete-promo" data-id="${p.id}">🗑 Eliminar</button>
        </div>
      </div>`).join('');

    $$('.btn-edit',         container).forEach(btn => btn.addEventListener('click', () => openPromoModal(btn.dataset.id)));
    $$('.btn-toggle-promo', container).forEach(btn => btn.addEventListener('click', () => togglePromo(btn.dataset.id, btn.dataset.activo === 'true')));
    $$('.btn-delete-promo', container).forEach(btn => btn.addEventListener('click', () => deletePromo(btn.dataset.id)));
  }

  async function togglePromo(id, actual) {
    try {
      await updateDoc(doc(db, 'negocios', admin.negocioId, 'promociones', id), { activo: !actual });
      showToast(`Promoción ${!actual ? 'activada' : 'desactivada'}.`, 'success');
      await loadPromos(); renderDashboardStats();
    } catch (e) { showToast('Error.', 'error'); }
  }

  async function deletePromo(id) {
    if (!confirm('¿Eliminar esta promoción?')) return;
    try {
      await deleteDoc(doc(db, 'negocios', admin.negocioId, 'promociones', id));
      showToast('Promoción eliminada.', 'success');
      await loadPromos(); renderDashboardStats();
    } catch (e) { showToast('Error.', 'error'); }
  }

  let editingPromoId = null;

  function setupPromoModal() {
    $('#btn-nueva-promo').addEventListener('click', () => openPromoModal(null));
    $('#btn-cancel-promo').addEventListener('click', closePromoModal);
    $('#overlay-promo').addEventListener('click', closePromoModal);
    $('#form-promo').addEventListener('submit', savePromo);
  }

  function openPromoModal(id) {
    editingPromoId = id;
    $('#modal-promo').classList.remove('hidden');
    if (id) {
      const p = admin.promos.find(x => x.id === id);
      if (!p) return;
      $('#modal-promo-title').textContent = 'Editar promoción';
      $('#promo-titulo').value      = p.titulo      || '';
      $('#promo-descripcion').value = p.descripcion || '';
      $('#promo-activo').checked    = p.activo !== false;
    } else {
      $('#modal-promo-title').textContent = 'Nueva promoción';
      $('#form-promo').reset();
      $('#promo-activo').checked = true;
    }
  }

  function closePromoModal() {
    $('#modal-promo').classList.add('hidden');
    editingPromoId = null;
  }

  async function savePromo(e) {
    e.preventDefault();
    const titulo = $('#promo-titulo').value.trim();
    if (!titulo) { showToast('El título es requerido.', 'error'); return; }

    const data = {
      titulo,
      descripcion: $('#promo-descripcion').value.trim(),
      activo:      $('#promo-activo').checked,
    };

    const btn = $('#btn-save-promo');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
      if (editingPromoId) {
        await updateDoc(doc(db, 'negocios', admin.negocioId, 'promociones', editingPromoId), data);
        showToast('Promoción actualizada ✅', 'success');
      } else {
        await addDoc(collection(db, 'negocios', admin.negocioId, 'promociones'), { ...data, createdAt: serverTimestamp() });
        showToast('Promoción creada ✅', 'success');
      }
      closePromoModal();
      await loadPromos(); renderDashboardStats();
    } catch (err) {
      showToast('Error al guardar.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }

  // ════════════════════════════════════════════════════════ //
  //                   CONFIGURACIÓN                         //
  // ════════════════════════════════════════════════════════ //

  function setupConfiguracion() {
    $('#form-config')?.addEventListener('submit', guardarConfiguracion);
    $('#btn-add-categoria')?.addEventListener('click', agregarCategoria);
  }

  function renderConfiguracion() {
    const n = admin.negocio || {};

    // Datos básicos
    if ($('#config-nombre'))    $('#config-nombre').value    = n.nombre    || '';
    if ($('#config-telefono'))  $('#config-telefono').value  = n.telefono  || '';
    if ($('#config-direccion')) $('#config-direccion').value = n.direccion || '';

    // Rubro — solo lectura (lo define el master admin)
    const rubros = {
      comida:     '🍽️ Casa de Comidas / Restaurante',
      panaderia:  '🍞 Panadería / Confitería',
      ropa:       '👗 Ropa y Accesorios',
      cosmeticos: '💄 Cosmética / Belleza',
      almacen:    '🛒 Almacén / Kiosco',
    };
    const rubroDisplay = $('#config-rubro-display');
    if (rubroDisplay) {
      rubroDisplay.textContent = rubros[n.rubro] || n.rubro || 'Sin definir';
    }

    renderCategoriasAdmin();
    renderApariencia();        // ← carga valores guardados en los inputs
    livePreviewApariencia();   // ← actualiza el preview del hero
  }

  // ── Categorías ─────────────────────────────────────────── //
  function renderCategoriasAdmin() {
    const lista = $('#categorias-lista');
    if (!lista) return;
    lista.innerHTML = categoriasActuales.map((cat, i) => `
      <div class="categoria-item">
        <span>${cat}</span>
        <button type="button" class="btn-del-cat" data-index="${i}">✕</button>
      </div>`).join('');

    $$('.btn-del-cat', lista).forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        categoriasActuales.splice(idx, 1);
        renderCategoriasAdmin();
        renderCategoriasSelects();
      });
    });
  }

  function agregarCategoria() {
    const input = $('#nueva-categoria');
    if (!input) return;
    const val = input.value.trim();
    if (!val) { showToast('Escribí el nombre de la categoría.', 'error'); return; }
    if (categoriasActuales.includes(val)) { showToast('Ya existe esa categoría.', 'error'); return; }
    categoriasActuales.push(val);
    input.value = '';
    renderCategoriasAdmin();
    renderCategoriasSelects();
  }

  async function guardarConfiguracion(e) {
    e.preventDefault();
    const nombre    = $('#config-nombre')?.value.trim()    || '';
    const telefono  = $('#config-telefono')?.value.trim()  || '';
    const direccion = $('#config-direccion')?.value.trim() || '';

    if (!nombre) { showToast('El nombre es requerido.', 'error'); return; }

    const btn = $('#btn-save-config');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
      const data = {
        nombre,
        telefono,
        direccion,
        slug:       generarSlug(nombre),
        categorias: categoriasActuales,
        apariencia: buildAparienciaData(),
      };
      await updateDoc(doc(db, 'negocios', admin.negocioId), data);

      // Actualizar estado local
      admin.negocio = { ...admin.negocio, ...data };
      $('#sidebar-negocio-name').textContent = nombre;
      document.title = `Admin — ${nombre}`;

      // Actualizar emoji del sidebar
      const emoji = data.apariencia?.emoji;
      if (emoji) {
        const logo = $('#sidebar-logo');
        if (logo) logo.textContent = emoji;
      }

      showToast('Configuración guardada ✅', 'success');

      // Recargar iframe de preview si está visible
      refreshStorePreview();

    } catch (err) {
      console.error(err);
      showToast('Error al guardar configuración.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar cambios'; }
    }
  }

  // ════════════════════════════════════════════════════════ //
  //                    APARIENCIA                           //
  // ════════════════════════════════════════════════════════ //

  // setupApariencia: registra TODOS los listeners una sola vez (llamado en initDashboard)
  function setupApariencia() {

    // Sincronizar color picker ↔ input hex
    const syncColor = (pickerId, hexId) => {
      const picker = $(pickerId);
      const hex    = $(hexId);
      if (!picker || !hex) return;
      picker.addEventListener('input', () => {
        hex.value = picker.value;
        livePreviewApariencia();
      });
      hex.addEventListener('input', () => {
        if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) {
          picker.value = hex.value;
          livePreviewApariencia();
        }
      });
    };
    syncColor('#ap-color-primario', '#ap-color-primario-hex');
    syncColor('#ap-color-hero',     '#ap-color-hero-hex');
    syncColor('#ap-color-fondo',    '#ap-color-fondo-hex');

    // Textos → preview en vivo
    ['#ap-slogan', '#ap-titulo', '#ap-titulo-em', '#ap-subtitulo', '#ap-emoji'].forEach(sel => {
      $(sel)?.addEventListener('input', livePreviewApariencia);
    });

    // Overlay slider
    $('#ap-overlay')?.addEventListener('input', e => {
      const val = $('#ap-overlay-val');
      if (val) val.textContent = `${e.target.value}%`;
      livePreviewApariencia();
    });

    // Imagen de fondo — file upload
    $('#ap-bg-file')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const status = $('#ap-bg-status');
      if (status) status.textContent = '⏳ Subiendo imagen...';
      try {
        const formData = new FormData();
        formData.append('image', file);
        const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error();
        const url = data.data.url;
        const bgUrl = $('#ap-bg-url');
        if (bgUrl) bgUrl.value = url;
        if (status) status.textContent = '✅ Imagen subida';
        showBgPreview(url);
        livePreviewApariencia();
      } catch {
        if (status) status.textContent = '❌ Error al subir imagen';
      }
    });

    // Imagen de fondo — URL manual
    $('#ap-bg-url')?.addEventListener('input', e => {
      const url = e.target.value.trim();
      if (url) showBgPreview(url);
      livePreviewApariencia();
    });

    // Botón: abrir preview completo de la tienda
    $('#btn-preview-tienda')?.addEventListener('click', openStorePreview);
    $('#btn-close-preview')?.addEventListener('click', closeStorePreview);
    $('#overlay-preview')?.addEventListener('click', closeStorePreview);
  }

  // Muestra la imagen de fondo en el mini-preview del file input
  function showBgPreview(url) {
    const wrap        = $('#ap-bg-preview');
    const img         = $('#ap-bg-img');
    const overlayWrap = $('#ap-overlay-wrap');
    if (!wrap || !img) return;
    img.src = url;
    wrap.style.display = 'block';
    if (overlayWrap) overlayWrap.style.display = 'block';
  }

  // Actualiza el mini-hero preview en tiempo real
  function livePreviewApariencia() {
    const hero    = $('#ap-hero-preview');
    const overlay = $('#ap-hero-overlay');
    if (!hero) return;

    const colorHero  = $('#ap-color-hero')?.value    || '#2C1A0E';
    const colorPrim  = $('#ap-color-primario')?.value || '#C8781A';
    const bgUrl      = $('#ap-bg-url')?.value.trim()  || '';
    const overlayPct = parseInt($('#ap-overlay')?.value || 40);
    const slogan     = $('#ap-slogan')?.value    || '✦ Hecho con amor cada día';
    const titulo     = $('#ap-titulo')?.value    || 'Pan artesanal,';
    const tituloEm   = $('#ap-titulo-em')?.value || 'sabor de siempre';
    const subtitulo  = $('#ap-subtitulo')?.value || 'Elegí tus productos favoritos...';

    if (bgUrl) {
      hero.style.background = `url('${bgUrl}') center/cover no-repeat`;
      if (overlay) overlay.style.background = `rgba(0,0,0,${overlayPct / 100})`;
    } else {
      hero.style.background = colorHero;
      if (overlay) overlay.style.background = 'rgba(0,0,0,0)';
    }

    const prevEyebrow = $('#prev-eyebrow');
    const prevTitulo  = $('#prev-titulo');
    const prevSub     = $('#prev-subtitulo');
    if (prevEyebrow) { prevEyebrow.textContent = slogan; prevEyebrow.style.color = colorPrim; }
    if (prevTitulo)  prevTitulo.innerHTML = `${titulo} <em style="color:${colorPrim};font-style:italic">${tituloEm}</em>`;
    if (prevSub)     prevSub.textContent = subtitulo;
  }

  // Carga los valores guardados en Firestore dentro de los inputs de apariencia
  function renderApariencia() {
    const ap = admin.negocio?.apariencia || {};

    const setColor = (pickerId, hexId, val) => {
      const picker = $(pickerId);
      const hex    = $(hexId);
      if (val) {
        if (picker) picker.value = val;
        if (hex)    hex.value    = val;
      }
    };
    setColor('#ap-color-primario', '#ap-color-primario-hex', ap.colorPrimario);
    setColor('#ap-color-hero',     '#ap-color-hero-hex',     ap.colorHero);
    setColor('#ap-color-fondo',    '#ap-color-fondo-hex',    ap.colorFondo);

    if ($('#ap-slogan'))    $('#ap-slogan').value    = ap.slogan    || '';
    if ($('#ap-titulo'))    $('#ap-titulo').value    = ap.titulo    || '';
    if ($('#ap-titulo-em')) $('#ap-titulo-em').value = ap.tituloEm  || '';
    if ($('#ap-subtitulo')) $('#ap-subtitulo').value = ap.subtitulo || '';
    if ($('#ap-emoji'))     $('#ap-emoji').value     = ap.emoji     || '';

    if (ap.imagenFondo) {
      const bgUrl = $('#ap-bg-url');
      if (bgUrl) bgUrl.value = ap.imagenFondo;
      showBgPreview(ap.imagenFondo);
      const overlayEl  = $('#ap-overlay');
      const overlayVal = $('#ap-overlay-val');
      if (overlayEl)  overlayEl.value       = ap.overlayOpacidad ?? 40;
      if (overlayVal) overlayVal.textContent = `${ap.overlayOpacidad ?? 40}%`;
    }
  }

  // Construye el objeto apariencia para guardar en Firestore
  function buildAparienciaData() {
    return {
      colorPrimario:   $('#ap-color-primario')?.value    || '#C8781A',
      colorHero:       $('#ap-color-hero')?.value        || '#2C1A0E',
      colorFondo:      $('#ap-color-fondo')?.value       || '#FDF8F2',
      slogan:          $('#ap-slogan')?.value.trim()     || '',
      titulo:          $('#ap-titulo')?.value.trim()     || '',
      tituloEm:        $('#ap-titulo-em')?.value.trim()  || '',
      subtitulo:       $('#ap-subtitulo')?.value.trim()  || '',
      emoji:           $('#ap-emoji')?.value.trim()      || '',
      imagenFondo:     $('#ap-bg-url')?.value.trim()     || '',
      overlayOpacidad: parseInt($('#ap-overlay')?.value  || 40),
    };
  }

  // ── Preview completo de la tienda (iframe) ─────────────── //
  function buildStoreURL() {
    const slug = admin.negocio?.slug;
    const base = window.location.origin +
      window.location.pathname.replace(/admin\/.*$/, 'public/index.html');
    return slug
      ? `${window.location.origin}/tienda/${slug}`
      : `${base}?n=${admin.negocioId}`;
  }

  function openStorePreview() {
    const modal  = $('#modal-preview');
    const iframe = $('#iframe-tienda');
    if (!modal || !iframe) return;
    iframe.src = buildStoreURL();
    modal.classList.remove('hidden');
  }

  function closeStorePreview() {
    const modal  = $('#modal-preview');
    const iframe = $('#iframe-tienda');
    if (!modal) return;
    modal.classList.add('hidden');
    // Limpiar src para liberar memoria
    if (iframe) setTimeout(() => { iframe.src = ''; }, 300);
  }

  // Recarga el iframe si el modal de preview está abierto
  function refreshStorePreview() {
    const modal  = $('#modal-preview');
    const iframe = $('#iframe-tienda');
    if (!modal || modal.classList.contains('hidden') || !iframe) return;
    iframe.src = buildStoreURL();
  }

  // ── Compartir tienda ───────────────────────────────────── //
  function setupShareModal() {
    const modal = $('#modal-share');
    const input = $('#share-link');
    const qrBox = $('#share-qr');
    if (!modal) return;

    const open = () => {
      const url = buildStoreURL();
      if (input) input.value = url;
      if (qrBox) qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}" alt="QR tienda" />`;
      modal.classList.remove('hidden');
    };
    const close = () => modal.classList.add('hidden');

    $('#btn-share-store')?.addEventListener('click', open);
    $('#overlay-share')?.addEventListener('click', close);
    $('#btn-close-share')?.addEventListener('click', close);

    $('#btn-copy-link')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        showToast('Enlace copiado ✅', 'success');
      } catch {
        input?.select(); document.execCommand('copy');
        showToast('Enlace copiado', 'success');
      }
    });

    $('#btn-share-open')?.addEventListener('click', () => window.open(input?.value, '_blank'));

    $('#btn-share-whatsapp')?.addEventListener('click', () => {
      const nombre = admin.negocio?.nombre || 'nuestra tienda';
      const msg = `¡Hola! 👋 Hacé tus pedidos en ${nombre} desde acá: ${input?.value}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }

} // end if PAGE_IS_DASH
