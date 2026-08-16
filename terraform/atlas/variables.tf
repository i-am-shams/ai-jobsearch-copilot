variable "atlas_public_key" {
  description = "MongoDB Atlas Organization/Project API key - public part."
  type        = string
}

variable "atlas_private_key" {
  description = "MongoDB Atlas Organization/Project API key - private part."
  type        = string
  sensitive   = true
}

variable "atlas_project_id" {
  description = "The existing jobcopilot Atlas project ID (Project Settings -> General)."
  type        = string
}

variable "notifications_db_user_password" {
  description = <<-EOT
    Placeholder only. The mongodbatlas_database_user resource requires this
    attribute to be set, but `lifecycle.ignore_changes` on it means the real
    live password (in the VPS's own .env, never in this repo) is never read
    or overwritten by Terraform - Atlas's API doesn't return existing
    passwords on read either. Any value works; it's never actually applied.
  EOT
  type        = string
  sensitive   = true
  default     = "unused-see-description"
}
