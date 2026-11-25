# AutoFix AI 🔧

Sistema web dinámico para **talleres mecánicos, gomerías y casas de repuestos**, con base de datos en **Supabase**, **mapa interactivo de Google Maps** y un **asistente inteligente con Gemini** que consulta los registros reales del sistema.

Proyecto de examen práctico – Segundo Bachillerato Técnico en Informática
Colegio Nacional EMD Asunción Escalada · Alumno: **Eladio Elías Garcete González**

---

## ✅ Funcionalidades (requisitos del examen)

| Requisito | Dónde está |
|---|---|
| Catálogo con talleres, especialidades, servicios, precios estimados y horarios | Tarjetas del catálogo (`public/app.js`) |
| Altas, bajas, modificaciones y consultas | Botones *Nuevo establecimiento*, *Modificar*, *Eliminar* → API `/api/talleres` (`server.js`) |
| Búsqueda y filtrado por especialidad o tipo de mantenimiento | Barra de filtros (texto, tipo, especialidad, tipo de mantenimiento) |
| Registros en Supabase con nombre, dirección, contacto, latitud y longitud | Tablas `talleres` y `servicios` (`supabase/schema.sql`) |
| Google Maps con al menos 5 establecimientos; al seleccionar un marcador se muestra la información | Mapa con 7 marcadores; clic en marcador → ventana con la información, el **mapa de Google Maps** del lugar y botones *Abrir en Google Maps* / *Cómo llegar* |
| Chat con la API de Gemini (Google AI Studio) con acceso a datos de Supabase | Botón *Asistente AutoFix* → `/api/chat`; en cada pregunta el servidor lee los talleres de Supabase y se los pasa a Gemini |
| Código en GitHub, publicado en Render, claves en variables de entorno | Ninguna clave está en el código; se leen de `process.env` |
| Interfaz adaptable a celulares y computadoras | `public/styles.css` (pestañas Catálogo/Mapa en celular) |

---

## 📁 Estructura

```
autofix-ai/
├── server.js            ← Servidor Node.js (API + chat con Gemini). Sin dependencias externas.
├── package.json
├── .env.example         ← Modelo de variables de entorno (las claves reales van en .env o en Render)
├── .gitignore           ← Impide subir .env a GitHub
├── supabase/
│   └── schema.sql       ← Tablas + 7 establecimientos de ejemplo
└── public/
    ├── index.html       ← Página
    ├── styles.css       ← Diseño responsive
    ├── app.js           ← Catálogo, filtros, formulario, mapa y chat
    └── icon.svg
```

**Arquitectura:** el navegador nunca habla directo con Supabase ni con Gemini. Todo pasa por el servidor (`server.js`), que es el único que conoce las claves secretas.

```
Navegador ──► server.js (Render) ──► Supabase (base de datos)
                              └────► Gemini (inteligencia artificial)
```

---

## 🚀 Guía de instalación y publicación (paso a paso)

Necesitás 4 cuentas gratuitas: **Supabase**, **Google (AI Studio)**, **GitHub** y **Render**.

### 🗺️ Sobre el mapa (sin pagar)

El sistema tiene dos modos de mapa y elige solo:

- **Sin clave de Maps (modo por defecto, gratis):** mapa interactivo con todos los marcadores (OpenStreetMap). Al tocar un marcador se abre la información del establecimiento **con el mapa de Google Maps del lugar incrustado** y los botones *Abrir en Google Maps* y *Cómo llegar*. No requiere clave ni facturación.
- **Con `GOOGLE_MAPS_API_KEY`:** usa el mapa completo de Google Maps JavaScript API (requiere habilitar facturación en Google Cloud). Si la clave falla, vuelve solo al modo gratuito.

Por indicación del profesor se usa el modo gratuito, así que **el Paso 3 es opcional** y la variable `GOOGLE_MAPS_API_KEY` se puede omitir.

### Paso 1 · Base de datos en Supabase

