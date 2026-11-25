// =====================================================================
// AutoFix AI - Servidor
// Node.js puro (sin dependencias externas). Requiere Node 18 o superior.
//
// Responsabilidades:
//   1. Servir la página web (carpeta /public)
//   2. API REST para altas, bajas, modificaciones y consultas (Supabase)
//   3. Chat inteligente con Gemini que consulta los datos de Supabase
//
// Las claves privadas NUNCA están en el código: se leen de variables
// de entorno (archivo .env en la PC, o "Environment" en Render).
// =====================================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ---------- 1. Cargar variables de entorno desde .env (solo en la PC) ----------
function cargarEnv() {
  const archivo = path.join(__dirname, '.env');
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
cargarEnv();

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
// Modelo de Gemini. "gemini-flash-latest" siempre apunta al Flash más nuevo.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

const TIPOS_VALIDOS = ['Taller mecánico', 'Gomería', 'Casa de repuestos'];

// ---------- 2. Cliente simple para la API REST de Supabase ----------
async function supabase(metodo, ruta, cuerpo) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new ErrorHttp(500, 'Faltan las variables SUPABASE_URL o SUPABASE_SERVICE_KEY en el servidor.');
  }
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  // Las claves antiguas (JWT "eyJ...") también van en Authorization
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await resp.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!resp.ok) {
    const detalle = (datos && (datos.message || datos.hint)) || texto;
    throw new ErrorHttp(502, `Error de Supabase: ${detalle}`);
  }
  return datos;
}

class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const SELECT_COMPLETO = 'select=*,servicios(id,nombre,tipo_mantenimiento,precio_estimado)';

async function listarTalleres() {
  const filas = await supabase('GET', `talleres?${SELECT_COMPLETO}&order=nombre.asc`);
  for (const t of filas) t.servicios = (t.servicios || []).sort((a, b) => a.id - b.id);
  return filas;
}

async function obtenerTaller(id) {
  const filas = await supabase('GET', `talleres?${SELECT_COMPLETO}&id=eq.${id}`);
  if (!filas.length) throw new ErrorHttp(404, 'Establecimiento no encontrado.');
  return filas[0];
}

// Valida y limpia los datos que llegan del formulario
function validarTaller(d) {
  const errores = [];
  const texto = (v) => (typeof v === 'string' ? v.trim() : '');
  const t = {
    nombre: texto(d.nombre),
    tipo: texto(d.tipo),
    especialidades: Array.isArray(d.especialidades)
      ? d.especialidades.map(texto).filter(Boolean)
      : texto(d.especialidades).split(',').map((s) => s.trim()).filter(Boolean),
    direccion: texto(d.direccion),
    telefono: texto(d.telefono) || null,
    email: texto(d.email) || null,
    horario: texto(d.horario) || null,
    latitud: Number(d.latitud),
    longitud: Number(d.longitud),
  };
  if (!t.nombre) errores.push('El nombre es obligatorio.');
  if (!TIPOS_VALIDOS.includes(t.tipo)) errores.push('Tipo de establecimiento no válido.');
  if (!t.direccion) errores.push('La dirección es obligatoria.');
  if (d.latitud === '' || d.latitud == null || !Number.isFinite(t.latitud) || t.latitud < -90 || t.latitud > 90)
    errores.push('La latitud debe ser un número entre -90 y 90.');
  if (d.longitud === '' || d.longitud == null || !Number.isFinite(t.longitud) || t.longitud < -180 || t.longitud > 180)
    errores.push('La longitud debe ser un número entre -180 y 180.');

  const servicios = (Array.isArray(d.servicios) ? d.servicios : [])
    .map((s) => ({
      nombre: texto(s.nombre),
      tipo_mantenimiento: texto(s.tipo_mantenimiento) || 'General',
      precio_estimado: s.precio_estimado === '' || s.precio_estimado == null ? null : Math.round(Number(s.precio_estimado)),
    }))
    .filter((s) => s.nombre);
  for (const s of servicios) {
    if (s.precio_estimado !== null && (!Number.isFinite(s.precio_estimado) || s.precio_estimado < 0))
      errores.push(`Precio no válido en el servicio "${s.nombre}".`);
  }
  if (errores.length) throw new ErrorHttp(400, errores.join(' '));
  return { taller: t, servicios };
}

async function guardarServicios(tallerId, servicios) {
  await supabase('DELETE', `servicios?taller_id=eq.${tallerId}`);
  if (servicios.length) {
    await supabase('POST', 'servicios', servicios.map((s) => ({ ...s, taller_id: tallerId })));
  }
}

async function crearTaller(datos) {
  const { taller, servicios } = validarTaller(datos);
  const [nuevo] = await supabase('POST', 'talleres', taller);
  await guardarServicios(nuevo.id, servicios);
  return obtenerTaller(nuevo.id);
}

async function modificarTaller(id, datos) {
  const { taller, servicios } = validarTaller(datos);
  const filas = await supabase('PATCH', `talleres?id=eq.${id}`, taller);
  if (!filas.length) throw new ErrorHttp(404, 'Establecimiento no encontrado.');
  await guardarServicios(id, servicios);
  return obtenerTaller(id);
}

