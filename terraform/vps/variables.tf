variable "vps_host" {
  description = "The VPS's address."
  type        = string
  default     = "144.79.132.100"
}

variable "vps_user" {
  description = "The unprivileged SSH deploy user (docker group, no sudo needed for docker commands)."
  type        = string
  default     = "<deploy-user>"
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
