#!/usr/bin/env bash
# Concurrency regression test for core.ensure_personal_space() (design.md
# §6.2, tasks.md T-012's trap: "two concurrent first sign-ins... must end up
# in the same space with no duplicate rows").
#
# pgTAP cannot express this case (a single test file runs inside one
# transaction), so this script opens two REAL concurrent connections against
# a running local Supabase stack and asserts on the result.
#
# Executed for real 2026-08-04 against the local stack (project_id
# "LIFE_OS", ports remapped to the 55300s in supabase/config.toml to avoid
# colliding with another project's stack already running on this machine).
# Result: PASS — both concurrent callers landed in the same household, no
# duplicate rows.
#
# Run manually after `supabase start`:
#
#   ./scripts/test-bootstrap-race.sh
#
# Uses `psql` on PATH if available (via SUPABASE_DB_URL, defaults to this
# project's local port), otherwise falls back to `docker exec` into the
# project's db container — this machine had Docker but no local `psql`
# binary, so the fallback is the tested path.

set -euo pipefail

TEST_USER_ID="00000000-0000-0000-0000-0000000000f1"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_LIFE_OS}"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"

if command -v psql >/dev/null 2>&1; then
  DB() { psql "$DB_URL" -v ON_ERROR_STOP=1 "$@"; }
else
  echo "psql not found on PATH — using 'docker exec ${DB_CONTAINER}' instead." >&2
  DB() { docker exec "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
fi

cleanup() {
  DB -q -c \
    "delete from core.household_members where user_id = '${TEST_USER_ID}';
     delete from core.households where personal_owner_user_id = '${TEST_USER_ID}';
     delete from core.profiles where user_id = '${TEST_USER_ID}';
     delete from auth.users where id = '${TEST_USER_ID}';" || true
}
trap cleanup EXIT

cleanup

DB -q -c \
  "insert into auth.users (id, email, raw_user_meta_data)
   values ('${TEST_USER_ID}', 'race-test@example.com', '{\"full_name\":\"Race Test\"}');"

call_bootstrap() {
  DB -Atq -c \
    "set role authenticated;
     set request.jwt.claims = '{\"sub\":\"${TEST_USER_ID}\",\"role\":\"authenticated\"}';
     select app.bootstrap_user();"
}

echo "Firing two concurrent app.bootstrap_user() calls for the same first-time user..."
RESULT_A_FILE=$(mktemp)
RESULT_B_FILE=$(mktemp)
call_bootstrap >"$RESULT_A_FILE" &
PID_A=$!
call_bootstrap >"$RESULT_B_FILE" &
PID_B=$!
wait "$PID_A"
wait "$PID_B"

RESULT_A=$(cat "$RESULT_A_FILE")
RESULT_B=$(cat "$RESULT_B_FILE")
rm -f "$RESULT_A_FILE" "$RESULT_B_FILE"

echo "Call A returned household: ${RESULT_A}"
echo "Call B returned household: ${RESULT_B}"

if [[ "$RESULT_A" != "$RESULT_B" ]]; then
  echo "FAIL: concurrent calls returned DIFFERENT household ids (race not resolved)"
  exit 1
fi

HOUSEHOLD_COUNT=$(DB -Atq -c \
  "select count(*) from core.households where personal_owner_user_id = '${TEST_USER_ID}';")
MEMBER_COUNT=$(DB -Atq -c \
  "select count(*) from core.household_members where user_id = '${TEST_USER_ID}';")

if [[ "$HOUSEHOLD_COUNT" != "1" || "$MEMBER_COUNT" != "1" ]]; then
  echo "FAIL: expected exactly 1 household and 1 membership row, got household=${HOUSEHOLD_COUNT} member=${MEMBER_COUNT}"
  exit 1
fi

echo "PASS: both concurrent callers landed in the same household ($RESULT_A), no duplicates."
