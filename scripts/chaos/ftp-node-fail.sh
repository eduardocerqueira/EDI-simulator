#!/usr/bin/env bash
# Chaos test for the FTP cluster: break one FTP node and watch it self-heal.
#
#   npm run chaos:ftp                         # freeze a random node (unresponsive)
#   npm run chaos:ftp -- --node 2             # freeze ftp-node-2
#   npm run chaos:ftp -- --mode kill          # crash a node instead of freezing it
#   npm run chaos:ftp -- --no-watch           # just break it and exit
#
# Modes
#   pause  docker pause: the node keeps accepting TCP connections but never
#          answers (the nasty "hung" failure a plain port check would miss)
#   kill   docker kill: the node process dies
#
# While the node is down the script keeps using FTP through the load balancer
# (localhost:21) to show producers are not affected.
set -euo pipefail
cd "$(dirname "$0")/../.."

NODE=""; MODE="pause"; WATCH=1; TIMEOUT=120
CONTROLLER="${PLATFORM_CONTROLLER_URL:-http://localhost:9100}"
FTP_HOST="${FTP_HOST:-localhost}"; FTP_USER="${FTP_CHECK_USER:-zephyrwood}"; FTP_PASS="${FTP_PRODUCER_PASSWORD:-producer123}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --node|-n) NODE="$2"; shift 2 ;;
    --mode|-m) MODE="$2"; shift 2 ;;
    --no-watch) WATCH=0; shift ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
done
[[ "$MODE" == pause || "$MODE" == kill ]] || { echo "--mode must be pause or kill"; exit 1; }

b() { printf '\033[1m%s\033[0m' "$*"; }
red() { printf '\033[31m%s\033[0m' "$*"; }
green() { printf '\033[32m%s\033[0m' "$*"; }
yellow() { printf '\033[33m%s\033[0m' "$*"; }
state() { curl -fsS --max-time 3 "$CONTROLLER/api/state" 2>/dev/null || echo '{}'; }

if [[ -z "$NODE" ]]; then
  NODE=$(state | jq -r '[.nodes[]? | select(.status=="READY") | .slot] | if length > 0 then .[(now|floor) % length] else empty end')
  [[ -n "$NODE" ]] || NODE=$(( (RANDOM % 3) + 1 ))
fi
SERVICE="ftp-node-$NODE"
CID=$(docker compose ps -q "$SERVICE" 2>/dev/null | head -1)
[[ -n "$CID" ]] || { red "✖ no running container for $SERVICE"; echo; exit 1; }
GEN_BEFORE=$(state | jq -r --argjson s "$NODE" '.nodes[]? | select(.slot==$s) | .generation // 1')

echo
b "▶ FTP cluster before"; echo
state | jq -r '.nodes[]? | "  \(.name)  \(.status)  gen \(.generation)  \(.containerName // "-")  \(.ip // "")"'
echo
b "▶ Injecting failure: $MODE $SERVICE"; echo "  (container ${CID:0:12})"
docker "$MODE" "$CID" >/dev/null
T0=$(date +%s)
[[ $WATCH -eq 1 ]] || { yellow "  done — not watching (--no-watch)"; echo; exit 0; }

echo
b "▶ Watching recovery"; echo "  (controller probes every 2s; LB check = list /to_distributor as $FTP_USER via $FTP_HOST:21)"
LAST=""; READY=""; LB_OK=0; LB_FAIL=0
while true; do
  NOW=$(( $(date +%s) - T0 ))
  S=$(state | jq -c --argjson s "$NODE" '.nodes[]? | select(.slot==$s)')
  STATUS=$(jq -r '.status // "?"' <<<"$S"); GEN=$(jq -r '.generation // 0' <<<"$S")
  if curl -s --max-time 4 --user "$FTP_USER:$FTP_PASS" "ftp://$FTP_HOST/to_distributor/" >/dev/null; then LB_OK=$((LB_OK+1)); LB="$(green 'LB ok')"; else LB_FAIL=$((LB_FAIL+1)); LB="$(red 'LB fail')"; fi
  KEY="$STATUS/$GEN"
  if [[ "$KEY" != "$LAST" ]]; then
    case "$STATUS" in
      READY) [[ "$GEN" != "$GEN_BEFORE" || "$MODE" == kill ]] && COLOR=green || COLOR=yellow ;;
      SUSPECT|STARTING|REPLACING) COLOR=yellow ;;
      *) COLOR=red ;;
    esac
    printf '  +%3ss  %-12s %-10s gen %-3s %s\n' "$NOW" "$SERVICE" "$($COLOR "$STATUS")" "$GEN" "$LB"
    LAST="$KEY"
  fi
  if [[ "$STATUS" == READY && "$GEN" != "$GEN_BEFORE" ]]; then READY=$NOW; break; fi
  (( NOW > TIMEOUT )) && { red "✖ not recovered within ${TIMEOUT}s"; echo; exit 1; }
  sleep 1
done

echo
b "▶ Recovered"; echo
NEW=$(state | jq -r --argjson s "$NODE" '.nodes[] | select(.slot==$s) | "\(.containerName) (\(.containerId[0:12])) ip \(.ip) generation \(.generation)"')
echo "  new node      : $NEW"
# precise timings from the controller's event log (relative to the failure injection)
T() { state | jq -r --argjson s "$NODE" --argjson t0 "$T0" --arg type "$1" '[.events[] | select(.slot==$s and .type==$type) | (.at[0:19] + "Z" | fromdate) - $t0 | select(. >= 0)] | min // "-"'; }
echo "  timeline      : first failed probe +$(T PROBE_FAILED)s → declared down +$(T NODE_DOWN)s → new container +$(T NODE_SPAWNED)s → serving +$(T NODE_RECOVERED)s"
echo "  FTP via LB    : $LB_OK ok / $LB_FAIL failed checks during the incident"
echo
b "▶ Controller events"; echo
state | jq -r --argjson s "$NODE" '[.events[] | select(.slot==$s or .type=="ALERT_FIRING" or .type=="ALERT_RESOLVED")][0:8] | reverse[] | "  \(.at[11:19])  \(.type | ascii_downcase | gsub("_";" "))  \(.message)"'
echo
b "▶ Prometheus alerts (http://localhost:9090/alerts)"; echo
curl -fsS --max-time 3 "${PROMETHEUS_URL:-http://localhost:9090}/api/v1/alerts" | jq -r '.data.alerts[] | "  \(.state)  \(.labels.alertname)  \(.annotations.summary)"' 2>/dev/null || echo "  (prometheus not reachable)"
echo
echo "  The alerts resolve automatically a few seconds after the node is back."
