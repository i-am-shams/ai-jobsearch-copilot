terraform {
  required_version = ">= 1.9.0"

  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.29"
    }
  }
}
