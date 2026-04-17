// ============================================================
// app.js — Módulo cliente público
// ============================================================
import { db } from '../firebase.js';
import {
  collection, doc, addDoc, getDocs, getDoc, query,
  orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Utilidades ────────────────────────────────────────────── //
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Detectar negocioId ────────────────────────────────────── //
function getNegocioId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('negocio') || params.get('n');
  if (!id) {
    const host = window.location.hostname;
    const sub  = host.split('.')[0];
    if (sub && sub !== 'www' && sub !== 'localhost') return sub;
  }
  return id || 'demo';
}

const NEGOCIO_ID = getNegocioId();

// ── Estado global ─────────────────────────────────────────── //
const state = {
  productos:   [],
  filtrados:   [],
  negocio:     null,
  categoria:   'all',
  searchQuery: '',
  carrito:     [],
};

// ── Toast ──────────────────────────────────────────────────── //
function showToast(msg, type = 'info', duration = 3500) {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ── Loader ─────────────────────────────────────────────────── //
function hideLoader() {
  const loader = $('#global-loader');
  loader.classList.add('fade-out');
  setTimeout(() => loader.remove(), 500);
}

// ── Helper: aclarar/oscurecer color hex ───────────────────── //
function shadeColor(hex, percent) {
  const clean = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return hex;
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0xff) + percent));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ── Cargar datos del negocio ──────────────────────────────── //
async function loadNegocio() {
  try {
    const snap = await getDoc(doc(db, 'negocios', NEGOCIO_ID));
    if (!snap.exists()) {
      showToast('Negocio no encontrado. Verificá el parámetro ?negocio=', 'error', 8000);
      return;
    }
    state.negocio = snap.data();
    renderNegocioInfo();
    applyApariencia();       // ✅ se llama DESPUÉS de cargar los datos
    renderCategoriasFiltros(); // ✅ categorías dinámicas desde Firestore
  } catch (e) {
    console.error('Error cargando negocio:', e);
  }
}

// ── Aplicar apariencia personalizada ─────────────────────── //
function applyApariencia() {
  const ap = state.negocio?.apariencia;
  if (!ap) return;

  const root = document.documentElement;

  // ── CSS vars dinámicas ──
  if (ap.colorPrimario) {
    root.style.setProperty('--amber',       ap.colorPrimario);
    root.style.setProperty('--amber-dark',  shadeColor(ap.colorPrimario, -20));
    root.style.setProperty('--amber-light', shadeColor(ap.colorPrimario, +20));
    // Actualizar amber-glow también
    const hex = ap.colorPrimario.replace('#', '');
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8)  & 0xff;
    const b =  num        & 0xff;
    root.style.setProperty('--amber-glow', `rgba(${r},${g},${b},.18)`);
  }
  if (ap.colorFondo) root.style.setProperty('--cream', ap.colorFondo);

  // ── Hero ──
  const hero = document.querySelector('.hero-section');
  if (hero) {
    if (ap.imagenFondo) {
      // Desactivar el ::before decorativo para que no tape la imagen
      hero.classList.add('has-bg-image');
      hero.style.background = `url('${ap.imagenFondo}') center/cover no-repeat`;

      // Overlay oscuro via elemento hijo
      const opacity = (ap.overlayOpacidad ?? 40) / 100;
      let ov = hero.querySelector('.hero-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.className = 'hero-overlay';
        hero.insertBefore(ov, hero.firstChild);
      }
      ov.style.background = `rgba(0,0,0,${opacity})`;
    } else if (ap.colorHero) {
      hero.style.background = ap.colorHero;
    }
  }

  // ── Textos del hero ──
  const eyebrow  = document.querySelector('.hero-eyebrow');
  const titleEl  = document.querySelector('.hero-title');
  const subtitEl = document.querySelector('.hero-subtitle');

  if (eyebrow && ap.slogan)    eyebrow.textContent = ap.slogan;
  if (titleEl) {
    const t  = ap.titulo   || null;
    const em = ap.tituloEm || null;
    // Solo sobreescribir si el admin configuró algo
    if (t || em) {
      titleEl.innerHTML = `${t || 'Pan artesanal,'}<br><em>${em || 'sabor de siempre'}</em>`;
    }
  }
  if (subtitEl && ap.subtitulo) subtitEl.textContent = ap.subtitulo;

  // ── Emoji / ícono de marca ──
  if (ap.emoji) {
    const brandIcon = document.querySelector('.brand-icon');
    if (brandIcon) brandIcon.textContent = ap.emoji;
  }

  // ── Color de fondo del header (usa --brown, no lo tocamos) ──
  // El header usa var(--brown) que es el color del texto/fondo oscuro,
  // no lo sobreescribimos para mantener contraste.
}

