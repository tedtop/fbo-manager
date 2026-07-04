-- Department scheduling schema
-- Generic department model: `line` today, any department (CSR, maintenance, ...)
-- for other FBO customers later. Permission knobs live in department.settings
-- so ACL behavior is per-department configuration, not code.

create table if not exists department (
  id serial primary key,
  name text not null,
  slug text not null unique,
  color text not null default '#3b82f6',
  -- Per-department policy knobs (ACL-ready):
  --   allow_self_edit: members may create/edit/delete their own shifts
  --   edit_roles: department roles that may edit anyone's shifts in this department
  settings jsonb not null default '{"allow_self_edit": true, "edit_roles": ["lead", "supervisor"]}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table if not exists department_member (
  id serial primary key,
  department_id integer not null references department(id) on delete cascade,
  user_id integer not null references users(id) on delete cascade,
  dept_role text not null default 'member' check (dept_role in ('lead', 'supervisor', 'member')),
  title text not null default '',
  target_weekly_hours numeric(4, 1),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  unique (department_id, user_id)
);

create index if not exists idx_department_member_dept on department_member (department_id, is_active);

create table if not exists schedule_shift (
  id serial primary key,
  department_id integer not null references department(id) on delete cascade,
  user_id integer not null references users(id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  -- end_time <= start_time means the shift crosses midnight into the next day
  end_time time not null,
  notes text not null default '',
  created_by integer references users(id) on delete set null,
  updated_by integer references users(id) on delete set null,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create index if not exists idx_schedule_shift_dept_date on schedule_shift (department_id, shift_date);
create index if not exists idx_schedule_shift_user_date on schedule_shift (user_id, shift_date);

-- Live collaboration: broadcast shift changes to connected clients
alter publication supabase_realtime add table schedule_shift;

insert into department (name, slug, color)
values ('Line Service', 'line', '#38bdf8')
on conflict (slug) do nothing;
