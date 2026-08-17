# Grafana Cloud dashboard

`jobcopilot-overview.json` is a standard exportable Grafana dashboard covering
everything `observability/alloy/config.alloy` actually ships — host metrics,
per-container metrics, and logs, all scoped to this project's own
`jobcopilot-*` containers (see `AGENTS.md`'s cross-tenant-scoping lesson; the
dashboard's own queries repeat that `jobcopilot-.*` filter as a second layer,
not because Alloy would ever forward anything else).

## Import (manual — no new credentials needed)

1. Grafana Cloud → your stack → **Dashboards → New → Import**.
2. Upload `jobcopilot-overview.json` (or paste its contents).
3. When prompted, map the two datasource inputs to your stack's real
   Prometheus and Loki datasources (Grafana Cloud auto-provisions these,
   typically named `grafanacloud-<stack>-prom` and `grafanacloud-<stack>-logs`
   — the same ones `GRAFANA_CLOUD_METRICS_URL`/`GRAFANA_CLOUD_LOGS_URL`
   resolve to).
4. Import. Panels should populate immediately since Alloy has been shipping
   data since the observability rollout.

## What's on it

- **VPS host**: CPU, memory, disk (root filesystem), load average.
- **Containers**: how many `jobcopilot-*` containers are reporting (compare
  against the real count — 7: postgres, rabbitmq, api, worker, frontend,
  notifications, alloy), per-container CPU and memory.
- **Logs**: log volume by container, a coarse `(?i)error` rate as a
  did-something-change signal (not a precise error count), and a raw recent-logs
  panel.

## Known gap, named honestly

This is imported manually, not Terraform-managed — unlike `terraform/atlas`
and `terraform/vps`. Grafana does have a Terraform provider
(`grafana/grafana`, `grafana_dashboard` resource) that would fit the same
real-IaC pattern, but it needs a Grafana Cloud service account token this
session was never given and has no copy of. Worth doing if a second dashboard
or any drift-management need ever comes up; not worth minting a new credential
for a single one-time import.

If the disk-usage panel comes up empty, check the `mountpoint` label Explore
shows for `node_filesystem_size_bytes` on your stack — it's assumed to be `/`
here, but node_exporter's reported mountpoint depends on how `rootfs_path`
resolves inside the alloy container, and hasn't been checked against the live
metric names (this session ships the dashboard as code but was never given
Grafana Cloud query access to verify it against the real data).
