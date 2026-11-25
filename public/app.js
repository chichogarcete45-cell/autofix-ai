// =====================================================================
// AutoFix AI - Lógica de la página (navegador)
// =====================================================================

const estado = {
  talleres: [],      // todos los registros traídos de Supabase
  mapa: null,
  modo: null,       // 'google' o 'libre'
  infoWindow: null,
  marcadores: new Map(), // id -> marcador
  mapaListo: false,
  editandoId: null,  // null = alta, número = modificación
  borrandoId: null,
  eligiendoUbicacion: false,
  marcadorTemporal: null,
  historialChat: [],
};

const $ = (sel) => document.querySelector(sel);
const CENTRO_ASUNCION = { lat: -25.2967, lng: -57.6100 };
const COLORES = { 'Taller mecánico': '#2563eb', 'Gomería': '#16a34a', 'Casa de repuestos': '#9333ea' };

// ---------- Utilidades ----------
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function gs(n) {
  return n == null ? 'Consultar' : 'Gs. ' + Number(n).toLocaleString('es-PY');
}
function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
let temporizadorToast;
function aviso(mensaje, error = false) {
  const t = $('#toast');
  t.textContent = mensaje;
  t.classList.toggle('error', error);
  t.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), 3500);
}
async function api(url, opciones = {}) {
  const resp = await fetch(url, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error || `Error ${resp.status}`);
  return datos;
}

// ---------- Cargar datos (Consulta) ----------
async function cargarTalleres() {
  try {
    estado.talleres = await api('/api/talleres');
    actualizarOpcionesFiltros();
    renderizar();
  } catch (e) {
    $('#resumen').textContent = '';
    $('#lista').innerHTML = `<div class="vacio">⚠️ No se pudieron cargar los datos.<br><small>${esc(e.message)}</small></div>`;
  }
}