async function eliminarTaller(id) {
  const filas = await supabase('DELETE', `talleres?id=eq.${id}`);
  if (!filas.length) throw new ErrorHttp(404, 'Establecimiento no encontrado.');
  return { eliminado: true, id };
}

// ---------- 3. Asistente inteligente (Gemini + datos de Supabase) ----------
function formatearGs(n) {
  return n == null ? 'consultar' : 'Gs. ' + Number(n).toLocaleString('es-PY');
}

function contextoTalleres(talleres) {
  if (!talleres.length) return 'No hay establecimientos registrados en este momento.';
  return talleres
    .map((t) => {
      const servicios = t.servicios.length
        ? t.servicios.map((s) => `${s.nombre} [${s.tipo_mantenimiento}] ${formatearGs(s.precio_estimado)}`).join('; ')
        : 'sin servicios cargados';
      return [
        `- ${t.nombre} (${t.tipo})`,
        `  Especialidades: ${t.especialidades.join(', ') || 'no indicadas'}`,
        `  Servicios y precios estimados: ${servicios}`,
        `  Dirección: ${t.direccion} | Tel: ${t.telefono || 'no indicado'} | Horario: ${t.horario || 'no indicado'}`,
      ].join('\n');
    })
    .join('\n');
}

function instruccionSistema(talleres) {
  return `Eres "AutoFix AI", el asistente de un sistema web de talleres mecánicos, gomerías y casas de repuestos de Paraguay.
Respondes siempre en español, de forma clara, amable y breve (máximo unos 180 palabras salvo que pidan detalle). Puedes usar listas con guiones.

Tus tareas:
1. Orientar sobre mantenimiento preventivo del vehículo (aceite, neumáticos, frenos, batería, filtros, líquidos, luces, etc.).
2. Responder qué establecimientos registrados ofrecen un servicio, usando ÚNICAMENTE la lista de abajo. Menciona nombre, dirección, teléfono, horario y precio estimado cuando corresponda. Nunca inventes establecimientos, precios ni datos que no estén en la lista. Si ninguno ofrece el servicio, dilo claramente.
3. Cuando sea útil, recomienda establecimientos de la lista relacionados con la consulta.

Seguridad (obligatorio): para reparaciones de riesgo (frenos, dirección, suspensión, sistema eléctrico o de combustible, airbags, sobrecalentamiento, ruidos o humo anormales, testigos rojos en el tablero) NO des instrucciones de reparación paso a paso: explica el riesgo, recomienda no conducir si es peligroso y deriva a un profesional, sugiriendo un establecimiento de la lista si existe. Las revisiones simples (presión y desgaste de neumáticos, nivel de aceite, luces) sí puedes explicarlas paso a paso.
Si te preguntan algo que no tiene relación con vehículos o con el sistema, indica amablemente que solo ayudas con temas automotrices.
Los precios son estimados y en guaraníes; aclara que pueden variar.

ESTABLECIMIENTOS REGISTRADOS EN LA BASE DE DATOS (datos actuales):
${contextoTalleres(talleres)}`;
}

// Modelos a probar en orden: si uno está saturado o no disponible, se usa el siguiente
function modelosGemini() {
  return [...new Set([
    GEMINI_MODEL,
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ])];
}

