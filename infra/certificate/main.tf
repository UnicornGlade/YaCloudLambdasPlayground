resource "yandex_cm_certificate" "playground" {
  name                = "playground-unicornglade-tech"
  description         = "Managed HTTPS certificate for the Nuxt learning project"
  folder_id           = var.folder_id
  domains             = [var.domain]
  deletion_protection = true

  labels = {
    project    = "lambdas-playground"
    managed-by = "terraform"
  }

  managed {
    challenge_type  = "DNS_CNAME"
    challenge_count = 1
  }

  lifecycle {
    prevent_destroy = true
  }
}
