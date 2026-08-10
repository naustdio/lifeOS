-- `health` schema — design.md Schema Design + Migration Sequence #2.
-- One `health` schema owning its tables; Finance stays the single ledger (design.md Technical
-- Approach). Costed events reference `finance.accounts`/`finance.categories` directly (read-only
-- FKs), never the reverse.

create schema health;

create table health.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('study','consultation','medication','vaccine')),
  title text not null check (length(btrim(title)) between 1 and 120),
  occurred_on date not null,
  notes text not null default '',
  visibility text not null default 'household' check (visibility in ('household','private')),
  -- cost block: all-or-nothing (design.md Decision 2)
  amount_cents bigint check (amount_cents > 0),
  account_id  uuid references finance.accounts(id)   on delete restrict,
  category_id uuid references finance.categories(id) on delete restrict,
  -- recurrence (design.md Decision 1 — two-hop indirection via finance.transactions.recurring_id)
  recurring_transaction_id uuid references finance.recurring_transactions(id) on delete set null,
  -- type-specific typed columns (design.md Decision 2)
  provider_name  text,   -- consultation | study
  result_summary text,   -- study
  dosage         text,   -- medication | vaccine
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_cost_all_or_none check (
    (amount_cents is null) = (account_id is null)
    and (amount_cents is null) = (category_id is null)),
  constraint events_result_only_study check (
    result_summary is null or event_type = 'study'),
  constraint events_dosage_only_meds check (
    dosage is null or event_type in ('medication','vaccine')),
  constraint events_recurring_needs_cost check (
    recurring_transaction_id is null or amount_cents is not null)
);
create index on health.events (household_id, occurred_on desc);
create index on health.events (recurring_transaction_id) where recurring_transaction_id is not null;

create trigger events_touch_updated_at
  before update on health.events
  for each row execute function core.touch_updated_at();

create table health.vital_readings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  metric text not null check (metric in ('weight_kg','systolic_bp','diastolic_bp','glucose_mgdl','heart_rate')),
  value_numeric numeric(10,2) not null,
  measured_at timestamptz not null default now(),
  notes text not null default '',
  visibility text not null default 'household' check (visibility in ('household','private')),
  created_at timestamptz not null default now()
);
create index on health.vital_readings (household_id, metric, measured_at desc);

create table health.profile_facts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  fact_type text not null check (fact_type in ('blood_type','allergy','condition')),
  label text not null check (length(btrim(label)) between 1 and 80),
  detail text not null default '',
  severity text check (severity in ('low','medium','high')),
  active boolean not null default true,
  visibility text not null default 'household' check (visibility in ('household','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_severity_only_allergy check (severity is null or fact_type = 'allergy')
);
create unique index profile_one_blood_type on health.profile_facts (owner_user_id)
  where fact_type = 'blood_type';

create trigger profile_facts_touch_updated_at
  before update on health.profile_facts
  for each row execute function core.touch_updated_at();

-- design.md Decision 4.1: a private-visibility event must fund from a PRIVATE account owned by
-- the same user — otherwise the cost amount/category is fully readable by every household member
-- through the ordinary transactions_select policy on a household account, silently defeating the
-- event's own visibility='private' choice. `security definer` + `set search_path = ''` per the
-- project's definer-function convention (matches finance.can_read_account, core.is_member).
create or replace function health.enforce_private_event_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'private' and new.account_id is not null then
    if not exists (
      select 1 from finance.accounts a
       where a.id = new.account_id
         and a.visibility = 'private'
         and a.owner_user_id = new.owner_user_id
    ) then
      raise exception 'a private health event must be funded from a private account owned by the same user'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger events_enforce_private_account
  before insert or update on health.events
  for each row execute function health.enforce_private_event_account();