// ── Render info del negocio ───────────────────────────────── //
function renderNegocioInfo() {
  const n = state.negocio;
  if (!n) return;
  document.title = `${n.nombre} — Pedidos Online`;
  const headerName = $('#header-name');
  if (headerName) headerName.textContent = n.nombre;
  if (n.telefono) {
    const el = $('#info-tel');
    if (el) el.innerHTML = `📞 ${n.telefono}`;
  }
  if (n.direccion) {
    const el = $('#info-dir');
    if (el) el.innerHTML = `📍 ${n.direccion}`;
  }
}

// ── Categorías dinámicas desde Firestore ──────────────────── //
function renderCategoriasFiltros() {
  const n = state.negocio;
  const categorias = n?.categorias?.length ? n.categorias : null;
  if (!categorias) return; // mantener las hardcodeadas del HTML

  const container = document.querySelector('.category-filters');
  if (!container) return;

  // Reconstruir botones dinámicamente
  container.innerHTML = `<button class="cat-btn active" data-cat="all">Todos</button>` +
    categorias.map(cat => {
      // Intentar asignar un emoji según el nombre
      const emoji = getCatEmoji(cat);
      return `<button class="cat-btn" data-cat="${cat.toLowerCase()}">${emoji} ${cat}</button>`;
    }).join('');

  // Re-bindear eventos
  $$('.cat-btn', container).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.cat-btn', container).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.categoria = btn.dataset.cat;
      applyFilters();
    });
  });
}

function getCatEmoji(cat) {
  const map = {
    panes: '🍞', pan: '🍞',
    facturas: '🥐', medialunas: '🥐',
    tortas: '🎂', pastelería: '🎂', pasteleria: '🎂',
    bebidas: '🥤', bebida: '🥤',
    sandwiches: '🥪', sandwich: '🥪',
    pizzas: '🍕', pizza: '🍕',
    otros: '✨', general: '📦',
  };
  return map[cat.toLowerCase()] || '🏷️';
}

// ── Cargar promociones ────────────────────────────────────── //
async function loadPromociones() {
  try {
    const promoCol = collection(db, 'negocios', NEGOCIO_ID, 'promociones');
    const snap = await getDocs(promoCol);
    const activas = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.activo);

    if (!activas.length) return;

    const promo  = activas[0];
    const banner = $('#promo-banner');
    const titleEl  = $('#promo-title');
    const subdesc  = $('#promo-subdesc');
    if (titleEl)  titleEl.textContent  = promo.titulo      || '¡Oferta especial!';
    if (subdesc)  subdesc.textContent  = promo.descripcion || '';
    if (banner)   banner.classList.remove('hidden');

    const dismissed = sessionStorage.getItem(`promo_dismissed_${NEGOCIO_ID}`);
    if (!dismissed) {
      setTimeout(() => showPromoModal(promo), 1200);
    }

    $('#promo-close')?.addEventListener('click', () => {
      banner?.classList.add('hidden');
    });
  } catch (e) {
    console.error('Error cargando promociones:', e);
  }
}

