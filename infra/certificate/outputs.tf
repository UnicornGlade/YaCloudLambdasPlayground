output "certificate_id" {
  description = "Public resource identifier, for API Gateway integration and status checks."
  value       = yandex_cm_certificate.playground.id
}

output "certificate_status" {
  description = "Last observed status. Creating the request is not the same as issuing the certificate."
  value       = yandex_cm_certificate.playground.status
}

output "certificate_dns" {
  description = "Public DNS validation record to add at the existing DNS provider. Keep it for automatic renewal."
  value = [for challenge in yandex_cm_certificate.playground.challenges : {
    name  = challenge.dns_name
    type  = challenge.dns_type
    value = challenge.dns_value
    ttl   = 300
  } if challenge.dns_type == "CNAME"]
}
