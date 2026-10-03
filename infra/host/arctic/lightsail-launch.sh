#!/bin/bash
# First-boot bootstrap for `arctic` (AWS Lightsail medium, eu-central-1),
# mirroring `atlantic`: only the `caudals` user with key-only SSH, no root
# login, UFW with public 80/443 and Tailscale, SSH on tailscale0 only,
# fail2ban, unattended security upgrades, swap, Docker single-node Swarm,
# `dokploy-network` and a file-provider Traefik.
# Launch-time placeholders: __SSH_PUBKEY__, __ACME_EMAIL__, __BOOTSTRAP_IP__.
# __BOOTSTRAP_IP__ gets temporary key-only SSH until Tailscale enrollment;
# remove that UFW rule and the Lightsail port rule right after joining.
# Lightsail prepends its own /bin/sh script, so this must stay POSIX sh.
set -eux
exec > /var/log/caudals-bootstrap.log 2>&1
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

hostnamectl set-hostname arctic
timedatectl set-timezone Etc/UTC

apt-get update
apt-get -y -o Dpkg::Options::=--force-confold upgrade
apt-get install -y ufw fail2ban python3-systemd unattended-upgrades ca-certificates curl jq

# Admin user. The Lightsail default `ubuntu` user is locked and denied by sshd.
id caudals >/dev/null 2>&1 || useradd -m -s /bin/bash -G sudo caudals
passwd -l caudals
echo 'caudals ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-caudals
chmod 440 /etc/sudoers.d/90-caudals
install -d -m 700 -o caudals -g caudals /home/caudals/.ssh
echo '__SSH_PUBKEY__' > /home/caudals/.ssh/authorized_keys
chown caudals:caudals /home/caudals/.ssh/authorized_keys
chmod 600 /home/caudals/.ssh/authorized_keys
usermod -L -s /usr/sbin/nologin ubuntu || true
passwd -l root

cat > /etc/ssh/sshd_config.d/90-caudals-hardening.conf <<'EOF'
# Caudals host hardening (same policy as atlantic).
# Admin access is Tailscale SSH or sshd on tailscale0; public 22 stays closed.
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
PermitTunnel no
PermitRootLogin no
AllowUsers caudals
EOF
sshd -t
systemctl restart ssh

cat > /etc/fail2ban/jail.d/caudals.conf <<'EOF'
[DEFAULT]
banaction = nftables
banaction_allports = nftables[type=allports]
backend = systemd

[sshd]
enabled = true
EOF
systemctl enable fail2ban
systemctl restart fail2ban

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo 'vm.swappiness = 10' > /etc/sysctl.d/90-caudals.conf
sysctl --system
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=1G\n' > /etc/systemd/journald.conf.d/90-caudals.conf
systemctl restart systemd-journald

# Swap (4 GiB, like atlantic).
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Firewall: same rules as atlantic. The Lightsail firewall is the outer layer.
ufw default deny incoming
ufw default allow outgoing
ufw default deny routed
ufw allow 80/tcp comment 'caudals public http'
ufw allow 443/tcp comment 'caudals public https'
ufw allow 443/udp comment 'caudals public http3'
ufw allow 41641/udp comment 'tailscale wireguard'
ufw allow in on tailscale0 to any port 22 proto tcp comment 'tailscale ssh admin'
ufw allow from __BOOTSTRAP_IP__ to any port 22 proto tcp comment 'temporary bootstrap ssh'
ufw --force enable

PRIVATE_IP=$(hostname -I | awk '{print $1}')

# Docker CE from the official repository; caudals uses sudo, as on atlantic.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable' > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Single-node Swarm advertised on the private address, not the public IP.
docker info --format '{{.Swarm.LocalNodeState}}' | grep -qx active \
  || docker swarm init --advertise-addr "$PRIVATE_IP" --listen-addr "$PRIVATE_IP:2377"
docker network inspect dokploy-network >/dev/null 2>&1 \
  || docker network create -d overlay --attachable dokploy-network

# Traefik: file provider only (no Docker socket, no insecure API).
mkdir -p /etc/dokploy/traefik/dynamic
cat > /etc/dokploy/traefik/traefik.yml <<'EOF'
global:
  sendAnonymousUsage: false
providers:
  file:
    directory: /etc/dokploy/traefik/dynamic
    watch: true
entryPoints:
  web:
    address: :80
  websecure:
    address: :443
    http3:
      advertisedPort: 443
    http:
      tls:
        certResolver: letsencrypt
certificatesResolvers:
  letsencrypt:
    acme:
      email: __ACME_EMAIL__
      storage: /etc/dokploy/traefik/dynamic/acme.json
      httpChallenge:
        entryPoint: web
EOF
cat > /etc/dokploy/traefik/dynamic/middlewares.yml <<'EOF'
http:
  middlewares:
    redirect-to-https:
      redirectScheme:
        scheme: https
        permanent: true
EOF
touch /etc/dokploy/traefik/dynamic/acme.json
chmod 600 /etc/dokploy/traefik/dynamic/acme.json
docker rm -f dokploy-traefik >/dev/null 2>&1 || true
docker run -d --name dokploy-traefik --restart always \
  -p 80:80 -p 443:443/tcp -p 443:443/udp \
  -v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml:ro \
  -v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
  traefik:v3.6.7
docker network connect dokploy-network dokploy-traefik

# Tailscale package only; join interactively (`tailscale up --ssh --hostname=arctic`).
curl -fsSL https://tailscale.com/install.sh | sh

date -u +%FT%TZ > /var/lib/caudals-bootstrap.done