function showPromoModal(promo) {
  const modal = $('#promo-modal');
  if (!modal) return;
  const titleEl = $('#modal-title');
  const descEl  = $('#modal-desc');
  if (titleEl) titleEl.textContent = promo.titulo      || '¡Promoción!';
  if (descEl)  descEl.textContent  = promo.descripcion || '';
  modal.classList.remove('hidden');

  const close = () => {
    modal.classList.add('hidden');
    sessionStorage.setItem(`promo_dismissed_${NEGOCIO_ID}`, '1');
  };
  const closeBtn = $('#modal-close');
  const ctaBtn   = $('#modal-cta');
  if (closeBtn) closeBtn.onclick = close;
  if (ctaBtn)   ctaBtn.onclick   = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// ── Cargar productos ──────────────────────────────────────── //
async function loadProductos() {
  try {
    const prodCol = collection(db, 'negocios', NEGOCIO_ID, 'productos');
    const q       = query(prodCol, orderBy('nombre'));
    const snap    = await getDocs(q);
    state.productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilters();
  } catch (e) {
    console.error('Error cargando productos:', e);
    showToast('Error al cargar los productos.', 'error');
  }
}

// ── Filtros ────────────────────────────────────────────────── //
function applyFilters() {
  let lista = [...state.productos];

  if (state.categoria !== 'all') {
    lista = lista.filter(p =>
      (p.categoria || '').toLowerCase() === state.categoria.toLowerCase()
    );
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    lista = lista.filter(p =>
      (p.nombre      || '').toLowerCase().includes(q) ||
      (p.descripcion || '').toLowerCase().includes(q)
    );
  }

  state.filtrados = lista;
  renderProductos();
}

// ── Render productos ───────────────────────────────────────── //
function renderProductos() {
  const grid = $('#products-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!state.filtrados.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="emoji">🥐</div>
        <h3>No encontramos productos</h3>
        <p>Probá con otra búsqueda o categoría.</p>
      </div>`;
    return;
  }

  state.filtrados.forEach(p => {
    const card = document.createElement('article');
    card.className = `product-card${p.disponible === false ? ' out-of-stock' : ''}`;
    card.dataset.id = p.id;

    const enCarrito = state.carrito.some(c => c.id === p.id);
    if (enCarrito) card.classList.add('selected');

    const precio = typeof p.precio === 'number'
      ? `$${p.precio.toLocaleString('es-AR')}`
      : p.precio || '';

    const badgeClass = p.disponible !== false ? 'available'   : 'unavailable';
    const badgeText  = p.disponible !== false ? '✅ Disponible' : '❌ Sin stock';
    const btnText    = enCarrito ? 'Agregado ✓' : 'Pedir';

    card.innerHTML = `
      <div class="product-img-wrap">
        <img
          src="${p.imagen || 'https://placehold.co/400x300/F5ECD8/6B4226?text=🍞'}"
          alt="${p.nombre}"
          loading="lazy"
        />
        <span class="stock-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="product-info">
        <span class="product-category">${p.categoria || ''}</span>
        <h3 class="product-name">${p.nombre}</h3>
        <p class="product-desc">${p.descripcion || ''}</p>
        <div class="product-footer">
          <span class="product-price">${precio}</span>
          <button
            class="btn-pedido"
            data-nombre="${p.nombre}"
            data-precio="${precio}"
            ${p.disponible === false ? 'disabled aria-disabled="true"' : ''}
          >${p.disponible !== false ? btnText : 'Sin stock'}</button>
        </div>
      </div>`;

    card.querySelector('.btn-pedido')?.addEventListener('click', () => {
      if (p.disponible !== false) prefillOrder(p);
    });

    grid.appendChild(card);
  });
}

// ── Carrito ────────────────────────────────────────────────── //
function addToCarrito(producto) {
  if (state.carrito.some(c => c.id === producto.id)) return;
  const precio = typeof producto.precio === 'number'
    ? `$${producto.precio.toLocaleString('es-AR')}`
    : producto.precio || '';
  state.carrito.push({ id: producto.id, nombre: producto.nombre, precio });
  renderCarritoSummary();
}

function clearCarrito() {
  state.carrito = [];
  renderCarritoSummary();
  renderProductos();
  toggleOrderSection(false);
  const ta = $('#f-pedido');
  if (ta) ta.value = '';
}

function renderCarritoSummary() {
  const summary  = $('#cart-summary');
  const listEl   = $('#cart-items-list');
  const orderCta = $('#order-cta');

  if (!state.carrito.length) {
    summary?.classList.add('hidden');
    toggleOrderSection(false);
    orderCta?.classList.remove('hidden');
    return;
  }

  summary?.classList.remove('hidden');
  orderCta?.classList.add('hidden');
  toggleOrderSection(true);

  if (listEl) {
    listEl.innerHTML = state.carrito
      .map(c => `<span>${c.nombre} <small style="opacity:.65">${c.precio}</small></span>`)
      .join(' &nbsp;·&nbsp; ');
  }

  syncPedidoTextarea();
}

function syncPedidoTextarea() {
  const ta = $('#f-pedido');
  if (!ta) return;
  const lineas   = state.carrito.map(c => `${c.nombre} (${c.precio})`);
  const existing = ta.value.split('\n').filter(l => l.trim());
  const manuales = existing.filter(l => !state.carrito.some(c => l.startsWith(c.nombre)));
  ta.value = [...lineas, ...manuales].join('\n');
}

function toggleOrderSection(visible) {
  const sec = $('#order-section');
  if (!sec) return;
  sec.classList.toggle('visible', visible);
}

// ── Prellenar pedido ──────────────────────────────────────── //
function prefillOrder(producto) {
  addToCarrito(producto);

  const card = $(`[data-id="${producto.id}"]`);
  if (card) {
    card.classList.add('selected');
    const btn = card.querySelector('.btn-pedido');
    if (btn && producto.disponible !== false) btn.textContent = 'Agregado ✓';
  }

  setTimeout(() => {
    document.getElementById('order-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ── Repetir último pedido ──────────────────────────────────── //
function loadLastOrder() {
  const last = localStorage.getItem(`last_order_${NEGOCIO_ID}`);
  if (!last) { showToast('No hay ningún pedido guardado aún.', 'info'); return; }
  try {
    const data = JSON.parse(last);
    const nombre   = $('#f-nombre');
    const tel      = $('#f-tel');
    const dir      = $('#f-dir');
    const pedido   = $('#f-pedido');
    if (nombre)  nombre.value  = data.nombre    || '';
    if (tel)     tel.value     = data.telefono  || '';
    if (dir)     dir.value     = data.direccion || '';
    if (pedido)  pedido.value  = data.pedido    || '';

    if (!$('#order-section')?.classList.contains('visible')) {
      toggleOrderSection(true);
      $('#order-cta')?.classList.add('hidden');
    }
    showToast('Último pedido cargado 🔁', 'success');
    document.getElementById('order-section')?.scrollIntoView({ behavior: 'smooth' });
  } catch {
    showToast('No se pudo cargar el pedido anterior.', 'error');
  }
}

// ── Validación ────────────────────────────────────────────── //
const TEL_REGEX = /^[+]?[\d\s\-()]{7,20}$/;

function validateField(id, groupId, testFn) {
  const input = $(id);
  const group = $(groupId);
  if (!input || !group) return true;
  const valid = testFn(input.value.trim());
  group.classList.toggle('has-error', !valid);
  return valid;
}

function validateForm() {
  const v1 = validateField('#f-nombre', '#fg-nombre', v => v.length >= 3);
  const v2 = validateField('#f-tel',    '#fg-tel',    v => TEL_REGEX.test(v));
  const v3 = validateField('#f-dir',    '#fg-dir',    v => v.length >= 5);
  const v4 = validateField('#f-pedido', '#fg-pedido', v => v.length >= 5);
  return v1 && v2 && v3 && v4;
}

// ── Enviar pedido ──────────────────────────────────────────── //
async function submitOrder(e) {
  e.preventDefault();
  if (!validateForm()) {
    showToast('Completá todos los campos correctamente.', 'error');
    return;
  }

  const nombre    = $('#f-nombre').value.trim();
  const telefono  = $('#f-tel').value.trim();
  const direccion = $('#f-dir').value.trim();
  const pedido    = $('#f-pedido').value.trim();

  const btnText    = $('#btn-text');
  const btnLoading = $('#btn-loading');
  const btnEnviar  = $('#btn-enviar');
  if (btnText)    btnText.classList.add('hidden');
  if (btnLoading) btnLoading.classList.remove('hidden');
  if (btnEnviar)  btnEnviar.disabled = true;

  try {
    await addDoc(collection(db, 'negocios', NEGOCIO_ID, 'pedidos'), {
      nombre, telefono, direccion, pedido,
      estado: 'pendiente',
      createdAt: serverTimestamp(),
    });

    localStorage.setItem(`last_order_${NEGOCIO_ID}`, JSON.stringify(
      { nombre, telefono, direccion, pedido }
    ));

    // ── Mensaje WhatsApp ──
    const waMsg = encodeURIComponent(
      `🍞 *Nuevo pedido*\n\n` +
      `👤 *Nombre:* ${nombre}\n` +
      `📋 *Pedido:* ${pedido}\n` +
      `📍 *Dirección:* ${direccion}\n` +
      `📞 *Teléfono:* ${telefono}`
    );
    // ✅ usa state.negocio (no admin.negocio)
    const waNum = (state.negocio?.telefono || '').replace(/\D/g, '');
    const waUrl = waNum
      ? `https://wa.me/${waNum}?text=${waMsg}`
      : `https://wa.me/?text=${waMsg}`;

    showToast('¡Pedido enviado! Redirigiendo a WhatsApp...', 'success');

    $('#order-form')?.reset();
    state.carrito = [];
    renderCarritoSummary();
    renderProductos();

    setTimeout(() => { window.open(waUrl, '_blank'); }, 1000);

  } catch (err) {
    console.error('Error guardando pedido:', err);
    showToast('Hubo un error al guardar el pedido. Intentá de nuevo.', 'error');
  } finally {
    if (btnText)    btnText.classList.remove('hidden');
    if (btnLoading) btnLoading.classList.add('hidden');
    if (btnEnviar)  btnEnviar.disabled = false;
  }
}

// ── Debounce ───────────────────────────────────────────────── //
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Event Listeners ────────────────────────────────────────── //
function setupListeners() {
  $('#search-input')?.addEventListener('input', debounce(e => {
    state.searchQuery = e.target.value;
    applyFilters();
  }, 280));

  // Categorías estáticas del HTML (se reemplazan si hay dinámicas)
  $$('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.categoria = btn.dataset.cat;
      applyFilters();
    });
  });

  $('#order-form')?.addEventListener('submit', submitOrder);
  $('#btn-repetir')?.addEventListener('click', loadLastOrder);
  $('#btn-clear-cart')?.addEventListener('click', clearCarrito);

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// ── Bootstrap ──────────────────────────────────────────────── //
async function init() {
  setupListeners();
  try {
    await Promise.all([
      loadNegocio(),      // applyApariencia() y renderCategoriasFiltros() se llaman adentro
      loadProductos(),
      loadPromociones(),
    ]);
  } catch (e) {
    console.error('Error en inicialización:', e);
  } finally {
    hideLoader();
  }
}

init();