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

- **The `iamshams_db_user` database user has `atlasAdmin` on the `admin`
  database live** - i.e. full project-wide admin, not the scoped
  `readWrite`-on-its-own-database role the notifications service actually
  needs. Found during import (`terraform plan` showed the drift between an
  assumed scoped role and this). Deliberately left matching reality rather
  than silently tightened by this same change - narrowing a live
  credential's privileges on a production database is a separate, explicit
  decision, not something to fold into a Terraform-adoption pass.
- Only the VPS's own IP access list entry is imported/managed. Other
  ad-hoc entries added via Atlas's browser-based "Automate security setup"
  flow when the project was first created are not imported.
- The Atlas *project* itself (`mongodbatlas_project`) is not managed here -
  only project-scoped resources. The API key used is deliberately scoped to
  Project Owner on this one project, not Organization Owner, which can't
  create/manage projects at the org level anyway.
