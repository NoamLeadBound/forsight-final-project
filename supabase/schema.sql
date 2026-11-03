-- Shared memory for the ForSight final-project site.
-- Safe to run more than once (SQL Editor -> New query -> paste -> Run).
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

-- tasks, meetings, writing, presentation links and added terms
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('task','meeting','note','deck','term')),
  title      text not null,
  body       text,
  details    text,
  people     text,
  owner      text,
  due        date,
  item_date  date,
  milestone  text,
  category   text,
  url        text,
  status     text not null default 'open',   -- task: open / doing / done
  sort       int,
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
  alter publication supabase_realtime add table public.kv;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;

-- first tasks
insert into public.items (kind, title, owner, milestone, created_by)
select * from (values
  ('task', 'לשלוח לרן את המייל לפני הביקור (יום האפיון, סעיף 0)', 'לא נקבע', 'visit', 'מערכת'),
  ('task', 'למלא שמות במצגת הפתיחה ולחלק את השקפים בינינו', 'שנינו', 'visit', 'מערכת'),
  ('task', 'לעבור על מצגת הפתיחה בקול, עם שעון (עד 8 דקות)', 'שנינו', 'visit', 'מערכת'),
  ('task', 'להעביר לעמוד הפגישות את סיכום הפגישה הראשונה מה-Google Doc', 'לא נקבע', 'visit', 'מערכת'),
  ('task', 'לברר מי המנחה ולהוסיף אותו לאתר', 'לא נקבע', null, 'מערכת'),
  ('task', 'להשיג את קובץ הטיימליין של הקורס ולעדכן תאריכים', 'לא נקבע', 'orientation', 'מערכת'),
  ('task', 'אחרי יום האפיון: לייצא את טבלת הממצאים ל-CSV ולשמור בתיקייה 03', 'לא נקבע', 'visit', 'מערכת'),
  ('task', 'סקירת ספרות: לאתר 3–5 מאמרים על VMI, Kanban ו-Two-Bin לפריטי C', 'לא נקבע', 'interim', 'מערכת')
) as t(kind, title, owner, milestone, created_by)
where not exists (select 1 from public.items where kind = 'task');

-- writing drafts: one per chapter of the reports, with what goes in it
insert into public.items (kind, category, sort, title, details, created_by)
select 'note', 'טיוטה לדוח', s, t, d, 'מערכת' from (values
  (1,  'רקע על הארגון', 'החברה, המוצר ושלב החיים שלה, מבנה התפעול והמשאבים. מקורות: עמוד מחקר החברה וממצאי יום האפיון.'),
  (2,  'תיאור המצב הקיים', 'איך מנוהלים פריטי C היום, מההזמנה ועד ההרכבה: מי עושה כל שלב, באיזו מערכת, וכמה זמן. כולל תרשים תהליך.'),
  (3,  'הבעיות ועוצמתן', '3 עד 5 בעיות, ולכל אחת מספר: כמה הזמנות, כמה חוסרים, כמה שעות עבודה, כמה כסף. דוגמה מוחשית לכל בעיה.'),
  (4,  'מטרות, מדדים וערכי יעד', 'מטרה אחת ברורה, 4 עד 6 מדדים, ולכל מדד ערך נוכחי וערך יעד.'),
  (5,  'סקירת ספרות', 'לפחות 2–3 מאמרים: VMI, Kanban ו-Two-Bin, ניהול פריטי C. לכל מאמר: מה נבדק, מה נמצא, ומה זה אומר לפרויקט שלנו. נדרשת כבר בדוח הביניים.'),
  (6,  'חלופות והשוואה', 'החלופות (VMI, Kanban, Two-Bin, ניהול חזותי ושילובים), קריטריונים להשוואה ומשקלות, וטבלת ציונים.'),
  (7,  'הפתרון הנבחר', 'השיטה, חלוקת האחריות, תדירות האספקה, בקרת המלאי ומדדי ההצלחה. זה הפרק הכבד בציון של סמסטר ב׳ (25%).'),
  (8,  'תועלת כמותית', 'לפני ואחרי, לכל מדד מסמסטר א׳, עם הנחות החישוב.'),
  (9,  'תוכנית הטמעה', 'שלבים, אחראים, לוח זמנים וסיכונים.'),
  (10, 'סיכום ומסקנות', 'מה מצאנו, מה המלצנו, ומה הארגון מרוויח. מה נשאר פתוח.'),
  (11, 'תקציר', 'פסקה אחת: הבעיה, מה עשינו, הפתרון והתועלת במספרים. כותבים בסוף.'),
  (12, 'תודות', 'לארגון, לרן עציוני, למנחה ולמי שעזר.'),
  (13, 'מקורות', 'רשימת כל המקורות בפורמט אחיד (APA).')
) as v(s, t, d)
where not exists (select 1 from public.items where kind = 'note');

-- the team: emails go in lowercase
-- insert into public.members (email, name, role) values ('someone@example.com', 'נועם', 'סטודנט')
-- on conflict (email) do update set name = excluded.name, role = excluded.role;
