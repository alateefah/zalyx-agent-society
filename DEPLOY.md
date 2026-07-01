# Deploying Zalyx Agent Society on Alibaba Cloud

This runbook deploys the backend (Express API + MCP server + built frontend, one
Docker image) on an **Alibaba Cloud ECS** instance, backed by an **Alibaba Cloud
Tablestore** instance. It satisfies the hackathon's "proof of Alibaba Cloud
deployment" requirement: the running backend talks to real Tablestore
(`utils/tablestore.ts`), and `/api/health` reports `database.mockMode: false`.

Everything the backend persists (merchants, underwriting decisions) goes through
the Alibaba Cloud Tablestore client. Qwen Cloud (DashScope) provides the LLM.

---

## 0. Prerequisites

- An Alibaba Cloud account with billing enabled.
- A Qwen Cloud (DashScope) API key — https://dashscope-intl.aliyuncs.com
- The public GitHub repo (this project) reachable from the ECS host.

---

## 1. Provision Tablestore (OTS)

1. Console → **Tablestore** → create an **instance** (High-performance type),
   in a region you'll also put the ECS in (e.g. `ap-southeast-1` / Singapore for
   the international DashScope endpoint).
2. Note the instance **name** and its **endpoint** (VPC or public). Example
   public endpoint: `https://<instance>.<region>.ots.aliyuncs.com`.
3. The two tables (`zalyx_merchants`, `zalyx_decisions`) and the `decision_index`
   secondary index are **created automatically on first boot** by
   `initTablestore()` — you do not create them by hand.
4. Create a **RAM user** with an AccessKey pair and the
   `AliyunOTSFullAccess` policy. Record `AccessKeyId` / `AccessKeySecret`.

> Prefer the **VPC endpoint** if the ECS and Tablestore are in the same VPC —
> lower latency, no public traffic. Use the public endpoint only if they aren't.

---

## 2. Provision ECS

1. Console → **ECS** → create an instance:
   - Image: **Alibaba Cloud Linux 3** (or Ubuntu 22.04).
   - Size: 2 vCPU / 4 GB is ample (e.g. `ecs.e-c1m2.large`).
   - Same region/VPC as the Tablestore instance (so you can use the VPC endpoint).
   - Assign a **public IP** (or bind an EIP).
2. **Security group:** allow inbound **TCP 3001** (the API/UI port) and **22**
   (SSH) from your IP. (Optionally front it with port 80 later.)
3. SSH in: `ssh root@<ECS_PUBLIC_IP>`

---

## 3. Install Docker on the ECS host

```bash
# Alibaba Cloud Linux 3 / CentOS-family
sudo dnf -y install docker || sudo yum -y install docker
sudo systemctl enable --now docker

# docker compose v2 plugin
sudo dnf -y install docker-compose-plugin 2>/dev/null || {
  sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
}
docker --version && docker compose version
```

(On Ubuntu use `apt-get install -y docker.io docker-compose-plugin`.)

---

## 4. Get the code and configure env

```bash
git clone https://github.com/alateefah/zalyx-agent-society.git
cd zalyx-agent-society

# Create the .env that docker-compose reads (NEVER commit this file)
cat > .env <<'EOF'
# Qwen Cloud
QWEN_API_KEY=sk-your-real-dashscope-key
QWEN_MODEL=qwen-max

# Alibaba Cloud Tablestore
OTS_ENDPOINT=https://<instance>.<region>.ots.aliyuncs.com
OTS_INSTANCE=<your_instance_name>
OTS_ACCESS_KEY_ID=<ram_access_key_id>
OTS_ACCESS_KEY_SECRET=<ram_access_key_secret>
OTS_MERCHANTS_TABLE=zalyx_merchants
OTS_DECISIONS_TABLE=zalyx_decisions
EOF
```

---

## 5. Build and run

```bash
docker compose build
docker compose up -d
docker compose logs -f        # watch first boot
```

On a successful first boot the logs show table/index creation, then:

```
✅ Tablestore ready
🚀 Zalyx Agent Society API running on http://localhost:3001
   ✅ Qwen Cloud (qwen-max)
   ✅ Alibaba Cloud Tablestore (<instance>)
```

(Optional) seed demo decisions into the real instance:

```bash
docker compose exec zalyx-agent-society node dist/utils/seed.js
```

---

## 6. Verify (this is your proof)

From your laptop:

```bash
curl http://<ECS_PUBLIC_IP>:3001/api/health
```

Expected — note **`database.mockMode: false`** and the real provider/instance:

```json
{
  "status": "ok",
  "ai": { "provider": "Qwen Cloud", "model": "qwen-max", "mockMode": false },
  "database": { "provider": "Alibaba Cloud Tablestore", "instance": "<your_instance_name>", "mockMode": false },
  "timestamp": "..."
}
```

Then exercise the full path and confirm it persists to Tablestore:

```bash
# list merchants (read from Tablestore after first-boot seed)
curl http://<ECS_PUBLIC_IP>:3001/api/merchants

# run an underwrite, then read its decision back from Tablestore
curl http://<ECS_PUBLIC_IP>:3001/api/merchants/ZALYX-001 > m.json
curl -X POST http://<ECS_PUBLIC_IP>:3001/api/underwrite -H 'Content-Type: application/json' -d @m.json
curl http://<ECS_PUBLIC_IP>:3001/api/merchants/ZALYX-001/decisions
```

Open the UI at `http://<ECS_PUBLIC_IP>:3001/` (the image serves the built frontend).

---

## 7. Recording the proof (separate ~short clip)

Capture, in one continuous screen recording:
1. The Alibaba Cloud **ECS console** showing the running instance + its public IP.
2. The Alibaba Cloud **Tablestore console** showing the `zalyx_*` tables.
3. A terminal hitting `http://<ECS_PUBLIC_IP>:3001/api/health` → `database.mockMode: false`,
   `provider: "Alibaba Cloud Tablestore"`.
4. (Nice) Run an underwrite, then show the new row appear in the Tablestore
   console / via `/api/merchants/:id/decisions`.

This proves the backend is live on Alibaba Cloud and using Alibaba Cloud services.
Link [utils/tablestore.ts](utils/tablestore.ts) as the code-file proof.

---

## Notes & troubleshooting

- **Connection refused to Tablestore:** check the endpoint scheme/region matches
  the instance, and that the ECS can reach it (VPC endpoint requires same VPC).
- **`database.mockMode: true` unexpectedly:** one of the four `OTS_*` vars is
  empty — the client only goes live when all four are present.
- **Port not reachable:** open TCP 3001 in the ECS security group.
- **Persisting across redeploys:** Tablestore is the source of truth; the
  container is stateless, so `docker compose up -d --build` after a `git pull`
  is a safe redeploy.
