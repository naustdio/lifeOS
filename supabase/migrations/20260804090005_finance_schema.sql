-- Finance schema: accounts, liability/goal detail tables, categories, transactions,
-- derived balance views. Per design.md §3.2-§3.4. Sub-slice 2A.

create schema if not exists finance;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table finance.accounts (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references core.households(id) on delete cascade,
  name                   text not null check (length(btrim(name)) between 1 and 60),
  type                   text not null check (type in
                           ('cash','checking','credit_card','savings','liability','savings_goal')),
  -- 'asset' balances roll into the headline "available money" figure; 'liability' balances
  -- are debt and are shown separately. Trigger-derived from `type` — see below.
  class                  text not null check (class in ('asset','liability')),
  visibility             text not null default 'household'
                           check (visibility in ('household','private')),
  owner_user_id          uuid not null references auth.users(id),
  opening_balance_cents  bigint not null default 0,
  currency               char(3) not null default 'MXN' check (currency = 'MXN'),
  sort_order             int not null default 0,
  archived_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint accounts_private_needs_owner
    check (visibility <> 'private' or owner_user_id is not null)
);
create index on finance.accounts (household_id) where archived_at is null;

create table finance.account_liability_details (
  account_id             uuid primary key references finance.accounts(id) on delete cascade,
  original_amount_cents  bigint not null check (original_amount_cents > 0),
  interest_rate_bp       int    not null check (interest_rate_bp >= 0),  -- basis points, integer
  term_months            int    not null check (term_months > 0),
  monthly_payment_cents  bigint not null check (monthly_payment_cents > 0),
  start_date             date   not null
);

create table finance.account_goal_details (
  account_id           uuid primary key references finance.accounts(id) on delete cascade,
  target_amount_cents  bigint not null check (target_amount_cents > 0),
  target_date          date
);

-- `accounts.class` MUST be trigger-derived from `type`, never client-supplied — this is what
-- makes the headline "available money" figure trustworthy (design.md §3.4/§5.6).
create or replace function finance.derive_account_class()
returns trigger language plpgsql as $$
begin
  if new.type in ('cash', 'checking', 'savings', 'savings_goal') then
    new.class := 'asset';
  elsif new.type in ('credit_card', 'liability') then
    new.class := 'liability';
  else
    raise exception 'unknown account type: %', new.type using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger accounts_derive_class
  before insert or update of type on finance.accounts
  for each row execute function finance.derive_account_class();

create trigger accounts_touch_updated_at
  before update on finance.accounts
  for each row execute function core.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Categories — canonical templates (catalog) + per-space rows
-- ---------------------------------------------------------------------------

-- Canonical default taxonomy. NOT user data: no household_id, never rendered directly,
-- never writable by `authenticated`. Copied into each space at bootstrap.
create table finance.category_templates (
  key         text primary key,                    -- stable, English, e.g. 'expense.home.rent'
  parent_key  text references finance.category_templates(key),
  name        text not null,                       -- Spanish display name (the seed value)
  kind        text not null check (kind in ('income','expense')),
  icon        text,
  sort_order  int  not null default 0,
  constraint tmpl_one_level check (parent_key is null or parent_key <> key)
);

create table finance.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  parent_id    uuid references finance.categories(id) on delete restrict,
  name         text not null check (length(btrim(name)) between 1 and 40),
  kind         text not null check (kind in ('income','expense')),
  icon         text,
  -- Provenance only. Non-null means "this row was seeded from that template".
  -- It never restricts rename or deactivate; it exists so a later top-up can tell
  -- which defaults a space already has.
  template_key text references finance.category_templates(key) on delete set null,
  sort_order   int not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);

create index on finance.categories (household_id, kind) where archived_at is null;

-- Name uniqueness within a space and sibling group (household_id is NOT NULL, so no coalesce on it)
create unique index categories_unique_name
  on finance.categories (household_id,
                         coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         lower(btrim(name)));

-- Makes the seed/top-up idempotent and gives ON CONFLICT an arbiter
create unique index categories_unique_template
  on finance.categories (household_id, template_key) where template_key is not null;

create trigger categories_touch_updated_at
  before update on finance.categories
  for each row execute function core.touch_updated_at();

