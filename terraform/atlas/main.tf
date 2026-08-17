provider "mongodbatlas" {
  public_key  = var.atlas_public_key
  private_key = var.atlas_private_key
}

# Read-only first: the M0 cluster, its network access list and its database
# user already exist (created manually - see docs/HANDOVER.md's MongoDB
# Atlas section). This project's own tier may have been silently
# auto-migrated by Atlas from "M0/shared-tier" to "Flex" (Atlas has been
# converting shared-tier clusters since Jan 2025) - checking the real
# current state here before writing any resource block that assumes one
# shape or the other, rather than assuming the tier that was true when the
# cluster was first created. Confirmed via this data source (see
# terraform/atlas/README.md): still genuinely TENANT/M0, not migrated.
data "mongodbatlas_advanced_clusters" "existing" {
  project_id = var.atlas_project_id
}

# Matches the live cluster exactly (verified via the data source above
# before writing this) - imported into state, never apply-created, since a
# fresh M0 cluster is a real, non-reversible-for-free resource and this one
# already holds real notification documents.
resource "mongodbatlas_advanced_cluster" "cluster0" {
  project_id   = var.atlas_project_id
  name         = "Cluster0"
  cluster_type = "REPLICASET"

  replication_specs {
    zone_name = "Zone 1"

    region_configs {
      provider_name         = "TENANT"
      backing_provider_name = "AWS"
      region_name           = "AP_SOUTHEAST_1"
      priority              = 7

      electable_specs {
        instance_size = "M0"
      }
    }
  }
}

# The VPS's own IP in the Network Access list - the specific entry whose
# absence caused the TLS handshake failures documented in AGENTS.md when
# this cluster was first wired up. Managing this one explicitly, since it's
# the one production dependency; other ad-hoc entries added via Atlas's
# browser-based "Automate security setup" flow are not imported here (see
# terraform/atlas/README.md for what's intentionally out of scope).
resource "mongodbatlas_project_ip_access_list" "vps" {
  project_id = var.atlas_project_id
  cidr_block = "144.79.132.100/32"
  comment    = "jobcopilot VPS"
}

# The notifications service's own database user. Password is intentionally
# NOT managed here (see variables.tf) - importing and then applying with a
# generated/different password would rotate the live credential out from
# under the already-deployed notifications service on the VPS, breaking it
# until MONGO_URI was manually updated everywhere. This resource exists so
# Terraform is aware of the user (and would flag if its roles/scopes drift),
# without being able to silently change its password.
#
# SECURITY GAP FIXED: previously matched the role the user actually had live -
# atlasAdmin on the admin database, i.e. full project-wide admin - rather than
# the scoped readWrite-on-its-own-database role the notifications service
# actually needs (it only ever does db.collection('notifications').insertOne
# and .createIndex - see notifications/src/handler.ts, mongo.ts). Left
# matching reality (not silently tightened) for one full session while the
# real database name was confirmed against the live deployment
# (docker exec jobcopilot-notifications printenv MONGO_DB_NAME ->
# jobcopilot_notifications, matching the code default) - changing a live
# credential's privileges on a shared production database is a real action
# with real blast-radius, not something to fold into an unrelated
# Terraform-adoption pass without a separate, explicit go-ahead. auth_database_name
# stays "admin" - that's where Atlas stores SCRAM credentials regardless of which
# database a user's roles grant access to, not something this change touches.
resource "mongodbatlas_database_user" "notifications" {
  project_id         = var.atlas_project_id
  username           = "iamshams_db_user"
  password           = var.notifications_db_user_password
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = "jobcopilot_notifications"
  }

  lifecycle {
    ignore_changes = [password]
  }
}