1. Entrá a <https://supabase.com> → **New project**. Elegí un nombre (ej. `autofix-ai`), una contraseña y la región más cercana (São Paulo).
2. Cuando el proyecto esté listo, abrí **SQL Editor** → **New query**.
3. Copiá **todo** el contenido de `supabase/schema.sql`, pegalo y presioná **Run**. Al final debe aparecer una tabla con 7 establecimientos.
4. Andá a **Project Settings → API** (o **Data API / API Keys**) y anotá:
   - **Project URL** → será `SUPABASE_URL` (ej. `https://abcd1234.supabase.co`)
   - La clave **secreta**: `service_role` (empieza con `eyJ...`) o **Secret key** (empieza con `sb_secret_...`) → será `SUPABASE_SERVICE_KEY`

> ⚠️ Usá la clave **secreta**, no la `anon/publishable`. Las tablas tienen RLS activado sin políticas públicas, así que solo el servidor puede leer y escribir. Nunca pegues esta clave en el HTML ni en GitHub.

### Paso 2 · Clave de Gemini en Google AI Studio

1. Entrá a <https://aistudio.google.com> con tu cuenta de Google.
2. Clic en **Get API key** → **Create API key**.
3. Copiala → será `GEMINI_API_KEY`.
4. (Opcional, para mostrar en el examen) En AI Studio podés probar el modelo con el mismo *system prompt* que está en la función `instruccionSistema()` de `server.js`.

### Paso 3 · Clave de Google Maps (OPCIONAL — solo si querés el mapa completo de Google con facturación)

1. Entrá a <https://console.cloud.google.com> → creá un proyecto.
2. **APIs y servicios → Biblioteca** → buscá **Maps JavaScript API** → **Habilitar**.
3. Google pide asociar una **cuenta de facturación** (tiene uso gratuito mensual; no se cobra por una demo de examen, pero sin facturación el mapa no carga).
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API** → será `GOOGLE_MAPS_API_KEY`.
5. Recomendado: en la clave, **Restricciones de aplicaciones → Sitios web** y agregá `https://TU-APP.onrender.com/*` y `http://localhost:3000/*`. En **Restricciones de API** elegí solo *Maps JavaScript API*.

> La clave de Maps siempre llega al navegador (así funciona Google Maps). Por eso se protege restringiéndola a tu dominio, como indica el paso 5.

### Paso 4 · Probar en tu computadora (opcional pero recomendado)

