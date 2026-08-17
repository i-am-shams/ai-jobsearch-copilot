variable "vps_host" {
  description = "The VPS's address."
  type        = string
  default     = "144.79.132.100"
}

variable "vps_user" {
  description = "The unprivileged SSH deploy user (docker group, no sudo needed for docker commands). No default deliberately - supply via terraform.tfvars (gitignored), not committed."
  type        = string
}

variable "other_app_network_name" {
  description = "The real external Docker network name of the co-hosted app's nginx, that this project's frontend joins to reach it (see deploy/docker-compose.vps.yml). No default deliberately - it names a specific unrelated production app co-hosted on the same VPS; supply via terraform.tfvars (gitignored), not committed."
  type        = string
}

variable "vps_ssh_private_key_path" {
  description = "Local path to the SSH private key authorized for vps_user. Not a secret value itself (it's a file path), but treat the key file it points to with the same care as any credential."
  type        = string
}

variable "compose_dir" {
  description = "Where the stack lives on the VPS."
  type        = string
  default     = "/opt/jobcopilot"
}
