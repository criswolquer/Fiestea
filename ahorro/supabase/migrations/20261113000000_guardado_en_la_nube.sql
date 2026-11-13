-- Guardado en la nube sin cuentas de usuario.
--
-- Cada dispositivo entra con un usuario anónimo de Supabase Auth (sin email ni contraseña)
-- y pertenece a un «espacio». Todo lo que se apunta se guarda en `records`, una fila por
-- registro de la app (movimiento, categoría, hucha…), y solo lo ven los dispositivos del
-- mismo espacio (Row Level Security). Otro móvil se une con un código de emparejar (dura
-- 15 minutos) o con el código de recuperación (si se pierde el móvil).
--
-- Por qué una tabla genérica y no una por tipo (como replica/schema.sql): la app trabaja
-- primero en el dispositivo y solo necesita guardar y recuperar sus registros tal cual;
-- ninguna consulta del servidor mira dentro. Una tabla hace la sincronización y las reglas
-- de acceso mucho más simples. Cuando haya cuentas y cobros se puede pasar a tablas tipadas.

-- Espacios y quién pertenece a cada uno -------------------------------------------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  recovery_hash text not null,
  created_at timestamptz not null default now()
);

create table public.space_members (
  user_id uuid primary key references auth.users(id) on delete cascade,  -- un espacio por dispositivo
  space_id uuid not null references public.spaces(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index on public.space_members (space_id);

create table public.pair_codes (
  code_hash text primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  expires_at timestamptz not null
);
create index on public.pair_codes (space_id);

create table public.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index on public.join_attempts (user_id, at);

-- Registros de la app ----------------------------------------------------------------
create sequence public.record_seq;

create table public.records (
  space_id uuid not null references public.spaces(id) on delete cascade,
  store text not null check (store in (
    'settings','categories','transactions','photos','pots','potMovements','monthPlans',
    'notes','reminders','monthRecaps','reflections','assistantMessages')),
  id text not null check (length(id) between 1 and 100),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65536),
  deleted boolean not null default false,
  updated_at timestamptz not null,               -- hora del cambio en el dispositivo (gana el último)
  seq bigint not null default nextval('public.record_seq'),  -- orden del servidor, para bajar solo lo nuevo
  primary key (space_id, store, id)
);
create index on public.records (space_id, seq);

create function public.bump_record_seq() returns trigger language plpgsql as $$
begin
  new.seq := nextval('public.record_seq');
  return new;
end $$;
create trigger records_bump_seq before update on public.records
  for each row execute function public.bump_record_seq();

-- Funciones auxiliares ------------------------------------------------------------------
create function public.my_space() returns uuid
language sql stable security definer set search_path = public as $$
  select space_id from public.space_members where user_id = auth.uid()
$$;

create function public.hash_code(code text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
$$;

-- Código aleatorio con un alfabeto sin caracteres que se confunden (sin 0/O, 1/I/L).
create function public.random_code(len int) returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 símbolos
  out text := '';
begin
  for i in 1..len loop
    -- byte 0 de un UUID v4 es aleatorio; 256 % 32 = 0, así que el reparto es uniforme
    out := out || substr(alphabet, 1 + (get_byte(uuid_send(gen_random_uuid()), 0) % 32), 1);
  end loop;
  return out;
end $$;

-- "ABCDEFGH" -> "ABCD-EFGH"
create function public.group_code(code text) returns text
language sql immutable as $$
  select string_agg(substr(code, i, 4), '-' order by i) from generate_series(1, length(code), 4) i
$$;

-- Crear el espacio de este dispositivo (la primera vez). Devuelve el código de recuperación.
create function public.create_space() returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  code text := public.random_code(20);
begin
  if uid is null then raise exception 'sin_sesion'; end if;
  if exists (select 1 from public.space_members where user_id = uid) then raise exception 'ya_tiene_espacio'; end if;
  insert into public.spaces (recovery_hash) values (public.hash_code(code)) returning id into sid;
  insert into public.space_members (user_id, space_id) values (uid, sid);
  return json_build_object('space_id', sid, 'recovery_code', public.group_code(code));
end $$;

-- Nuevo código de recuperación (el anterior deja de valer).
create function public.new_recovery_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.my_space();
  code text := public.random_code(20);
begin
  if sid is null then raise exception 'sin_espacio'; end if;
  update public.spaces set recovery_hash = public.hash_code(code) where id = sid;
  return public.group_code(code);
end $$;

-- Código para emparejar otro dispositivo: 8 caracteres, vale 15 minutos y una sola vez.
create function public.create_pair_code() returns json
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.my_space();
  code text := public.random_code(8);
  exp timestamptz := now() + interval '15 minutes';
begin
  if sid is null then raise exception 'sin_espacio'; end if;
  delete from public.pair_codes where space_id = sid or expires_at < now();
  insert into public.pair_codes (code_hash, space_id, expires_at) values (public.hash_code(code), sid, exp);
  return json_build_object('code', public.group_code(code), 'expires_at', exp);
end $$;

-- Unirse a un espacio con un código de emparejar o de recuperación.
-- Devuelve el espacio, o null si el código no vale (sin error, para que el intento quede apuntado).
-- Máximo 10 intentos por hora y dispositivo.
create function public.join_space(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  h text := public.hash_code(code);
  sid uuid;
begin
  if uid is null then raise exception 'sin_sesion'; end if;
  if (select count(*) from public.join_attempts where user_id = uid and at > now() - interval '1 hour') >= 10 then
    raise exception 'demasiados_intentos';
  end if;
  insert into public.join_attempts (user_id) values (uid);
  delete from public.join_attempts where at < now() - interval '1 day';

  select space_id into sid from public.pair_codes where code_hash = h and expires_at > now();
  if sid is not null then
    delete from public.pair_codes where code_hash = h;
  else
    select id into sid from public.spaces where recovery_hash = h;
  end if;
  if sid is null then return null; end if;

  insert into public.space_members (user_id, space_id) values (uid, sid)
    on conflict (user_id) do update set space_id = excluded.space_id, joined_at = now();
  return sid;
end $$;

-- Subir cambios: gana el más reciente (updated_at). Las reglas de acceso se aplican (security invoker).
create function public.push_records(rows jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  sid uuid := public.my_space();
  n integer;
begin
  if sid is null then raise exception 'sin_espacio'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 500 then raise exception 'lote_no_valido'; end if;
  insert into public.records (space_id, store, id, data, deleted, updated_at)
  select sid, r->>'store', r->>'id', coalesce(r->'data', '{}'::jsonb), coalesce((r->>'deleted')::boolean, false),
         least((r->>'updated_at')::timestamptz, now() + interval '1 minute')   -- un reloj adelantado no gana siempre
  from jsonb_array_elements(rows) r
  on conflict (space_id, store, id) do update
    set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at
    where public.records.updated_at <= excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- Bajar lo cambiado desde el último seq visto.
create function public.pull_records(after_seq bigint, max_rows integer default 500)
returns table (store text, id text, data jsonb, deleted boolean, updated_at timestamptz, seq bigint)
language sql stable security invoker set search_path = public as $$
  select r.store, r.id, r.data, r.deleted, r.updated_at, r.seq
  from public.records r
  where r.space_id = public.my_space() and r.seq > after_seq
  order by r.seq
  limit least(greatest(max_rows, 1), 1000)
$$;

-- Borrar todo el espacio (los datos de todos sus dispositivos). Las fotos se borran antes desde la app.
create function public.delete_my_space() returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.my_space();
begin
  if sid is null then return; end if;
  delete from public.spaces where id = sid;
end $$;

-- Reglas de acceso -----------------------------------------------------------------------
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.pair_codes enable row level security;     -- sin políticas: solo las funciones
alter table public.join_attempts enable row level security;  -- sin políticas: solo las funciones
alter table public.records enable row level security;

create policy members_read_own_space on public.space_members for select to authenticated
  using (space_id = public.my_space());
create policy read_own_space on public.spaces for select to authenticated
  using (id = public.my_space());
create policy own_records on public.records for all to authenticated
  using (space_id = public.my_space()) with check (space_id = public.my_space());

-- Solo usuarios con sesión (anónima incluida) llaman a las funciones.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.my_space(), public.create_space(), public.new_recovery_code(), public.create_pair_code(),
  public.join_space(text), public.push_records(jsonb), public.pull_records(bigint, integer), public.delete_my_space()
  to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select on public.spaces, public.space_members to authenticated;
grant usage on sequence public.record_seq to authenticated;

-- Fotos: almacén privado, una carpeta por espacio ------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.my_space()::text);
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.my_space()::text);
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.my_space()::text);
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.my_space()::text);