Requiere **Node.js 18 o superior** (<https://nodejs.org>).

```bash
cd autofix-ai
cp .env.example .env        # en Windows: copy .env.example .env
# Editá .env y pegá tus 4 claves
npm start
```

Abrí <http://localhost:3000>. Para verificar las claves abrí <http://localhost:3000/api/health>: `supabase` y `gemini` deben decir `true` (`maps` puede decir `false` si usás el mapa gratuito).

### Paso 5 · Subir el código a GitHub

1. En <https://github.com> → **New repository** → nombre `autofix-ai` → **Create**.
2. En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "AutoFix AI - examen práctico"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/autofix-ai.git
git push -u origin main
```

3. Verificá en GitHub que **NO** aparezca el archivo `.env` (solo `.env.example`).

> Sin usar la terminal: en el repositorio nuevo, **Add file → Upload files** y arrastrá todo el contenido de la carpeta (excepto `.env`).

### Paso 6 · Publicar en Render

1. Entrá a <https://render.com> e iniciá sesión con GitHub.
2. **New + → Web Service** → elegí el repositorio `autofix-ai`.
3. Configuración:
   - **Runtime / Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. En **Environment Variables** agregá (las mismas del `.env`):

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | tu Project URL |
   | `SUPABASE_SERVICE_KEY` | tu clave secreta de Supabase |
   | `GEMINI_API_KEY` | tu clave de AI Studio |
   | `GOOGLE_MAPS_API_KEY` | (opcional) tu clave de Maps |

5. **Create Web Service**. En 1–3 minutos tendrás tu enlace público: `https://autofix-ai-xxxx.onrender.com`.
6. Solo si usás clave de Maps: agregá ese dominio en sus restricciones (Paso 3.5).
7. Abrí `https://TU-APP.onrender.com/api/health` → `supabase` y `gemini` deben estar en `true`.

> 💡 El plan gratuito de Render "duerme" el servicio tras 15 min sin uso; la primera carga puede tardar ~50 segundos. **Abrí el enlace unos minutos antes de la demostración.**

---

## 🎤 Guion para la demostración en vivo

1. **Catálogo:** mostrar las tarjetas con especialidades, servicios, precios y horarios.
2. **Búsqueda y filtros:** filtrar por especialidad *Alineación*, luego por tipo de mantenimiento *Neumáticos*, y buscar "aceite".
3. **Mapa:** hacer clic en varios marcadores → se abre la información con el mapa de Google Maps del lugar. Usar *Ver en mapa* desde una tarjeta y *Cómo llegar* (abre Google Maps con la ruta).
4. **Alta:** *Nuevo establecimiento* → completar datos → *📍 Elegir en el mapa* → agregar 2 servicios con precio → Guardar. Aparece en la lista y en el mapa.
5. **Persistencia:** recargar la página (F5) → el nuevo registro sigue ahí. Opcional: mostrarlo en Supabase → *Table Editor*.
6. **Modificación:** cambiar el horario o un precio → Guardar → recargar.
7. **Chat inteligente:** abrir el asistente y usar las 3 preguntas de prueba:
   - *¿Cuándo debo cambiar el aceite?*
   - *¿Qué talleres registrados realizan alineación?* → responde con los talleres reales de la base.
   - *¿Cómo revisar el estado de los neumáticos?*
   - Extra: preguntar *"mis frenos hacen ruido, ¿cómo los arreglo?"* → deriva a un profesional (seguridad).
   - Extra: dar de alta un taller con "Alineación" y volver a preguntar → el asistente lo incluye (demuestra que consulta Supabase en vivo).
8. **Baja:** eliminar el establecimiento de prueba.
9. **Celular:** abrir el enlace en el teléfono → pestañas *Catálogo / Mapa*, formulario y chat a pantalla completa.
10. **Seguridad:** mostrar en GitHub que no hay claves en el código y en Render la sección *Environment*.

---

## 🔌 API del servidor

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/talleres` | Lista todos los establecimientos con sus servicios |
| GET | `/api/talleres/:id` | Consulta uno |
| POST | `/api/talleres` | Alta |
| PUT | `/api/talleres/:id` | Modificación |
| DELETE | `/api/talleres/:id` | Baja (borra también sus servicios) |
| POST | `/api/chat` | `{ mensaje, historial }` → respuesta de Gemini con datos de Supabase |
| GET | `/api/health` | Verifica que las variables de entorno estén cargadas |

---

## 🛠️ Solución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| "Faltan las variables SUPABASE_URL…" | No cargaste las variables en Render (o en `.env`). Revisá los nombres exactos. |
| "Error de Supabase: Invalid API key" | Copiaste mal la clave o usaste la `anon`. Usá la `service_role` / `sb_secret_`. |
| "Error de Supabase: relation … does not exist" | No ejecutaste `schema.sql` en el SQL Editor. |
| El mapa no aparece | Revisá la conexión a internet (el mapa se descarga de internet). Si cargaste `GOOGLE_MAPS_API_KEY` y falla, el sistema pasa solo al mapa gratuito; también podés borrar esa variable en Render. |
| Error de Gemini "API key not valid" | Revisá `GEMINI_API_KEY`. Creala de nuevo en AI Studio si hace falta. |
| Error de Gemini "model not found" | Agregá la variable `GEMINI_MODEL` con un modelo disponible en AI Studio (ej. `gemini-flash-latest`). |
| Error de Gemini por cuota (429) | Se superó el límite gratuito por minuto; esperá un minuto y volvé a preguntar. |
| La primera carga en Render tarda mucho | El plan gratuito se duerme; esperá ~1 minuto. |

---

*Los establecimientos de ejemplo tienen nombres ficticios y ubicaciones aproximadas en Asunción, solo para la demostración.*
