# Atlas Terraform module

Manages the existing (manually created) MongoDB Atlas resources for the
notifications service - imported into state, never apply-created. See
`docs/HANDOVER.md`'s MongoDB Atlas section for how the cluster was first
provisioned.

## Setup

```
cd terraform/atlas
terraform init
```

Create `terraform.tfvars` (gitignored) with:

```
atlas_public_key  = "<Project API key, Project Owner role>"
atlas_private_key = "<the matching private key>"
atlas_project_id  = "<Project Settings -> General -> Project ID>"
```

## What's managed

- `mongodbatlas_advanced_cluster.cluster0` - the M0 free-tier cluster
  (`TENANT`/`M0`, AWS, `AP_SOUTHEAST_1`). Confirmed via a live read before
  writing this config that Atlas has *not* silently migrated it to a Flex
  cluster (a real, documented risk - Atlas has been converting shared-tier
  clusters to Flex since Jan 2025).
- `mongodbatlas_project_ip_access_list.vps` - the VPS's IP
  (`144.79.132.100/32`), the entry whose absence caused the TLS handshake
  failures documented in `AGENTS.md` when this cluster was first wired up.
- `mongodbatlas_database_user.notifications` - the notifications service's
  DB user. Password is **not** managed (`lifecycle.ignore_changes`) -
  Terraform importing then applying with a different password would rotate
  the live credential out from under the already-deployed service.

## Known gaps, named honestly

- ~~The `iamshams_db_user` database user has `atlasAdmin` on the `admin`
  database live~~ - **fixed**: scoped to `readWrite` on `jobcopilot_notifications`
  (confirmed as the real deployed database name via
  `docker exec jobcopilot-notifications printenv MONGO_DB_NAME`, matching the
  code default). `terraform plan` showed a clean single-field diff (only the
  `roles` block), applied, then verified against production: submitted a real
  application through the live site, confirmed the notifications service still
  wrote a real document to Mongo with the now-scoped credential (queried Atlas
  directly, matched on `applicationId`).
- Only the VPS's own IP access list entry is imported/managed. Other
  ad-hoc entries added via Atlas's browser-based "Automate security setup"
  flow when the project was first created are not imported.
- The Atlas *project* itself (`mongodbatlas_project`) is not managed here -
  only project-scoped resources. The API key used is deliberately scoped to
  Project Owner on this one project, not Organization Owner, which can't
  create/manage projects at the org level anyway.
