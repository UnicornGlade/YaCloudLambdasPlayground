# Full-zone DNS transfer explicitly approved by the owner.
# Registration remains at RU-CENTER. The registrar NS change is a manual step.
resource "yandex_dns_zone" "domain" {
  name                = "unicornglade-tech"
  folder_id           = var.folder_id
  description         = "Authoritative DNS for unicornglade.tech, managed with Terraform"
  zone                = "unicornglade.tech."
  public              = true
  deletion_protection = true
  labels = {
    project    = "lambdas-playground"
    managed-by = "terraform"
  }
  lifecycle {
    prevent_destroy = true
  }
}

# Preserve the existing registrar/parking records. Do not repoint the root.
resource "yandex_dns_recordset" "root_a" {
  zone_id = yandex_dns_zone.domain.id
  name    = "unicornglade.tech."
  type    = "A"
  ttl     = 3600
  data    = ["178.210.92.188"]
  lifecycle {
    prevent_destroy = true
  }
}

resource "yandex_dns_recordset" "www_a" {
  zone_id = yandex_dns_zone.domain.id
  name    = "www.unicornglade.tech."
  type    = "A"
  ttl     = 3600
  data    = ["178.210.92.188"]
  lifecycle {
    prevent_destroy = true
  }
}

resource "yandex_dns_recordset" "existing_globalsign_txt" {
  zone_id = yandex_dns_zone.domain.id
  name    = "unicornglade.tech."
  type    = "TXT"
  ttl     = 3600
  data    = ["\"_globalsign-domain-verification=-MfyPRpXIDIUbzzkAH4Fum3p4wp11POflYdAPHY8o0\""]
  lifecycle {
    prevent_destroy = true
  }
}

resource "yandex_dns_recordset" "certificate_validation" {
  zone_id = yandex_dns_zone.domain.id
  name    = yandex_cm_certificate.playground.challenges[0].dns_name
  type    = yandex_cm_certificate.playground.challenges[0].dns_type
  ttl     = 300
  data    = [yandex_cm_certificate.playground.challenges[0].dns_value]
  lifecycle {
    prevent_destroy = true
  }
}

output "dns_zone_id" {
  value = yandex_dns_zone.domain.id
}
