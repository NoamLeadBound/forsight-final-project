-- Shared memory for the ForSight final-project site.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Only emails listed in public.members can read or write anything.

create table if not exists public.members (
  email text primary key,          -- lowercase
  name  text not null,             -- shown on the site: נועם / עמרי / המנחה
  role  text
);

-- one row per checkbox, field or table on a page
create table if not exists public.kv (
  page       text not null,
  k          text not null,
  v          jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (page, k)
);

-- tasks, meetings, decisions and notes on the home page
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('task','meeting','decision','note')),
  title      text not null,
  body       text,
  details    text,
  people     text,
  owner      text,
  due        date,
  item_date  date,
  milestone  text,
  status     text not null default 'open',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists kv_touch on public.kv;
create trigger kv_touch before update on public.kv for each row execute function public.touch();
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items for each row execute function public.touch();

alter table public.members enable row level security;
alter table public.kv      enable row level security;
alter table public.items   enable row level security;

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.is_member());
drop policy if exists kv_team on public.kv;
create policy kv_team on public.kv for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists items_team on public.items;
create policy items_team on public.items for all to authenticated using (public.is_member()) with check (public.is_member());

-- live updates
do $$ begin
  alter publication supabase_realtime add table public.kv, public.items;
exception when duplicate_object then null; end $$;

-- the team (fill in the real emails, lowercase)
insert into public.members (email, name, role) values
  ('NOAM_EMAIL',    'נועם',  'סטודנט'),
  ('OMRI_EMAIL',    'עמרי',  'סטודנט'),
  ('ADVISOR_EMAIL', 'המנחה', 'מנחה')
on conflict (email) do update set name = excluded.name, role = excluded.role;

-- first tasks
insert into public.items (kind, title, owner, milestone, created_by)
select * from (values
  ('task', 'לשלוח לרן את המייל לפני הביקור (תיק עבודה, סעיף 0)', 'לא נקבע', 'visit', 'מערכת'),
  ('task', 'למלא שמות במצגת הפתיחה ולחלק את השקפים בינינו', 'שנינו', 'visit', 'מערכת'),
  ('task', 'לעבור על מצגת הפתיחה בקול, עם שעון (עד 8 דקות)', 'שנינו', 'visit', 'מערכת'),
  ('task', 'להעביר לכאן את סיכום הפגישה הראשונה מה-Google Doc', 'לא נקבע', 'visit', 'מערכת'),
  ('task', 'לברר מי המנחה ולהוסיף אותו לאתר', 'לא נקבע', null, 'מערכת'),
  ('task', 'להשיג את קובץ הטיימליין של הקורס ולעדכן תאריכים', 'לא נקבע', 'orientation', 'מערכת'),
  ('task', 'אחרי יום האפיון: לייצא את טבלת הממצאים ל-CSV ולשמור בתיקייה 03', 'לא נקבע', 'visit', 'מערכת'),
  ('task', 'סקירת ספרות: לאתר 3–5 מאמרים על VMI, Kanban ו-Two-Bin לפריטי C', 'לא נקבע', 'interim', 'מערכת')
) as t(kind, title, owner, milestone, created_by)
where not exists (select 1 from public.items);
