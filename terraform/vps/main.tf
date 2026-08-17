# Manages deployment onto the user's own existing VPS via file + remote-exec
# provisioners over SSH - not provisioning cloud resources (see
# docs/HANDOVER.md's "Week 4 Plan Pivot": no card available for AWS/Azure/GCP,
# so there's no cloud API to drive here; the "resource" this module manages
# is the deployed state of an already-running server). HashiCorp itself
# describes provisioners as "a last resort" vs. purpose-built config
# management (Ansible would be more idiomatic) - named honestly rather than
# glossed over, per this repo's own documentation standard.
#
# Deliberately does NOT manage /opt/jobcopilot/.env - see README.md for why.

locals {
  # A targeted replace(), not templatefile(): the compose file already uses
  # ${VAR} syntax extensively for Docker Compose's own runtime secret
  # substitution (POSTGRES_PASSWORD, GEMINI_API_KEY, etc., resolved from
  # .env on the VPS, never by Terraform) - templatefile() would demand every
  # one of those resolve as a Terraform var too, which is wrong. The
  # committed file instead carries the non-colliding literal token
  # __OTHER_APP_NETWORK_NAME__ for the one value Terraform *should* fill in:
  # the co-hosted app's real network name, kept out of the public repo.
  compose_content       = replace(
    file("${path.module}/../../deploy/docker-compose.vps.yml"),
    "__OTHER_APP_NETWORK_NAME__",
    var.other_app_network_name
  )
  deploy_sh_content     = file("${path.module}/../../deploy/deploy.sh")
  alloy_config_content  = file("${path.module}/../../observability/alloy/config.alloy")
}

# terraform_data (not null_resource - this needs no extra provider) exists
# purely to carry provisioners. The "triggers_replace" hashes mean any future
# edit to the three managed files forces a real re-provision on the next
# `terraform apply`, not just on first creation - null_resource-style
# provisioners otherwise only ever run once, at creation.
resource "terraform_data" "deploy" {
  triggers_replace = {
    compose_hash      = sha256(local.compose_content)
    deploy_sh_hash    = sha256(local.deploy_sh_content)
    alloy_config_hash = sha256(local.alloy_config_content)
  }

  connection {
    type        = "ssh"
    host        = var.vps_host
    user        = var.vps_user
    private_key = file(var.vps_ssh_private_key_path)
  }

  # file provisioners don't create parent directories - has to exist before
  # the alloy config gets uploaded into it.
  provisioner "remote-exec" {
    inline = ["mkdir -p ${var.compose_dir}/observability/alloy"]
  }

  provisioner "file" {
    content     = local.compose_content
    destination = "${var.compose_dir}/docker-compose.yml"
  }

  provisioner "file" {
    content     = local.deploy_sh_content
    destination = "${var.compose_dir}/deploy.sh"
  }

  provisioner "file" {
    content     = local.alloy_config_content
    destination = "${var.compose_dir}/observability/alloy/config.alloy"
  }

  # Validate before applying, same discipline as every other change to this
  # shared VPS (see AGENTS.md: "Always validate before touching shared/live
  # infrastructure"). `docker compose up -d` only recreates containers whose
  # actual config changed, so this is safe to run even when nothing did.
  provisioner "remote-exec" {
    inline = [
      "chmod 750 ${var.compose_dir}/deploy.sh",
      "cd ${var.compose_dir} && docker compose config --quiet",
      "cd ${var.compose_dir} && docker compose up -d",
    ]
  }
}
