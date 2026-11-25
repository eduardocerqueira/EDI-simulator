#!/bin/sh
set -eu

ROOT=/srv/ftp
addgroup -S edi 2>/dev/null || true

create_user() { # name home password
  if ! id "$1" >/dev/null 2>&1; then
    adduser -D -h "$2" -s /sbin/nologin -G edi "$1"
  fi
  echo "$1:$3" | chpasswd >/dev/null 2>&1
}

mkdir -p "$ROOT"
create_user "$FTP_DISTRIBUTOR_USER" "$ROOT" "$FTP_DISTRIBUTOR_PASSWORD"
chown "$FTP_DISTRIBUTOR_USER":edi "$ROOT"
chmod 2775 "$ROOT"

for p in $(echo "$FTP_PRODUCERS" | tr ',' ' '); do
  home="$ROOT/$p"
  mkdir -p "$home/to_distributor" "$home/from_distributor" "$home/archive" "$home/error"
  create_user "$p" "$home" "$FTP_PRODUCER_PASSWORD"
  chown -R "$p":edi "$home"
  chmod -R 2775 "$home"
done

# vsftpd's parser is strict: build a runtime config with only "key=value" lines.
RUNTIME_CONF=/etc/vsftpd/runtime.conf
grep -E '^[a-z_]+=' /etc/vsftpd/vsftpd.conf \
  | sed "s/^pasv_min_port=.*/pasv_min_port=${FTP_PASV_MIN_PORT}/; s/^pasv_max_port=.*/pasv_max_port=${FTP_PASV_MAX_PORT}/" > "$RUNTIME_CONF"
if [ -n "${FTP_PASV_ADDRESS:-}" ]; then
  echo "pasv_address=${FTP_PASV_ADDRESS}" >> "$RUNTIME_CONF"
fi

echo "FTP mailboxes ready for: $FTP_PRODUCERS (distributor user: $FTP_DISTRIBUTOR_USER)"
# Stream the transfer log to the container output (docker compose logs ftp).
touch /var/log/vsftpd.log
tail -F /var/log/vsftpd.log &
exec /usr/sbin/vsftpd "$RUNTIME_CONF"
