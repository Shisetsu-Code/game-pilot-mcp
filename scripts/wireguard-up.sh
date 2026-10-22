#!/usr/bin/env bash
set -euo pipefail
profile="$RUNNER_TEMP/gpwg.conf"
mark_file="$RUNNER_TEMP/gpwg.mark"
test -s "$profile" || { echo 'Falta el perfil WireGuard validado.'; exit 1; }
sudo install -m 600 "$profile" /etc/wireguard/gpwg.conf
rm -f "$profile"
if ! sudo wg-quick up gpwg >/dev/null 2>&1; then
  echo 'WireGuard no pudo iniciar. No se abrirán juegos.'; exit 1
fi
mark=$(sudo wg show gpwg fwmark)
[[ "$mark" =~ ^(0x[0-9a-fA-F]+|[0-9]+)$ ]] || { echo 'WireGuard no creó la ruta completa.'; exit 1; }
printf '%s' "$mark" > "$mark_file"
chmod 600 "$mark_file"
# Same kill-switch pattern documented by wg-quick, for both IP families.
for firewall in iptables ip6tables; do
  sudo "$firewall" -I OUTPUT ! -o gpwg -m mark ! --mark "$mark" -m addrtype ! --dst-type LOCAL -j REJECT
done
ip -4 route get 1.1.1.1 | grep -q 'dev gpwg' || { echo 'La ruta IPv4 no utiliza WireGuard.'; exit 1; }
# Generate tunnel traffic and require both HTTPS egress and a recent handshake.
connected=false
for attempt in 1 2 3; do
  if curl -4 --silent --fail --connect-timeout 10 --max-time 20 https://1.1.1.1/cdn-cgi/trace >/dev/null; then
    handshake=$(sudo wg show gpwg latest-handshakes | awk '{print $2}')
    now=$(date +%s)
    if [[ "$handshake" =~ ^[0-9]+$ ]] && (( handshake > 0 && now - handshake >= 0 && now - handshake < 180 )); then connected=true; break; fi
  fi
  sleep 2
done
if [[ "$connected" != true ]]; then echo 'No se verificó el túnel WireGuard. No se abrirán juegos.'; exit 1; fi
echo 'WireGuard conectado. Ruta, handshake y salida HTTPS verificados; bloqueo de salida directa activo.'
