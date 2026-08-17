# VPS Terraform module

Manages deployment onto the user's own existing VPS via `file` +
`remote-exec` provisioners over SSH - not cloud resource provisioning (see
`docs/HANDOVER.md`'s "Week 4 Plan Pivot": no card available for a major
cloud, so there's no provider API to drive here). This is the real,
last-resort IaC pattern for "manage an existing server" that HandOVER.md
already named as the honest tradeoff versus a purpose-built tool like
Ansible.

## What it manages

Uploads three files to `/opt/jobcopilot/` and runs `docker compose up -d`:

- `deploy/docker-compose.vps.yml` (repo root) -> `docker-compose.yml`
- `deploy/deploy.sh` -> `deploy.sh` (replaces the old manual
  `cat > deploy.sh` re-upload step docs/HANDOVER.md used to document)
- `observability/alloy/config.alloy` -> `observability/alloy/config.alloy`

Any future edit to those three local files changes their content hash,
which forces `terraform_data.deploy` to be replaced on the next
`terraform apply` - so this isn't a one-time-only apply, it's the real
ongoing deployment path now.

## What it deliberately does NOT manage

**`/opt/jobcopilot/.env` is untouched.** It holds `POSTGRES_PASSWORD`,
`RABBITMQ_PASSWORD`, `JWT_KEY`, `GEMINI_API_KEY`, `MONGO_URI`, and the
`GRAFANA_CLOUD_*` keys - real production secrets this session never
requested from the user and has no local copies of. Templating and
overwriting that file from Terraform on its very first apply would mean a
single transcription slip (already happened twice this session, with the
Grafana Cloud token and the Atlas private key - both caught before they hit
anything) could take down production auth or the DB connection outright.
`.env` stays hand-maintained on the VPS, exactly as it already was - the
same secret-handling discipline `AGENTS.md` already applies to this repo's
own local `.env`, extended to Terraform state too.

## Setup

```
cd terraform/vps
terraform init
```

Create `terraform.tfvars` (gitignored) with:

```
vps_ssh_private_key_path = "C:/Users/<you>/.ssh/id_ed25519"
vps_user                 = "<the real SSH deploy user>"
other_app_network_name   = "<the co-hosted app's real external Docker network name>"
```

(`vps_host` and `compose_dir` have defaults matching the real deployment and
don't need overriding - the VPS's address is already discoverable from the
live domain's DNS, so committing it carries no real cost. `vps_user` and
`other_app_network_name` deliberately have no default: the SSH username and
the fact that this box also runs a second, unrelated production app are not
otherwise discoverable, so neither should be a literal in a public repo.
`deploy/docker-compose.vps.yml` carries the literal token
`__OTHER_APP_NETWORK_NAME__` for this reason - `main.tf` substitutes it via
a targeted `replace()`, not `templatefile()` (the file already uses `${VAR}`
syntax for Docker Compose's own runtime secrets, which `templatefile()`
would also try, and fail, to resolve).)

## Verified

First real apply (2026-08-16) was checked against a captured
before/after `docker ps` baseline - every container's uptime was identical
after apply, confirming zero restarts (the three uploaded files were
already byte-identical to what was live, checksummed both sides with
`md5sum` before and after). Public smoke test
(`https://jobcopilot.dentflowbd.com/health` -> `Healthy`) reconfirmed
after apply.

## Known gap

`terraform plan` cannot preview what `file`/`remote-exec` provisioners will
actually do - Terraform only shows "resource will be created/replaced" for
`terraform_data.deploy` as a whole, not a diff of the remote effect. This
was mitigated here (checksum-verified files, captured a container-state
baseline, ran a real smoke test after) but is a structural limitation of
the provisioner approach, not something this module works around.