-- One-level-nesting + same-kind/household-as-parent trigger (design.md §3.4).
create or replace function finance.enforce_category_shape()
returns trigger language plpgsql as $$
declare v_parent finance.categories;
begin
  if new.parent_id is not null then
    select * into v_parent from finance.categories where id = new.parent_id;
    if not found then
      raise exception 'parent category not found' using errcode = '22023';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'categories may only be nested one level deep' using errcode = '22023';
    end if;
    if v_parent.household_id <> new.household_id then
      raise exception 'child category must share household with its parent' using errcode = '22023';
    end if;
    if v_parent.kind <> new.kind then
      raise exception 'child category must share kind with its parent' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_enforce_shape
  before insert or update of parent_id, kind, household_id on finance.categories
  for each row execute function finance.enforce_category_shape();

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table finance.transactions (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references core.households(id) on delete cascade,
  account_id         uuid not null references finance.accounts(id) on delete restrict,
  category_id        uuid references finance.categories(id) on delete restrict,
  type               text not null check (type in ('income','expense','transfer')),
  -- SIGNED effect on the account: income > 0, expense < 0, transfer legs are +x and -x.
  amount_cents       bigint not null check (amount_cents <> 0),
  currency           char(3) not null default 'MXN' check (currency = 'MXN'),
  occurred_on        date not null,
  description        text not null default '',
  paid_by_user_id    uuid references auth.users(id),   -- split hook; hidden in personal UI
  created_by_user_id uuid not null references auth.users(id),
  status             text not null default 'posted' check (status in ('posted','void')),
  voided_at          timestamptz,
  voided_by_user_id  uuid references auth.users(id),
  void_reason        text,
  transfer_group_id  uuid,
  origin_module      text not null default 'manual'
                       check (origin_module in ('manual','shopping_list','car_control')),
  origin_entity_id   text,
  idempotency_key    text,
  external_id        text,                              -- future bank sync, unused in MVP
  recurring_id       uuid,                               -- reserved column, unused this cycle
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint tx_sign_matches_type check (
       (type = 'income'   and amount_cents > 0)
    or (type = 'expense'  and amount_cents < 0)
    or (type = 'transfer')),
  constraint tx_transfer_group check ((type = 'transfer') = (transfer_group_id is not null)),
  constraint tx_category_required check (type = 'transfer' or category_id is not null),
  constraint tx_transfer_has_no_category check (type <> 'transfer' or category_id is null),
  constraint tx_void_fields check ((status = 'void') = (voided_at is not null)),
  -- module-originated writes MUST be idempotent and MUST name their source row
  constraint tx_origin_requires_keys check (
    origin_module = 'manual' or (origin_entity_id is not null and idempotency_key is not null))
);

-- Household-prefixed so one tenant's key can never collide with another tenant's.
create unique index tx_idempotency
  on finance.transactions (household_id, origin_module, origin_entity_id, idempotency_key)
  where idempotency_key is not null;

create index on finance.transactions (account_id) where status = 'posted';
create index on finance.transactions (household_id, occurred_on desc, id desc);
create index on finance.transactions (transfer_group_id) where transfer_group_id is not null;
create index on finance.transactions (household_id, category_id, occurred_on)
  where status = 'posted' and type <> 'transfer';

create trigger transactions_touch_updated_at
  before update on finance.transactions
  for each row execute function core.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Derived balance views — the single source of truth for every number on screen.
-- CRITICAL: `security_invoker = true` on BOTH views. Without it a view runs as its
-- owner and silently bypasses RLS on accounts/transactions (Supabase linter:
-- `security_definer_view`). Regular views only — materialized views do not honor RLS.
-- ---------------------------------------------------------------------------

create view finance.account_balances with (security_invoker = true) as
select a.id            as account_id,
       a.household_id,
       a.type,
       a.class,
       a.archived_at,
       a.opening_balance_cents
         + coalesce(sum(t.amount_cents) filter (where t.status = 'posted'), 0) as balance_cents
from finance.accounts a
left join finance.transactions t on t.account_id = a.id
group by a.id;

create view finance.household_summary with (security_invoker = true) as
select b.household_id,
       coalesce(sum(b.balance_cents)  filter (where b.class = 'asset'),     0) as available_cents,
       coalesce(sum(-b.balance_cents) filter (where b.class = 'liability'), 0) as debt_cents
from finance.account_balances b
where b.archived_at is null
group by b.household_id;
