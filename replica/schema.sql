-- Esquema Postgres del clon (fase 3: cuentas y sincronización con Supabase).
-- En las fases 1 y 2 NO hay servidor: los mismos datos viven en IndexedDB con
-- los mismos nombres de campo (ver architecture.md, "Almacenes locales").
--
-- Reglas: ids uuid generados en el cliente (para poder crear sin conexión),
-- dinero en céntimos enteros + moneda, fechas de calendario como `date`
-- (el día que el usuario ve, sin zona horaria), instantes como timestamptz en UTC.
-- Acceso: Row Level Security; cada usuario solo ve sus filas (user_id = auth.uid()).
-- Borrado: todo cuelga de profiles con on delete cascade -> borrar la cuenta lo borra todo (RGPD).
-- Sincronización: updated_at en todas las tablas + deleted_at (borrado blando) para
-- propagar borrados hechos sin conexión.

-- gen_random_uuid() viene de serie desde Postgres 13 (Supabase usa 15+).

-- Perfil, 1-1 con auth.users de Supabase -----------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '',
  locale text not null default 'es' check (locale in ('es','en')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- cuestionario inicial (S02)
  goal text check (goal in ('controlar_gastos','ahorrar','invertir','entender','otro')),
  current_management text check (current_management in ('nada','cabeza','excel','otra_app')),
  desired_saving_range text check (desired_saving_range in ('<100','100-300','300-600','>600')),
  -- primeros pasos (S04)
  first_steps_done text[] not null default '{}',
  first_steps_completed_at timestamptz,
  liquid_capital_start_cents bigint not null default 0,
  liquid_capital_start_date date,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  type text not null check (type in ('expense','income')),
  kind text check (kind in ('fijo','discrecional','deuda')),      -- solo gastos
  color text not null default '#888888',
  icon text,
  monthly_limit_cents bigint check (monthly_limit_cents >= 0),     -- null = sin límite
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kind_only_for_expense check (type = 'expense' or kind is null)
);
create index on categories (user_id, type, sort_order);
create unique index categories_unique_name on categories (user_id, type, lower(name)) where deleted_at is null;

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('expense','income')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR',
  category_id uuid references categories(id) on delete set null,  -- null = "Sin categoría"
  title text not null default '' check (length(title) <= 80),
  occurred_on date not null,
  note text check (length(note) <= 1000),
  has_photo boolean not null default false,  -- la foto NUNCA sube: vive en el dispositivo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on transactions (user_id, occurred_on desc);
create index on transactions (user_id, category_id, occurred_on);
create index on transactions (user_id, updated_at);               -- sincronización incremental

-- Huchas de ahorro e inversión (S12, S13) -----------------------------------
create table pots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('savings','investment')),
  name text not null check (length(name) between 1 and 40),
  goal_cents bigint check (goal_cents > 0),
  goal_reached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on pots (user_id, type);

create table pot_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  pot_id uuid not null references pots(id) on delete cascade,
  kind text not null check (kind in ('contribution','withdrawal')),
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on pot_movements (pot_id, occurred_on);
create index on pot_movements (user_id, occurred_on);
create index on pot_movements (user_id, updated_at);

-- Planificación del mes (S14) ------------------------------------------------
create table month_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),          -- primer día del mes
  planned_income_cents bigint not null check (planned_income_cents >= 0),
  mode text not null default 'pct' check (mode in ('pct','amount')),
  expenses_bp int not null check (expenses_bp between 0 and 10000), -- puntos básicos: 3500 = 35 %
  savings_bp int not null check (savings_bp between 0 and 10000),
  investments_bp int not null check (investments_bp between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month),
  constraint plan_max_100 check (expenses_bp + savings_bp + investments_bp <= 10000)
);

-- Calendario (S15, S16) ------------------------------------------------------
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  on_date date not null,
  text text not null check (length(text) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on notes (user_id, on_date);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null check (length(text) between 1 and 200),
  schedule text not null check (schedule in ('once','weekly','monthly')),
  on_date date,                                   -- once
  weekday smallint check (weekday between 1 and 7),          -- weekly (1 = lunes)
  month_day smallint check (month_day between 1 and 31),     -- monthly (31 -> último día)
  at_time time not null default '09:00',
  timezone text not null default 'Europe/Madrid', -- hora de pared del usuario
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint schedule_fields check (
    (schedule = 'once' and on_date is not null) or
    (schedule = 'weekly' and weekday is not null) or
    (schedule = 'monthly' and month_day is not null))
);
create index on reminders (user_id);

-- Cierre de mes (S18, S19) ---------------------------------------------------
create table month_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  summary jsonb not null,          -- cifras congeladas al cerrar el mes
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  recap_id uuid not null references month_recaps(id) on delete cascade,
  question text not null,
  answer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on reflections (recap_id);
create index on reflections (user_id);

-- Asistente (S17) ------------------------------------------------------------
create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  source text not null default 'chat' check (source in ('chat','daily_greeting')),
  text text not null,
  created_at timestamptz not null default now()
);
create index on assistant_messages (user_id, created_at desc);

create table usage_counters (
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('assistant_message','pdf_export')),
  day date not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, kind, day)
);

-- Suscripción (fase 4, Stripe) -----------------------------------------------
create table subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  plan text not null check (plan in ('monthly','yearly')),
  status text not null check (status in ('trialing','active','past_due','canceled','expired')),
  trial_source text check (trial_source in ('yearly_7d','first_steps_14d')),
  current_period_end timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  updated_at timestamptz not null default now()
);

create table stripe_events (                      -- idempotencia de webhooks
  id text primary key,                            -- evt_...
  processed_at timestamptz not null default now()
);

-- Row Level Security ---------------------------------------------------------
alter table profiles enable row level security;
create policy own_profile on profiles for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['categories','transactions','pots','pot_movements','month_plans',
                           'notes','reminders','month_recaps','reflections','assistant_messages']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- El cliente solo LEE contadores y suscripción; los escribe el servidor (service role).
alter table usage_counters enable row level security;
create policy read_own on usage_counters for select using (user_id = auth.uid());
alter table subscriptions enable row level security;
create policy read_own on subscriptions for select using (user_id = auth.uid());
alter table stripe_events enable row level security;  -- sin políticas: solo service role

-- Una hucha solo admite movimientos de su dueño.
create function pot_movement_owner_check() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pots where id = new.pot_id and user_id = new.user_id) then
    raise exception 'pot does not belong to user';
  end if;
  return new;
end $$;
create trigger pot_movement_owner before insert or update on pot_movements
  for each row execute function pot_movement_owner_check();

-- Igual para la categoría de una transacción.
create function transaction_category_check() returns trigger language plpgsql as $$
begin
  if new.category_id is not null and not exists
     (select 1 from categories where id = new.category_id and user_id = new.user_id and type = new.type) then
    raise exception 'category does not belong to user or has another type';
  end if;
  return new;
end $$;
create trigger transaction_category before insert or update on transactions
  for each row execute function transaction_category_check();
