# Gateway HTTPS — `gateway-test.qrclaw.ai`

The Gateway **Node.js process is HTTP-only** on port **3001**. Public HTTPS is terminated by **Nginx** on the internal production VM. Host details are intentionally omitted from this colleague export.

## Live server state (applied 2026-03-30)

SSH access uses env vars `QRCLAW_SERVER_HOST`, `QRCLAW_SERVER_USER`, `QRCLAW_SERVER_PASS` (injected in Cursor Cloud).

### What was wrong

1. **`SSL_do_handshake() failed … bad key share`** in `/var/log/nginx/error.log` — OpenSSL 3 + nginx 1.18 + TLS 1.3 key-share negotiation with some clients.
2. **`$connection_upgrade` undefined** — `location /` used `Connection $connection_upgrade` without a global `map` in `nginx.conf`, so `nginx -t` failed until fixed.

### What we changed on the VM

- **`/etc/nginx/nginx.conf`** (inside `http { }`): added

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

- **`/etc/nginx/sites-available/qrclaw-gateway`**: modern cipher list, **`ssl_ecdh_curve X25519:prime256v1:secp384r1`**, **`ssl_prefer_server_ciphers off`**, **`listen 443 ssl`** without **`http2`** (reduces TLS/ALPN edge cases with OpenSSL 3 + nginx 1.18; WebSocket uses HTTP/1.1), **`proxy_http_version 1.1`** and **`Upgrade` / `Connection`** on **`location /`** (not only `/ws`). Reload: `sudo systemctl reload nginx`.

The on-disk site file now matches **`gateway/deploy/nginx-gateway-test.conf.example`** in this repo (keep them in sync).

### Verification

**On the server** (must succeed):

```bash
curl -sS https://gateway-test.qrclaw.ai/health
# → {"status":"ok",...}
```

**From your laptop / CI** (should succeed if the path allows TCP 443 to the VM):

```bash
curl -sS https://gateway-test.qrclaw.ai/health
echo | openssl s_client -connect gateway-test.qrclaw.ai:443 -servername gateway-test.qrclaw.ai 2>/dev/null | openssl x509 -noout -dates
```

**Note:** Some cloud CI egress networks may complete TCP to `:443` but see **no TLS response** (RST / EOF before ServerHello). That is a **network path / provider policy** issue, not the Gateway Node app. If users in China can `curl` successfully while a US cloud runner cannot, treat the runner as an unreliable probe.

**Future:** On **nginx 1.25+**, prefer `http2 on;` in the server block instead of `listen ... http2` if you want HTTP/2 again alongside stable TLS.

### Tencent host firewall

The VM uses chain **`YJ-FIREWALL-INPUT`** (many `REJECT` rules for known scanner IPs). Legitimate clients are not in that list. If a partner IP is blocked, adjust Tencent **Lighthouse / security group** or the host firewall tooling that manages `YJ-FIREWALL-INPUT`.

### WebSocket

Clients: **`wss://gateway-test.qrclaw.ai/ws`**. The `map` + `Connection` headers above apply to `/` and `/ws`.

### Constraints

- Do **not** put TLS inside Node; keep **3001 HTTP**.
- **CORS** on Gateway: `CORS_ORIGIN` must include `https://qrclaw-test.vercel.app` (comma-separated if multiple).

### Repo templates

| File | Purpose |
|------|---------|
| `gateway/deploy/nginx-gateway-test.conf.example` | Match production `qrclaw-gateway` site |
| `gateway/deploy/nginx-map-ws-snippet.conf` | Paste into `http { }` if `map` is missing |
| `gateway/deploy/caddy-gateway-test.Caddyfile` | Alternative if you migrate off nginx |

### Caddy (optional)

If you prefer auto-HTTPS without manual cert paths, install Caddy and use the example Caddyfile; stop nginx or move it off 80/443 first.
