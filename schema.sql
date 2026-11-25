-- =====================================================================
-- AutoFix AI - Script de base de datos para Supabase
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- Por si se ejecuta dos veces: borra las tablas anteriores
drop table if exists servicios;
drop table if exists talleres;

-- ---------------------------------------------------------------------
-- Tabla principal: establecimientos (talleres, gomerías, repuestos)
-- ---------------------------------------------------------------------
create table talleres (
  id             bigint generated always as identity primary key,
  nombre         text    not null,
  tipo           text    not null check (tipo in ('Taller mecánico', 'Gomería', 'Casa de repuestos')),
  especialidades text[]  not null default '{}',
  direccion      text    not null,
  telefono       text,
  email          text,
  horario        text,
  latitud        double precision not null check (latitud  between -90  and 90),
  longitud       double precision not null check (longitud between -180 and 180),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Servicios de cada establecimiento con precio estimado (en guaraníes)
-- Si se borra un taller, se borran automáticamente sus servicios
-- ---------------------------------------------------------------------
create table servicios (
  id                 bigint generated always as identity primary key,
  taller_id          bigint not null references talleres(id) on delete cascade,
  nombre             text   not null,
  tipo_mantenimiento text   not null,
  precio_estimado    integer check (precio_estimado >= 0)
);

create index servicios_taller_idx on servicios(taller_id);

-- ---------------------------------------------------------------------
-- Seguridad: se activa RLS sin políticas públicas.
-- Así NADIE puede leer/escribir con la clave pública (anon).
-- Solo el servidor (Render) accede usando la clave secreta (service_role),
-- que está guardada en una variable de entorno.
-- ---------------------------------------------------------------------
alter table talleres  enable row level security;
alter table servicios enable row level security;

-- ---------------------------------------------------------------------
-- Datos de ejemplo: 7 establecimientos en Asunción
-- (nombres ficticios para la demostración)
-- ---------------------------------------------------------------------
insert into talleres (nombre, tipo, especialidades, direccion, telefono, email, horario, latitud, longitud) values
('Motor Guaraní', 'Taller mecánico',
  array['Mecánica general','Cambio de aceite','Afinación de motor'],
  'Av. Mariscal López 3450, Asunción', '(021) 600 101', 'contacto@motorguarani.com.py',
  'Lun a Vie 07:30-18:00 / Sáb 07:30-12:00', -25.2905, -57.5960),

('AlineCenter Paraguay', 'Taller mecánico',
  array['Alineación','Balanceo','Suspensión'],
  'Av. España 2100, Asunción', '(021) 600 202', 'info@alinecenter.com.py',
  'Lun a Vie 08:00-18:00 / Sáb 08:00-13:00', -25.2860, -57.6050),

('Freno Seguro', 'Taller mecánico',
  array['Frenos','Suspensión','Alineación'],
  'Av. Gral. Santos 1200, Asunción', '(021) 600 303', 'frenoseguro@gmail.com',
  'Lun a Vie 07:00-17:30 / Sáb 07:00-12:00', -25.3000, -57.6150),

('Volt Auto Electricidad', 'Taller mecánico',
  array['Electricidad automotriz','Baterías','Aire acondicionado'],
  'Av. Fernando de la Mora 1800, Asunción', '(021) 600 404', 'voltauto@gmail.com',
  'Lun a Vie 08:00-18:00', -25.3150, -57.5950),

('Gomería El Rápido', 'Gomería',
  array['Neumáticos','Parches y vulcanizado','Balanceo'],
  'Av. Eusebio Ayala 2500, Asunción', '(0981) 600 505', null,
  'Todos los días 06:00-22:00', -25.3050, -57.6000),

('Neumáticos San Roque', 'Gomería',
  array['Neumáticos','Alineación','Balanceo'],
  'Av. Madame Lynch 900, Asunción', '(0982) 600 606', 'sanroque.neumaticos@gmail.com',
  'Lun a Sáb 07:00-19:00', -25.2790, -57.5700),

('Casa del Repuesto Central', 'Casa de repuestos',
  array['Repuestos de motor','Filtros y lubricantes','Frenos'],
  'Av. Artigas 1520, Asunción', '(021) 600 707', 'ventas@repuestocentral.com.py',
  'Lun a Vie 07:30-18:30 / Sáb 07:30-13:00', -25.2780, -57.6180);

insert into servicios (taller_id, nombre, tipo_mantenimiento, precio_estimado)
select t.id, s.nombre, s.tipo, s.precio
from talleres t
join (values
  ('Motor Guaraní',             'Cambio de aceite y filtro',          'Preventivo',  180000),
  ('Motor Guaraní',             'Afinación completa de motor',        'Preventivo',  450000),
  ('Motor Guaraní',             'Diagnóstico por escáner',            'Diagnóstico', 120000),
  ('AlineCenter Paraguay',      'Alineación computarizada',           'Alineación y balanceo', 120000),
  ('AlineCenter Paraguay',      'Balanceo de 4 ruedas',               'Alineación y balanceo',  80000),
  ('AlineCenter Paraguay',      'Revisión de amortiguadores',         'Suspensión',   60000),
  ('Freno Seguro',              'Cambio de pastillas de freno',       'Frenos',      250000),
  ('Freno Seguro',              'Rectificado de discos',              'Frenos',      200000),
  ('Freno Seguro',              'Alineación',                         'Alineación y balanceo', 110000),
  ('Volt Auto Electricidad',    'Cambio de batería',                  'Eléctrico',   550000),
  ('Volt Auto Electricidad',    'Carga de gas de aire acondicionado', 'Climatización', 250000),
  ('Volt Auto Electricidad',    'Revisión del sistema de carga',      'Diagnóstico',  90000),
  ('Gomería El Rápido',         'Parche de neumático',                'Neumáticos',   30000),
  ('Gomería El Rápido',         'Montaje y desmontaje',               'Neumáticos',   25000),
  ('Gomería El Rápido',         'Balanceo por rueda',                 'Alineación y balanceo',  20000),
  ('Neumáticos San Roque',      'Venta e instalación de neumáticos',  'Neumáticos',  650000),
  ('Neumáticos San Roque',      'Alineación y balanceo',              'Alineación y balanceo', 150000),
  ('Neumáticos San Roque',      'Rotación de neumáticos',             'Preventivo',   50000),
  ('Casa del Repuesto Central', 'Kit de filtros (aceite/aire/combustible)', 'Repuestos', 160000),
  ('Casa del Repuesto Central', 'Aceite sintético 5W-30 (4 L)',       'Repuestos',   280000),
  ('Casa del Repuesto Central', 'Juego de pastillas de freno',        'Repuestos',   190000)
) as s(taller, nombre, tipo, precio) on s.taller = t.nombre;

-- Verificación: debe mostrar 7 establecimientos con su cantidad de servicios
select t.nombre, t.tipo, count(s.id) as servicios
from talleres t left join servicios s on s.taller_id = t.id
group by t.id order by t.id;
