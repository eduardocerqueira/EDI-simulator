#!/usr/bin/env bash
# End-to-end acceptance test for the whole stack (used as a PR gate in CI).
#
#   producers ──X12/FTP──▶ distributor ──TA1/997/FTP──▶ producers
#                              │ JSON/REST                ▲
#                              ▼                          │ RabbitMQ events
#                          order app ◀──customers─────────┘
#
# It starts a fresh compose project, sends a known mix of good and bad X12,
# simulates customers and asserts the exact outcome through the public APIs.
#
# Usage: scripts/e2e.sh            (fresh project "edi-e2e", torn down at the end)
#        KEEP_STACK=1 scripts/e2e.sh   keep containers running for debugging
set -euo pipefail

cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-edi-e2e}"
export DELIVERY_FAILURE_RATE="${DELIVERY_FAILURE_RATE:-0}"   # deterministic deliveries
export FTP_POLL_INTERVAL_MS="${FTP_POLL_INTERVAL_MS:-2000}"
DC="docker compose --profile tools"
DIST=http://localhost:4000/api
ORDER=http://localhost:4100/api
FAILED=0

log()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
pass() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✖\033[0m %s\n' "$*"; FAILED=1; }

cleanup() {
  local code=$?
  if [[ $code -ne 0 || $FAILED -ne 0 ]]; then
    log "Failure — service logs (last 80 lines each)"
    $DC logs --no-color --tail 80 distributor-api order-api ftp || true
  fi
  if [[ -z "${KEEP_STACK:-}" ]]; then
    log "Tearing down $COMPOSE_PROJECT_NAME"
    $DC down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# expect <description> <actual> <expected>
expect() {
  if [[ "$2" == "$3" ]]; then pass "$1 = $2"; else fail "$1: expected $3, got $2"; fi
}
# expect_ge <description> <actual> <minimum>
expect_ge() {
  if [[ "$2" -ge "$3" ]]; then pass "$1 = $2 (≥ $3)"; else fail "$1: expected ≥ $3, got $2"; fi
}

# wait_until <description> <timeout-seconds> <command...>
wait_until() {
  local desc=$1 timeout=$2; shift 2
  local start=$SECONDS
  until "$@" >/dev/null 2>&1; do
    if (( SECONDS - start > timeout )); then fail "timed out after ${timeout}s waiting for: $desc"; exit 1; fi
    sleep 2
  done
  pass "$desc ($((SECONDS - start))s)"
}

sim() { $DC run --rm -T simulator "$@" >/dev/null; }

log "Starting stack ($COMPOSE_PROJECT_NAME)"
$DC down -v --remove-orphans >/dev/null 2>&1 || true
$DC build
$DC up -d --wait --wait-timeout 600 postgres rabbitmq ftp distributor-api order-api distributor-web order-web
pass "all services healthy"

TOKEN=$(curl -fsS -X POST "$DIST/auth/login" -H 'content-type: application/json' \
  -d '{"email":"admin@harvesthub.local","password":"admin123"}' | jq -r .token)
[[ -n "$TOKEN" && "$TOKEN" != null ]] && pass "distributor admin login" || { fail "distributor admin login"; exit 1; }
CTOKEN=$(curl -fsS -X POST "$ORDER/auth/login" -H 'content-type: application/json' \
  -d '{"email":"nova@copperleaf.example","password":"password123"}' | jq -r .token)
[[ -n "$CTOKEN" && "$CTOKEN" != null ]] && pass "order app customer login" || { fail "order app customer login"; exit 1; }

dist()  { curl -fsS "$DIST/$1" -H "authorization: Bearer $TOKEN"; }
order() { curl -fsS "$ORDER/$1" -H "authorization: Bearer $CTOKEN"; }
kpi()   { dist "kpis?hours=1" | jq -r "$1"; }
interchanges_at_least() { [[ "$(kpi .edi.interchanges)" -ge "$1" ]]; }
deliveries_settled()    { [[ "$(kpi .delivery.backlog)" == 0 && "$(kpi .delivery.success)" -ge "$1" ]]; }

# ---------------------------------------------------------------------------
log "1. Producers bootstrap: one valid 832 catalog from each of the 10 producers"
sim producers --bootstrap -n 0 -i 0
wait_until "10 catalogs processed" 120 interchanges_at_least 10
expect "accepted interchanges" "$(kpi .edi.interchangesAccepted)" 10

log "2. Valid mix of 832 / 846 / 856 (no errors injected)"
sim producers -n 15 -b 0 -i 0
wait_until "25 interchanges processed" 120 interchanges_at_least 25

log "3. One file per bad-data layer (envelope, group, transaction, segment, element, business)"
SCENARIOS=(ISA_IEA_CONTROL_MISMATCH UNKNOWN_SENDER GE_TRANSACTION_COUNT SE_SEGMENT_COUNT MISSING_CTT INVALID_QUALIFIER UNKNOWN_PRODUCT)
for s in "${SCENARIOS[@]}"; do sim producers -n 1 -s "$s" -p ZEPHYRWOOD -i 0; done
wait_until "32 interchanges processed" 120 interchanges_at_least 32
wait_until "all REST deliveries settled" 120 deliveries_settled 25

log "4. EDI assertions"
expect "interchanges received"        "$(kpi .edi.interchanges)" 32
expect "interchanges accepted"        "$(kpi .edi.interchangesAccepted)" 25
expect "interchanges rejected"        "$(kpi .edi.interchangesRejected)" 7
expect "transactions ingested"        "$(kpi .edi.transactionsIngested)" 25
expect "syntax/envelope rejected"     "$(kpi .edi.transactionsSyntaxRejected)" 6
expect "business rejected"            "$(kpi .edi.transactionsBusinessRejected)" 1
expect "REST deliveries succeeded"    "$(kpi .delivery.success)" 25
expect "REST deliveries dead"         "$(kpi .delivery.dead)" 0
wait_until "acknowledgments uploaded" 60 bash -c "[[ \$(curl -fsS '$DIST/kpis?hours=1' -H 'authorization: Bearer $TOKEN' | jq .edi.acksPending) == 0 ]]"
expect_ge "TA1/997 acks sent"         "$(kpi .edi.acksSent)" 32

CODES=$(dist "issues/summary?hours=1" | jq -r '[.byCode[] | "\(.code):\(.x12CodeSource):\(.x12Code)"] | join(" ")')
for code in "ISA_IEA_CONTROL_MISMATCH:TA1:001" "UNKNOWN_SENDER:TA1:006" "GE_TRANSACTION_COUNT_MISMATCH:AK9:5" \
            "SE_SEGMENT_COUNT_MISMATCH:AK5:4" "MANDATORY_SEGMENT_MISSING:AK3:3" "INVALID_CODE_VALUE:AK4:7" "UNKNOWN_PRODUCT:NONE:null"; do
  [[ " $CODES " == *" $code "* ]] && pass "validation issue $code" || fail "missing validation issue $code (got: $CODES)"
done

NOTIF=$(dist "notifications?category=edi&pageSize=100" | jq '[.items[] | select(.severity != "INFO")] | length')
expect_ge "EDI failure notifications via RabbitMQ" "$NOTIF" 7

log "5. Traceability: product → movement → transaction → interchange → FTP file"
PRODUCT_ID=$(dist "inventory?sort=updated&pageSize=1" | jq -r '.items[0].id')
TX_ID=$(dist "inventory/$PRODUCT_ID" | jq -r '[.movements[] | select(.transaction != null)][0].transaction.id')
IC_ID=$(dist "transactions/$TX_ID" | jq -r '.interchange.id')
FILE=$(dist "interchanges/$IC_ID" | jq -r '.fileTransfer.fileName')
STAGES=$(dist "interchanges/$IC_ID" | jq -r '[.timeline[].stage] | unique | join(",")')
[[ "$FILE" == *.x12 ]] && pass "product traced to file $FILE" || fail "trace chain broken (file=$FILE)"
for st in DOWNLOADED PARSED ENVELOPE_VALIDATED SYNTAX_VALIDATED INGESTED ACK_SENT DELIVERED; do
  [[ ",$STAGES," == *",$st,"* ]] && pass "timeline has $st" || fail "timeline missing $st (got $STAGES)"
done

log "6. Order app received the inventory as JSON"
expect "products in order app" "$(order products/facets | jq .totalProducts)" 100
expect_ge "products in stock" "$(order products/facets | jq .inStock)" 1

log "7. Customers: orders + Net-30 bills flow back to the distributor over RabbitMQ"
sim customers -c 3 -o 5 --cancel-ratio 0 --pay-ratio 0
orders_replicated() { [[ "$(kpi .orders.orders)" -ge 5 ]]; }
wait_until "5 orders replicated to the distributor" 60 orders_replicated
expect "open bills (Net 30)" "$(kpi .orders.openBills)" 5
DUE_DAYS=$(dist "bills?pageSize=1" | jq -r '.items[0] | (((.dueDate[0:19] + "Z" | fromdate) - (.issuedAt[0:19] + "Z" | fromdate)) / 86400 | round)')
expect "payment terms (days)" "$DUE_DAYS" 30

log "8. Web apps served through nginx with /api proxy"
expect "distributor-web /api/health" "$(curl -fsS http://localhost:3000/api/health | jq -r .status)" ok
expect "order-web /api/health"       "$(curl -fsS http://localhost:3001/api/health | jq -r .status)" ok
expect "distributor-web SPA route"   "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/edi/interchanges)" 200
expect "order-web SPA route"         "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/shop)" 200

if [[ $FAILED -ne 0 ]]; then log "E2E FAILED"; exit 1; fi
log "E2E PASSED"
