output "existing_clusters" {
  description = "Diagnostic only: inspect the live cluster's real current shape before writing the managed resource block."
  value       = data.mongodbatlas_advanced_clusters.existing.results
}
