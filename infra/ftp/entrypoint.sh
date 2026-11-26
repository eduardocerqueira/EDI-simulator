#!/bin/sh
# FTP node entrypoint. Several nodes run this image at the same time and all
# mount the SAME storage volume at /srv/ftp, so:
#   - users get FIXED uid/gid (identical on every node → same file ownership)
#   - only directories are (re)owned at start, never `chown -R` the shared data
set -eu

ROOT=/srv/ftp
NODE="${FTP_NODE_NAME:-$(hostname)}"
EDI_GID=2000
addgroup -g "$EDI_GID" -S edi 2>/dev/null || true

create_user() { # name uid home password
  if ! id "$1" >/dev/null 2>&1; then
    adduser -D -u "$2" -G edi -h "$3" -s /sbin/nologin "$1"
  fi
  echo "$1:$4" | chpasswd >/dev/null 2>&1
}

mkdir -p "$ROOT"
create_user "$FTP_DISTRIBUTOR_USER" 2000 "$ROOT" "$FTP_DISTRIBUTOR_PASSWORD"
chown "$FTP_DISTRIBUTOR_USER":edi "$ROOT"
chmod 2775 "$ROOT"

uid=2001
for p in $(echo "$FTP_PRODUCERS" | tr ',' ' '); do
  home="$ROOT/$p"
  mkdir -p "$home/to_distributor" "$home/from_distributor" "$home/archive" "$home/error"
  create_user "$p" "$uid" "$home" "$FTP_PRODUCER_PASSWORD"
  chown "$p":edi "$home" "$home/to_distributor" "$home/from_distributor" "$home/archive" "$home/error"
  chmod 2775 "$home" "$home/to_distributor" "$home/from_distributor" "$home/archive" "$home/error"
  uid=$((uid + 1))
done

# vsftpd's parser is strict: build a runtime config with only "key=value" lines.
RUNTIME_CONF=/etc/vsftpd/runtime.conf
grep -E '^[a-z_]+=' /etc/vsftpd/vsftpd.conf \
  | sed "s/^pasv_min_port=.*/pasv_min_port=${FTP_PASV_MIN_PORT}/; s/^pasv_max_port=.*/pasv_max_port=${FTP_PASV_MAX_PORT}/; s/^ftpd_banner=.*/ftpd_banner=Harvest Hub EDI FTP gateway (${NODE})/" > "$RUNTIME_CONF"
if [ -n "${FTP_PASV_ADDRESS:-}" ]; then
  echo "pasv_address=${FTP_PASV_ADDRESS}" >> "$RUNTIME_CONF"
fi

echo "[$NODE] FTP node ready: passive ports ${FTP_PASV_MIN_PORT}-${FTP_PASV_MAX_PORT}, mailboxes for $FTP_PRODUCERS"
# Stream the transfer log to the container output (docker compose logs ftp-node-N).
touch /var/log/vsftpd.log
tail -F /var/log/vsftpd.log &
exec /usr/sbin/vsftpd "$RUNTIME_CONF"