// Errores temporales o de modelo no disponible: conviene probar otro modelo
const ERRORES_REINTENTABLES = [404, 429, 500, 503, 504];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function preguntarGemini(mensaje, historial) {
  if (!GEMINI_API_KEY) throw new ErrorHttp(500, 'Falta la variable GEMINI_API_KEY en el servidor.');
  if (typeof mensaje !== 'string' || !mensaje.trim()) throw new ErrorHttp(400, 'Escribe una pregunta.');
  if (mensaje.length > 2000) throw new ErrorHttp(400, 'La pregunta es demasiado larga.');

  // Se consultan los registros REALES de Supabase en cada pregunta
  const talleres = await listarTalleres();

  const contents = [];
  for (const h of (Array.isArray(historial) ? historial : []).slice(-10)) {
    if (!h || typeof h.texto !== 'string' || !h.texto.trim()) continue;
    contents.push({ role: h.rol === 'asistente' ? 'model' : 'user', parts: [{ text: h.texto.slice(0, 4000) }] });
  }
  // Gemini exige que la conversación empiece con el usuario
  while (contents.length && contents[0].role !== 'user') contents.shift();
  contents.push({ role: 'user', parts: [{ text: mensaje.trim() }] });

  const cuerpo = {
    system_instruction: { parts: [{ text: instruccionSistema(talleres) }] },
    contents,
  };

  let ultimoError = 'Sin respuesta';
  const inicio = Date.now();
  for (const modelo of modelosGemini()) {
    // Hasta 2 intentos por modelo (el segundo tras una breve espera)
    for (let intento = 1; intento <= 2; intento++) {
      if (Date.now() - inicio > 40000) break; // límite total de ~40 s
      let resp, datos;
      try {
        resp = await fetch(`${GEMINI_BASE}/v1beta/models/${modelo}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(25000),
        });
        datos = await resp.json().catch(() => ({}));
      } catch (e) {
        ultimoError = 'No se pudo conectar con Gemini.';
        console.warn(`[Gemini ${modelo}] ${e.message}`);
        continue;
      }
      if (resp.ok) {
        const partes = datos.candidates?.[0]?.content?.parts || [];
        const texto = partes.map((p) => p.text || '').join('').trim();
        if (texto) return { respuesta: texto, modelo };
        ultimoError = 'Gemini no devolvió texto (posible bloqueo de seguridad).';
        break; // probar con el siguiente modelo
      }
      ultimoError = datos.error?.message || `HTTP ${resp.status}`;
      console.warn(`[Gemini ${modelo}] intento ${intento}: ${resp.status} ${ultimoError}`);
      // Clave inválida, permisos, etc.: no tiene sentido seguir probando
      if (!ERRORES_REINTENTABLES.includes(resp.status)) {
        throw new ErrorHttp(502, `Error de Gemini: ${ultimoError}`);
      }
      if (resp.status === 404) break; // el modelo no existe: pasar al siguiente
      if (intento === 1) await esperar(1200);
    }
  }
  throw new ErrorHttp(502, `El asistente está muy solicitado en este momento. Intentá de nuevo en unos segundos. (${ultimoError})`);
}

// ---------- 4. Servidor HTTP y rutas ----------
const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
const PUBLIC = path.join(__dirname, 'public');

function enviarJson(res, status, datos) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (c) => {
      datos += c;
      if (datos.length > 1e6) {
        reject(new ErrorHttp(413, 'Cuerpo demasiado grande.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(datos ? JSON.parse(datos) : {});
      } catch {
        reject(new ErrorHttp(400, 'JSON no válido.'));
      }
    });
    req.on('error', reject);
  });
}

function servirEstatico(req, res, ruta) {
  const relativa = ruta === '/' ? 'index.html' : decodeURIComponent(ruta).replace(/^\/+/, '');
  const archivo = path.normalize(path.join(PUBLIC, relativa));
  if (!archivo.startsWith(PUBLIC)) return enviarJson(res, 403, { error: 'Prohibido' });
  fs.readFile(archivo, (err, contenido) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, { 'Content-Type': TIPOS_MIME[path.extname(archivo)] || 'application/octet-stream' });
    res.end(contenido);
  });
}

async function manejarApi(req, res, ruta) {
  const metodo = req.method;

  if (ruta === '/api/health' && metodo === 'GET') {
    return enviarJson(res, 200, {
      ok: true,
      supabase: Boolean(SUPABASE_URL && SUPABASE_KEY),
      gemini: Boolean(GEMINI_API_KEY),
      maps: Boolean(GOOGLE_MAPS_API_KEY),
    });
  }

  // La clave de Maps es pública por naturaleza (la usa el navegador);
  // se protege restringiéndola por dominio en Google Cloud.
  if (ruta === '/api/config' && metodo === 'GET') {
    return enviarJson(res, 200, { mapsKey: GOOGLE_MAPS_API_KEY });
  }

  if (ruta === '/api/talleres') {
    if (metodo === 'GET') return enviarJson(res, 200, await listarTalleres());
    if (metodo === 'POST') return enviarJson(res, 201, await crearTaller(await leerCuerpo(req)));
  }

  const m = ruta.match(/^\/api\/talleres\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (metodo === 'GET') return enviarJson(res, 200, await obtenerTaller(id));
    if (metodo === 'PUT') return enviarJson(res, 200, await modificarTaller(id, await leerCuerpo(req)));
    if (metodo === 'DELETE') return enviarJson(res, 200, await eliminarTaller(id));
  }

  if (ruta === '/api/chat' && metodo === 'POST') {
    const { mensaje, historial } = await leerCuerpo(req);
    return enviarJson(res, 200, await preguntarGemini(mensaje, historial));
  }

  throw new ErrorHttp(404, 'Ruta no encontrada.');
}

const servidor = http.createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://localhost').pathname;
  try {
    if (ruta.startsWith('/api/')) return await manejarApi(req, res, ruta);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ErrorHttp(405, 'Método no permitido.');
    return servirEstatico(req, res, ruta);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[${req.method} ${ruta}]`, err.message);
    enviarJson(res, status, { error: err.status ? err.message : 'Error interno del servidor.' });
  }
});

servidor.listen(PORT, () => {
  console.log(`AutoFix AI funcionando en http://localhost:${PORT}`);
  if (!SUPABASE_URL || !SUPABASE_KEY) console.warn('ATENCIÓN: faltan SUPABASE_URL / SUPABASE_SERVICE_KEY');
  if (!GEMINI_API_KEY) console.warn('ATENCIÓN: falta GEMINI_API_KEY');
  if (!GOOGLE_MAPS_API_KEY) console.log('Mapa: modo gratuito (sin GOOGLE_MAPS_API_KEY).');
});
