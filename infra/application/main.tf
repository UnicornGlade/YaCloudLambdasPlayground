locals {
  release = jsondecode(file("${path.module}/../../.artifacts/release.json"))
  labels  = { project = "lambdas-playground", managed-by = "terraform" }
}
resource "yandex_storage_bucket" "site" {
  bucket        = "unicornglade-site-${var.folder_id}"
  folder_id     = var.folder_id
  force_destroy = false
  max_size      = 134217728
  anonymous_access_flags {
    read        = true
    list        = false
    config_read = false
  }
  lifecycle { prevent_destroy = true }
}
resource "yandex_logging_group" "application" {
  name             = "playground-application"
  folder_id        = var.folder_id
  retention_period = "24h"
  labels           = local.labels
}
resource "yandex_iam_service_account" "gateway" {
  name        = "playground-gateway"
  folder_id   = var.folder_id
  description = "May invoke only the playground function; no administrative roles or keys"
}
resource "yandex_function" "api" {
  name              = "playground-api"
  folder_id         = var.folder_id
  description       = "Nuxt Nitro API, stage 1 without PostgreSQL"
  labels            = local.labels
  runtime           = "nodejs22"
  entrypoint        = "index.handler"
  memory            = 256
  execution_timeout = "10"
  concurrency       = 1
  user_hash         = filesha256("${path.module}/../../.artifacts/function.zip")
  tags              = ["live"]
  environment       = { APP_VERSION = local.release.version, NODE_ENV = "production" }
  content { zip_filename = "${path.module}/../../.artifacts/function.zip" }
  log_options {
    log_group_id = yandex_logging_group.application.id
    min_level    = "INFO"
  }
  metadata_options {
    aws_v1_http_endpoint = 2
    gce_http_endpoint    = 2
  }
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = local.release.functionSha256 == filesha256("${path.module}/../../.artifacts/function.zip") && local.release.payloadFormatVersion == "2.0"
      error_message = "Build manifest and function ZIP must match; run npm run check."
    }
  }
}
resource "yandex_function_iam_binding" "gateway_invoker" {
  function_id = yandex_function.api.id
  role        = "functions.functionInvoker"
  members     = ["serviceAccount:${yandex_iam_service_account.gateway.id}"]
}
resource "yandex_function_scaling_policy" "api" {
  function_id = yandex_function.api.id
  policy {
    tag                  = "live"
    zone_instances_limit = 1
    zone_requests_limit  = 1
  }
  policy {
    tag                  = "$latest"
    zone_instances_limit = 1
    zone_requests_limit  = 1
  }
}
resource "yandex_api_gateway" "site" {
  name              = "playground"
  folder_id         = var.folder_id
  description       = "Static Nuxt SPA + private Cloud Function; no database yet"
  labels            = local.labels
  execution_timeout = "15"
  spec = templatefile("${path.module}/gateway.yaml.tftpl", {
    bucket             = yandex_storage_bucket.site.bucket
    function_id        = yandex_function.api.id
    service_account_id = yandex_iam_service_account.gateway.id
  })
  log_options {
    log_group_id = yandex_logging_group.application.id
    min_level    = "WARN"
  }
  dynamic "custom_domains" {
    for_each = var.enable_custom_domain ? [1] : []
    content {
      fqdn           = var.domain
      certificate_id = "fpqlqlsp9augs9lqa7ne"
    }
  }
  depends_on = [yandex_function_iam_binding.gateway_invoker, yandex_function_scaling_policy.api]
  lifecycle { prevent_destroy = true }
}
# Own only this record, not the shared zone (managed in infra/certificate).
resource "yandex_dns_recordset" "application" {
  count   = var.enable_custom_domain ? 1 : 0
  zone_id = "dns6q8qkkgijhtq66ljf"
  name    = "${var.domain}."
  type    = "CNAME"
  ttl     = 300
  data    = ["${trimsuffix(yandex_api_gateway.site.domain, ".")}."]
  lifecycle { prevent_destroy = true }
}
output "gateway_url" { value = "https://${yandex_api_gateway.site.domain}" }
output "site_bucket" { value = yandex_storage_bucket.site.bucket }
output "function_id" { value = yandex_function.api.id }
output "log_group_id" { value = yandex_logging_group.application.id }
output "app_version" { value = local.release.version }
output "custom_domain_enabled" { value = var.enable_custom_domain }
