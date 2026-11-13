-- Cuentas (bancos, efectivo): nuevo tipo de registro que se guarda en la nube.
alter table public.records drop constraint records_store_check;
alter table public.records add constraint records_store_check check (store in (
  'settings','accounts','categories','transactions','photos','pots','potMovements','monthPlans',
  'notes','reminders','monthRecaps','reflections','assistantMessages'));
