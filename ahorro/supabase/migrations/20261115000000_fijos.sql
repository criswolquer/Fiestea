-- Movimientos fijos (se apuntan solos cada mes) y traspasos entre cuentas propias: nuevos tipos de registro en la nube.
alter table public.records drop constraint records_store_check;
alter table public.records add constraint records_store_check check (store in (
  'settings','accounts','recurring','transfers','categories','transactions','photos','pots','potMovements','monthPlans',
  'notes','reminders','monthRecaps','reflections','assistantMessages'));
