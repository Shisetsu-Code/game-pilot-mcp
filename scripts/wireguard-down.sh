#!/usr/bin/env bash
set -uo pipefail
mark_file="$RUNNER_TEMP/gpwg.mark"
if [[ -s "$mark_file" ]]; then
  mark=$(cat "$mark_file")
  if [[ "$mark" =~ ^(0x[0-9a-fA-F]+|[0-9]+)$ ]]; then
    for firewall in iptables ip6tables; do
      if sudo "$firewall" -C OUTPUT ! -o gpwg -m mark ! --mark "$mark" -m addrtype ! --dst-type LOCAL -j REJECT 2>/dev/null; then
        sudo "$firewall" -D OUTPUT ! -o gpwg -m mark ! --mark "$mark" -m addrtype ! --dst-type LOCAL -j REJECT
      fi
    done
  fi
fi
sudo wg-quick down gpwg >/dev/null 2>&1 || true
sudo rm -f /etc/wireguard/gpwg.conf
rm -f "$RUNNER_TEMP/gpwg.conf" "$mark_file"
