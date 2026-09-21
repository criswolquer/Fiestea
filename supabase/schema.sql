-- ============================================================
--  Fiestea · esquema de base de datos para Supabase
--  Pégalo entero en Supabase → SQL Editor → Run
--  Se puede ejecutar varias veces: si ya tenías la versión anterior, la actualiza.
-- ============================================================

-- ---------- Eventos ----------
create table if not exists public.events (
    id           uuid primary key default gen_random_uuid(),
    -- Clave para no duplicar: "titulo|pueblo|fecha" normalizados (o "user-<uuid>")
    dedupe_key   text not null unique,
    title        text not null,
    description  text not null default '',
    category     text not null default 'FIESTA_PUEBLO'
                 check (category in ('FIESTA_PUEBLO','FERIA','CONCIERTO','CLUB','FESTIVAL','QUEDADA')),
    -- Hora local del lugar (sin zona horaria): "2026-09-26T22:00:00"
    start_at     timestamp not null,
    end_at       timestamp,
    venue        text not null default '',
    address      text not null default '',
    town         text not null default '',
    province     text not null default '',
    lat          double precision not null,
    lon          double precision not null,
    price_eur    numeric(8,2) not null default 0,
    organizer    text not null default '',
    source_url   text,
    -- 'ai' = importador automático · 'user' = publicado desde la app
    origin       text not null default 'ai' check (origin in ('ai','user')),
    -- Avisos de "información incorrecta"; con 3 se oculta
    reports      integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- v2: quién publicó el evento (cuentas de usuario)
alter table public.events
    add column if not exists created_by uuid references auth.users(id) on delete set null;

-- v3: foto o cartel del evento
alter table public.events
    add column if not exists image_url text;

create index if not exists events_start_idx   on public.events (start_at);
create index if not exists events_end_idx     on public.events (end_at);
create index if not exists events_geo_idx     on public.events (lat, lon);
create index if not exists events_created_idx on public.events (created_at);

-- updated_at automático (se usa en varias tablas)
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
for each row execute function public.touch_updated_at();

alter table public.events enable row level security;

drop policy if exists "lectura publica" on public.events;
create policy "lectura publica" on public.events
    for select using (true);

-- Solo usuarios con cuenta pueden publicar, y siempre a su nombre
drop policy if exists "usuarios publican" on public.events;
create policy "usuarios publican" on public.events
    for insert to authenticated
    with check (origin = 'user' and reports = 0 and dedupe_key like 'user-%' and created_by = auth.uid());

-- Cada usuario puede borrar lo que ha publicado
drop policy if exists "borrar lo mio" on public.events;
create policy "borrar lo mio" on public.events
    for delete to authenticated using (created_by = auth.uid());

-- El importador usa la clave service_role, que se salta RLS.

-- ---------- Avisos de "información incorrecta" (uno por usuario y evento) ----------
create table if not exists public.event_reports (
    event_id   uuid not null references public.events(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (event_id, user_id)
);
alter table public.event_reports enable row level security;
-- Sin políticas: solo se escribe a través de la función report_event.

create or replace function public.report_event(event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null then
        raise exception 'Hay que iniciar sesión para avisar de un error';
    end if;
    insert into public.event_reports (event_id, user_id)
    values (report_event.event_id, auth.uid())
    on conflict do nothing;
    if found then
        update public.events set reports = reports + 1 where id = report_event.event_id;
    end if;
end $$;

revoke execute on function public.report_event(uuid) from public, anon;
grant execute on function public.report_event(uuid) to authenticated;

-- ---------- Ambiente en directo ----------
-- Cada usuario da (y puede cambiar) su voto sobre cómo está una fiesta ahora mismo.
create table if not exists public.vibe_reports (
    event_id   uuid not null references public.events(id) on delete cascade,
    user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
    crowd      smallint not null check (crowd between 1 and 3),  -- 1 poca gente · 2 bastante · 3 a tope
    queue      boolean  not null default false,                  -- ¿hay cola para entrar?
    mood       smallint not null check (mood between 1 and 3),   -- 1 flojo · 2 bien · 3 ambientazo
    updated_at timestamptz not null default now(),
    primary key (event_id, user_id)
);

drop trigger if exists vibe_touch on public.vibe_reports;
create trigger vibe_touch before update on public.vibe_reports
for each row execute function public.touch_updated_at();

alter table public.vibe_reports enable row level security;

drop policy if exists "ver mis votos" on public.vibe_reports;
create policy "ver mis votos" on public.vibe_reports
    for select to authenticated using (user_id = auth.uid());

drop policy if exists "votar" on public.vibe_reports;
create policy "votar" on public.vibe_reports
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "cambiar mi voto" on public.vibe_reports;
create policy "cambiar mi voto" on public.vibe_reports
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Resumen público y anónimo de los votos de los últimos 90 minutos
create or replace view public.event_vibes as
select
    event_id,
    count(*)::int                           as votes,
    avg(crowd)::float8                      as crowd,
    avg(case when queue then 1 else 0 end)::float8 as queue_ratio,
    avg(mood)::float8                       as mood,
    max(updated_at)                         as last_update
from public.vibe_reports
where updated_at > now() - interval '90 minutes'
group by event_id;

grant select on public.event_vibes to anon, authenticated;
