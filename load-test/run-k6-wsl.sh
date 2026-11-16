#!/bin/bash
# Nang gioi han file descriptor de mo hang chuc nghin socket
ulimit -n 65535 2>/dev/null || true

# Lay IP cua Windows host tu WSL2
HOST_IP=$(grep nameserver /etc/resolv.conf | cut -d ' ' -f2)
echo "=========================================================="
echo "  Realtime Messaging Application — Load Test on WSL/Ubuntu"
echo "=========================================================="
echo "==> Windows Host IP: $HOST_IP"
echo "==> Kiem tra ket noi Spring Boot Backend..."

if ! curl -s -f "http://$HOST_IP:8080/actuator/health" > /dev/null; then
    echo "[!] LOI: Khong the ket noi toi Spring Boot tai http://$HOST_IP:8080"
    echo "    Hay chac chan rang Backend dang chay tren Windows."
    exit 1
fi

echo "==> Backend dang UP va san sang!"

SCRIPT=${1:-scripts/01_connection_hold.js}
if [ $# -gt 0 ]; then
    shift
fi

echo "==> Chay kich ban: $SCRIPT"
echo "=========================================================="

k6 run \
  -e API_URL="http://$HOST_IP:8080" \
  -e WS_URL="ws://$HOST_IP:8080/ws/websocket" \
  "$SCRIPT" "$@"