function actualizarOpcionesFiltros() {
  const llenar = (select, valores, textoTodos) => {
    const actual = select.value;
    const ordenados = [...valores].sort((a, b) => a.localeCompare(b, 'es'));
    select.innerHTML = `<option value="">${textoTodos}</option>` +
      ordenados.map((v) => `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  };
  const especialidades = new Set();
  const mantenimientos = new Set();
  for (const t of estado.talleres) {
    t.especialidades.forEach((e) => especialidades.add(e));
    t.servicios.forEach((s) => mantenimientos.add(s.tipo_mantenimiento));
  }
  llenar($('#filtroEspecialidad'), especialidades, 'Todas las especialidades');
  llenar($('#filtroMantenimiento'), mantenimientos, 'Todo tipo de mantenimiento');
}

// ---------- Búsqueda y filtrado ----------
function talleresFiltrados() {
  const texto = normalizar($('#buscar').value.trim());
  const tipo = $('#filtroTipo').value;
  const especialidad = $('#filtroEspecialidad').value;
  const mantenimiento = $('#filtroMantenimiento').value;

  return estado.talleres.filter((t) => {
    if (tipo && t.tipo !== tipo) return false;
    if (especialidad && !t.especialidades.includes(especialidad)) return false;
    if (mantenimiento && !t.servicios.some((s) => s.tipo_mantenimiento === mantenimiento)) return false;
    if (texto) {
      const todo = normalizar([
        t.nombre, t.tipo, t.direccion, t.telefono, t.horario,
        ...t.especialidades,
        ...t.servicios.flatMap((s) => [s.nombre, s.tipo_mantenimiento]),
      ].join(' '));
      if (!texto.split(/\s+/).every((palabra) => todo.includes(palabra))) return false;
    }
    return true;
  });
}

function renderizar() {
  const lista = talleresFiltrados();
  const total = estado.talleres.length;
  $('#resumen').textContent = lista.length === total
    ? `${total} establecimiento${total === 1 ? '' : 's'} registrado${total === 1 ? '' : 's'}`
    : `Mostrando ${lista.length} de ${total} establecimientos`;

  $('#lista').innerHTML = lista.length
    ? lista.map(tarjetaHtml).join('')
    : '<div class="vacio">No se encontraron establecimientos con esos filtros.</div>';

  actualizarMarcadores(lista);
}

function tarjetaHtml(t) {
  const servicios = t.servicios.length
    ? `<table class="servicios">${t.servicios.map((s) => `
        <tr><td>${esc(s.nombre)}<span class="tm">${esc(s.tipo_mantenimiento)}</span></td><td>${gs(s.precio_estimado)}</td></tr>`).join('')}
      </table>`
    : '<p class="datos">Sin servicios cargados.</p>';
  return `
  <article class="tarjeta" id="taller-${t.id}" data-tipo="${esc(t.tipo)}">
    <div class="tarjeta-cab">
      <div>
        <span class="etiqueta-tipo">${esc(t.tipo)}</span>
        <h3>${esc(t.nombre)}</h3>
      </div>
    </div>
    <div class="datos">
      <span>📍 ${esc(t.direccion)}</span>
      ${t.telefono ? `<span>📞 <a href="tel:${esc(t.telefono.replace(/[^\d+]/g, ''))}">${esc(t.telefono)}</a></span>` : ''}
      ${t.email ? `<span>✉️ ${esc(t.email)}</span>` : ''}
      ${t.horario ? `<span>🕒 ${esc(t.horario)}</span>` : ''}
    </div>
    ${t.especialidades.length ? `<div class="chips">${t.especialidades.map((e) => `<span class="chip">${esc(e)}</span>`).join('')}</div>` : ''}
    ${servicios}
    <div class="tarjeta-acciones">
      <button class="btn btn-claro btn-chico" data-accion="mapa" data-id="${t.id}">🗺️ Ver en mapa</button>
      <button class="btn btn-claro btn-chico" data-accion="editar" data-id="${t.id}">✏️ Modificar</button>
      <button class="btn btn-claro btn-chico" data-accion="borrar" data-id="${t.id}">🗑️ Eliminar</button>
      <a class="btn btn-claro btn-chico" href="https://www.google.com/maps/dir/?api=1&destination=${t.latitud},${t.longitud}" target="_blank" rel="noopener">🚗 Cómo llegar</a>
    </div>
  </article>`;
}

// ---------- Mapa ----------
// Dos modos:
//  - "google": Google Maps JavaScript API (si hay GOOGLE_MAPS_API_KEY con facturación)
//  - "libre":  mapa interactivo gratuito (Leaflet + OpenStreetMap) con todos los marcadores,
//              y en cada marcador el mapa de Google Maps del lugar (sin clave, sin costo)
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';

async function iniciarMapa() {
  let config = {};
  try {
    config = await api('/api/config');
  } catch { /* sin configuración: se usa el modo libre */ }
  if (config.mapsKey) cargarGoogleMaps(config.mapsKey);
  else cargarMapaLibre();
}

function mostrarAvisoMapa(texto) {
  const a = $('#avisoMapa');
  a.textContent = '🗺️ ' + texto;
  a.classList.remove('oculto');
}

// Reemplaza el contenedor del mapa por uno limpio (por si Google falló)
function reiniciarContenedorMapa() {
  const nuevo = document.createElement('div');
  nuevo.id = 'mapa';
  $('#mapa').replaceWith(nuevo);
  estado.mapa = null;
  estado.mapaListo = false;
  estado.marcadores.clear();
}

// ----- Modo Google Maps (con clave) -----
function cargarGoogleMaps(clave) {
  estado.modo = 'google';
  // Si la clave es rechazada (por ejemplo, sin facturación) se pasa al modo libre
  window.gm_authFailure = () => {
    console.warn('Google Maps rechazó la clave; se usa el mapa libre.');
    reiniciarContenedorMapa();
    cargarMapaLibre();
  };
  window.__initMapa = crearMapaGoogle;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(clave)}&loading=async&libraries=marker&language=es&region=PY&callback=__initMapa`;
  script.async = true;
  script.onerror = () => { reiniciarContenedorMapa(); cargarMapaLibre(); };
  document.head.appendChild(script);
}

function crearMapaGoogle() {
  if (estado.modo !== 'google') return;
  estado.mapa = new google.maps.Map($('#mapa'), {
    center: CENTRO_ASUNCION,
    zoom: 13,
    mapId: 'DEMO_MAP_ID', // necesario para los marcadores avanzados
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
    gestureHandling: 'greedy',
  });
  estado.infoWindow = new google.maps.InfoWindow();
  estado.mapa.addListener('click', (e) => {
    if (estado.eligiendoUbicacion) terminarEleccion(e.latLng.lat(), e.latLng.lng());
  });
  estado.mapaListo = true;
  actualizarMarcadores(talleresFiltrados(), true);
}

// ----- Modo libre (sin clave ni facturación) -----
function cargarMapaLibre() {
  estado.modo = 'libre';
  if (window.L) return crearMapaLibre();
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = LEAFLET + 'leaflet.css';
  document.head.appendChild(css);
  const script = document.createElement('script');
  script.src = LEAFLET + 'leaflet.js';
  script.onload = crearMapaLibre;
  script.onerror = () => mostrarAvisoMapa('No se pudo cargar el mapa. Revisá tu conexión a internet.');
  document.head.appendChild(script);
}

function crearMapaLibre() {
  estado.mapa = L.map('mapa', { zoomControl: true }).setView([CENTRO_ASUNCION.lat, CENTRO_ASUNCION.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(estado.mapa);
  estado.mapa.on('click', (e) => {
    if (estado.eligiendoUbicacion) terminarEleccion(e.latlng.lat, e.latlng.lng);
  });
  estado.mapaListo = true;
  actualizarMarcadores(talleresFiltrados(), true);
}

// ----- Funciones comunes a los dos modos -----
function crearMarcador(t) {
  const color = COLORES[t.tipo] || '#f97316';

  if (estado.modo === 'libre') {
    const m = L.circleMarker([t.latitud, t.longitud], {
      radius: 11, color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1,
    }).addTo(estado.mapa);
    m.bindTooltip(t.nombre, { direction: 'top', offset: [0, -10] });
    m.on('click', () => abrirInfo(t.id));
    return { marcador: m, quitar: () => m.remove() };
  }

  const posicion = { lat: t.latitud, lng: t.longitud };
  // Marcador avanzado (recomendado por Google); si no está disponible, el clásico
  if (google.maps.marker?.AdvancedMarkerElement && google.maps.marker?.PinElement) {
    try {
      const pin = new google.maps.marker.PinElement({ background: color, borderColor: '#ffffff', glyphColor: '#ffffff' });
      const m = new google.maps.marker.AdvancedMarkerElement({
        map: estado.mapa, position: posicion, title: t.nombre, content: pin.element, gmpClickable: true,
      });
      m.addListener('click', () => abrirInfo(t.id));
      return { marcador: m, quitar: () => { m.map = null; } };
    } catch (e) {
      console.warn('Marcador avanzado no disponible, se usa el clásico:', e);
    }
  }
  const m = new google.maps.Marker({
    map: estado.mapa, position: posicion, title: t.nombre,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
  });
  m.addListener('click', () => abrirInfo(t.id));
  return { marcador: m, quitar: () => m.setMap(null) };
}

function cerrarInfo() {
  if (!estado.mapaListo) return;
  if (estado.modo === 'libre') estado.mapa.closePopup();
  else estado.infoWindow.close();
}

function actualizarMarcadores(lista, encuadrar = false) {
  if (!estado.mapaListo) return;
  for (const m of estado.marcadores.values()) m.quitar();
  estado.marcadores.clear();
  cerrarInfo();

  for (const t of lista) estado.marcadores.set(t.id, crearMarcador(t));
  if (!encuadrar || lista.length < 2) return;

  if (estado.modo === 'libre') {
    estado.mapa.fitBounds(lista.map((t) => [t.latitud, t.longitud]), { padding: [50, 50] });
  } else {
    const limites = new google.maps.LatLngBounds();
    lista.forEach((t) => limites.extend({ lat: t.latitud, lng: t.longitud }));
    estado.mapa.fitBounds(limites, 50);
  }
}

function enlacesGoogle(t) {
  const punto = `${t.latitud},${t.longitud}`;
  return `<div class="info-enlaces">
      <a href="https://www.google.com/maps/search/?api=1&query=${punto}" target="_blank" rel="noopener">🗺️ Abrir en Google Maps</a>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${punto}" target="_blank" rel="noopener">🚗 Cómo llegar</a>
    </div>`;
}

function infoHtml(t) {
  // En modo libre se muestra además el mapa de Google Maps del lugar (embebido, sin clave)
  const googleEmbebido = estado.modo === 'libre'
    ? `<iframe class="info-gmaps" title="Google Maps - ${esc(t.nombre)}" loading="lazy"
         src="https://maps.google.com/maps?q=${t.latitud},${t.longitud}&z=16&hl=es&output=embed"></iframe>`
    : '';
  return `<div class="info">
    <span class="etiqueta-tipo" style="color:${COLORES[t.tipo] || '#f97316'}">${esc(t.tipo)}</span>
    <h4>${esc(t.nombre)}</h4>
    <div>📍 ${esc(t.direccion)}</div>
    ${t.telefono ? `<div>📞 ${esc(t.telefono)}</div>` : ''}
    ${t.horario ? `<div>🕒 ${esc(t.horario)}</div>` : ''}
    ${t.especialidades.length ? `<div><strong>Especialidades:</strong> ${esc(t.especialidades.join(', '))}</div>` : ''}
    ${t.servicios.length ? `<ul>${t.servicios.slice(0, 5).map((s) => `<li>${esc(s.nombre)}: <strong>${gs(s.precio_estimado)}</strong></li>`).join('')}</ul>` : ''}
    ${googleEmbebido}
    ${enlacesGoogle(t)}
  </div>`;
}

function abrirInfo(id) {
  const t = estado.talleres.find((x) => x.id === id);
  const m = estado.marcadores.get(id);
  if (!t || !m) return;
  if (estado.modo === 'libre') {
    L.popup({ maxWidth: 290, minWidth: 250, autoPanPadding: [20, 20] })
      .setLatLng([t.latitud, t.longitud])
      .setContent(infoHtml(t))
      .openOn(estado.mapa);
  } else {
    estado.infoWindow.setContent(infoHtml(t));
    estado.infoWindow.open({ map: estado.mapa, anchor: m.marcador });
  }
  // Resalta la tarjeta correspondiente en el catálogo
  document.querySelectorAll('.tarjeta.seleccionada').forEach((el) => el.classList.remove('seleccionada'));
  const tarjeta = document.getElementById(`taller-${id}`);
  if (tarjeta) {
    tarjeta.classList.add('seleccionada');
    if (window.innerWidth > 900) tarjeta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function verEnMapa(id) {
  const t = estado.talleres.find((x) => x.id === id);
  if (!t) return;
  cambiarVista('mapa');
  if (!estado.mapaListo) return aviso('El mapa todavía no está disponible.', true);
  if (estado.modo === 'libre') {
    estado.mapa.setView([t.latitud, t.longitud], 16);
  } else {
    estado.mapa.panTo({ lat: t.latitud, lng: t.longitud });
    estado.mapa.setZoom(16);
  }
  abrirInfo(id);
}

function ponerMarcadorTemporal(lat, lng) {
  quitarMarcadorTemporal();
  if (estado.modo === 'libre') {
    const m = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#f97316', fillOpacity: 1 }).addTo(estado.mapa);
    estado.marcadorTemporal = { quitar: () => m.remove() };
  } else {
    const m = new google.maps.Marker({ map: estado.mapa, position: { lat, lng } });
    estado.marcadorTemporal = { quitar: () => m.setMap(null) };
  }
}
function quitarMarcadorTemporal() {
  if (estado.marcadorTemporal) estado.marcadorTemporal.quitar();
  estado.marcadorTemporal = null;
}

// ---------- Vistas en celular (Catálogo / Mapa) ----------
function cambiarVista(vista) {
  $('.contenido').dataset.vista = vista;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('activo', b.dataset.vista === vista));
  if (estado.modo === 'libre' && estado.mapaListo) estado.mapa.invalidateSize();
}

// ---------- Formulario: Alta y Modificación ----------
function filaServicio(s = {}) {
  const div = document.createElement('div');
  div.className = 'fila-servicio';
  div.innerHTML = `
    <input placeholder="Servicio (ej.: Cambio de aceite)" data-campo="nombre" value="${esc(s.nombre || '')}" maxlength="120" />
    <input placeholder="Tipo de mantenimiento" data-campo="tipo_mantenimiento" list="tiposMantenimiento" value="${esc(s.tipo_mantenimiento || '')}" maxlength="60" />
    <input placeholder="Precio Gs." data-campo="precio_estimado" type="number" min="0" step="1000" value="${s.precio_estimado ?? ''}" />
    <button type="button" class="btn-icono" title="Quitar servicio" aria-label="Quitar servicio">✕</button>`;
  div.querySelector('button').onclick = () => div.remove();
  $('#filasServicios').appendChild(div);
}

function abrirFormulario(id = null) {
  const form = $('#formTaller');
  form.reset();
  $('#errorForm').textContent = '';
  $('#filasServicios').innerHTML = '';
  estado.editandoId = id;

  if (id) {
    const t = estado.talleres.find((x) => x.id === id);
    $('#tituloModal').textContent = 'Modificar establecimiento';
    for (const campo of ['nombre', 'tipo', 'direccion', 'telefono', 'email', 'horario', 'latitud', 'longitud']) {
      form.elements[campo].value = t[campo] ?? '';
    }
    form.elements.especialidades.value = t.especialidades.join(', ');
    t.servicios.forEach(filaServicio);
  } else {
    $('#tituloModal').textContent = 'Nuevo establecimiento';
  }
  if (!$('#filasServicios').children.length) filaServicio();
  $('#modal').showModal();
}

function datosFormulario() {
  const f = $('#formTaller').elements;
  return {
    nombre: f.nombre.value,
    tipo: f.tipo.value,
    especialidades: f.especialidades.value.split(',').map((s) => s.trim()).filter(Boolean),
    direccion: f.direccion.value,
    telefono: f.telefono.value,
    email: f.email.value,
    horario: f.horario.value,
    latitud: f.latitud.value,
    longitud: f.longitud.value,
    servicios: [...document.querySelectorAll('.fila-servicio')].map((fila) => {
      const s = {};
      fila.querySelectorAll('input').forEach((i) => (s[i.dataset.campo] = i.value));
      return s;
    }),
  };
}

async function guardar(e) {
  e.preventDefault();
  const datos = datosFormulario();
  const faltan = [];
  if (!datos.nombre.trim()) faltan.push('nombre');
  if (!datos.direccion.trim()) faltan.push('dirección');
  if (datos.latitud === '') faltan.push('latitud');
  if (datos.longitud === '') faltan.push('longitud');
  if (faltan.length) {
    $('#errorForm').textContent = 'Completá: ' + faltan.join(', ') + '.';
    return;
  }

  const boton = $('#btnGuardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const id = estado.editandoId;
    const guardado = await api(id ? `/api/talleres/${id}` : '/api/talleres', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(datos),
    });
    $('#modal').close();
    quitarMarcadorTemporal();
    await cargarTalleres();
    aviso(id ? 'Cambios guardados ✔' : 'Establecimiento registrado ✔');
    if (estado.mapaListo) verEnMapa(guardado.id);
  } catch (err) {
    $('#errorForm').textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

// ---------- Elegir ubicación en el mapa ----------
function empezarEleccion() {
  if (!estado.mapaListo) return aviso('El mapa no está disponible; ingresá las coordenadas manualmente.', true);
  estado.eligiendoUbicacion = true;
  $('#modal').close();
  document.body.classList.add('eligiendo');
  $('#bannerUbicacion').classList.remove('oculto');
  cambiarVista('mapa');
}
function terminarEleccion(lat, lng) {
  estado.eligiendoUbicacion = false;
  document.body.classList.remove('eligiendo');
  $('#bannerUbicacion').classList.add('oculto');
  if (lat !== undefined) {
    const f = $('#formTaller').elements;
    f.latitud.value = lat.toFixed(6);
    f.longitud.value = lng.toFixed(6);
    ponerMarcadorTemporal(lat, lng);
  }
  $('#modal').showModal();
}
function usarMiUbicacion() {
  if (!navigator.geolocation) return aviso('Tu navegador no permite obtener la ubicación.', true);
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const f = $('#formTaller').elements;
      f.latitud.value = p.coords.latitude.toFixed(6);
      f.longitud.value = p.coords.longitude.toFixed(6);
    },
    () => aviso('No se pudo obtener tu ubicación (permiso denegado).', true),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ---------- Baja ----------
function pedirBorrado(id) {
  const t = estado.talleres.find((x) => x.id === id);
  estado.borrandoId = id;
  $('#nombreBorrar').textContent = t.nombre;
  $('#modalBorrar').showModal();
}
async function confirmarBorrado() {
  const boton = $('#btnSiBorrar');
  boton.disabled = true;
  try {
    await api(`/api/talleres/${estado.borrandoId}`, { method: 'DELETE' });
    $('#modalBorrar').close();
    await cargarTalleres();
    aviso('Establecimiento eliminado ✔');
  } catch (err) {
    aviso(err.message, true);
  } finally {
    boton.disabled = false;
  }
}

// ---------- Asistente inteligente ----------
// Convierte el formato simple de Gemini (negritas y listas) a HTML seguro
function markdownSimple(texto) {
  const lineas = esc(texto).split('\n');
  let html = '';
  let lista = null;
  const cerrarLista = () => { if (lista) { html += `</${lista}>`; lista = null; } };
  for (let linea of lineas) {
    linea = linea.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
    const vineta = linea.match(/^\s*[-*•]\s+(.*)/);
    const numero = linea.match(/^\s*\d+[.)]\s+(.*)/);
    if (vineta || numero) {
      const tipo = vineta ? 'ul' : 'ol';
      if (lista !== tipo) { cerrarLista(); html += `<${tipo}>`; lista = tipo; }
      html += `<li>${(vineta || numero)[1]}</li>`;
    } else if (linea.trim() === '') {
      cerrarLista();
    } else {
      cerrarLista();
      html += `<p>${linea.replace(/^#+\s*/, '')}</p>`;
    }
  }
  cerrarLista();
  return html;
}

function agregarMensaje(texto, tipo) {
  const div = document.createElement('div');
  div.className = `msg ${tipo}`;
  if (tipo === 'asistente') div.innerHTML = markdownSimple(texto);
  else div.textContent = texto;
  $('#chatMensajes').appendChild(div);
  $('#chatMensajes').scrollTop = $('#chatMensajes').scrollHeight;
  return div;
}

async function enviarPregunta(texto) {
  texto = texto.trim();
  if (!texto) return;
  $('#chatInput').value = '';
  $('#chatSugerencias').classList.add('oculto');
  agregarMensaje(texto, 'usuario');

  const escribiendo = agregarMensaje('', 'asistente');
  escribiendo.innerHTML = '<span class="escribiendo"><span></span><span></span><span></span></span>';
  $('#chatEnviar').disabled = true;
  $('#chatInput').disabled = true;

  try {
    const { respuesta } = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ mensaje: texto, historial: estado.historialChat }),
    });
    escribiendo.innerHTML = markdownSimple(respuesta);
    estado.historialChat.push({ rol: 'usuario', texto }, { rol: 'asistente', texto: respuesta });
    estado.historialChat = estado.historialChat.slice(-10);
  } catch (err) {
    escribiendo.className = 'msg error';
    escribiendo.textContent = '⚠️ ' + err.message;
  } finally {
    $('#chatEnviar').disabled = false;
    $('#chatInput').disabled = false;
    $('#chatInput').focus();
    $('#chatMensajes').scrollTop = $('#chatMensajes').scrollHeight;
  }
}

function abrirChat(abrir) {
  $('#chat').classList.toggle('oculto', !abrir);
  $('#fabChat').classList.toggle('oculto', abrir);
  if (abrir) $('#chatInput').focus();
}

// ---------- Eventos ----------
function conectarEventos() {
  ['#buscar', '#filtroTipo', '#filtroEspecialidad', '#filtroMantenimiento'].forEach((sel) =>
    $(sel).addEventListener('input', renderizar)
  );
  $('#btnLimpiar').onclick = () => {
    $('#buscar').value = '';
    ['#filtroTipo', '#filtroEspecialidad', '#filtroMantenimiento'].forEach((s) => ($(s).value = ''));
    renderizar();
  };

  $('#lista').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.accion === 'mapa') verEnMapa(id);
    if (b.dataset.accion === 'editar') abrirFormulario(id);
    if (b.dataset.accion === 'borrar') pedirBorrado(id);
  });

  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => cambiarVista(b.dataset.vista)));

  $('#btnNuevo').onclick = () => abrirFormulario();
  $('#btnCerrarModal').onclick = $('#btnCancelar').onclick = () => { $('#modal').close(); quitarMarcadorTemporal(); };
  $('#formTaller').addEventListener('submit', guardar);
  $('#btnAgregarServicio').onclick = () => filaServicio();
  $('#btnElegirMapa').onclick = empezarEleccion;
  $('#btnCancelarUbicacion').onclick = () => terminarEleccion();
  $('#btnMiUbicacion').onclick = usarMiUbicacion;

  $('#btnNoBorrar').onclick = () => $('#modalBorrar').close();
  $('#btnSiBorrar').onclick = confirmarBorrado;

  $('#fabChat').onclick = () => abrirChat(true);
  $('#btnCerrarChat').onclick = () => abrirChat(false);
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); enviarPregunta($('#chatInput').value); });
  $('#chatSugerencias').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') enviarPregunta(e.target.textContent);
  });
}

conectarEventos();
cargarTalleres();
iniciarMapa();
