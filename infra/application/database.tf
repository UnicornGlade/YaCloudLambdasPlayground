# Non-secret metadata of the database managed by infra/database.
# Password payloads are injected by Cloud Functions, never read by Terraform.
locals {
  database_network_id = "enptfv49fgikuladmvij"
  pg_environment = {
    PGHOST        = "c-c9q1pfg88e94keapkuue.rw.mdb.yandexcloud.net"
    PGPORT        = "6432"
    PGDATABASE    = "counter"
    PGSSLMODE     = "verify-full"
    PGSSLROOTCERT = "/function/code/certs/yandex-cloud-ca.pem"
  }
}
resource "yandex_iam_service_account" "runtime" {
  name        = "playground-runtime"
  folder_id   = var.folder_id
  description = "Read only the application DB password; no DDL or migration credentials"
}
resource "yandex_iam_service_account" "migrator" {
  name        = "playground-migrator"
  folder_id   = var.folder_id
  description = "Private migration function identity; read only DB owner password"
}
resource "yandex_lockbox_secret_iam_binding" "application_password" {
  secret_id = "e6qi51jusqq56du1nq3c"
  role      = "lockbox.payloadViewer"
  members   = ["serviceAccount:${yandex_iam_service_account.runtime.id}"]
}
resource "yandex_lockbox_secret_iam_binding" "migration_password" {
  secret_id = "e6qn5qtfkq41oegonptk"
  role      = "lockbox.payloadViewer"
  members   = ["serviceAccount:${yandex_iam_service_account.migrator.id}"]
}
resource "yandex_function" "migrate" {
  name               = "playground-migrate"
  folder_id          = var.folder_id
  description        = "IAM-only migration entrypoint, never exposed through API Gateway"
  labels             = local.labels
  runtime            = "nodejs22"
  entrypoint         = "index.handler"
  memory             = 256
  execution_timeout  = "60"
  concurrency        = 1
  user_hash          = filesha256("${path.module}/../../.artifacts/migration.zip")
  service_account_id = yandex_iam_service_account.migrator.id
  environment        = merge(local.pg_environment, { PGUSER = "counter_owner" })
  connectivity { network_id = local.database_network_id }
  content { zip_filename = "${path.module}/../../.artifacts/migration.zip" }
  secrets {
    id                   = "e6qn5qtfkq41oegonptk"
    version_id           = "e6q6snqnojifnu3mbinq"
    key                  = "postgresql_password"
    environment_variable = "PGPASSWORD"
  }
  log_options {
    log_group_id = yandex_logging_group.application.id
    min_level    = "INFO"
  }
  metadata_options {
    aws_v1_http_endpoint = 2
    gce_http_endpoint    = 2
  }
  depends_on = [yandex_lockbox_secret_iam_binding.migration_password]
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = local.release.migrationSha256 == filesha256("${path.module}/../../.artifacts/migration.zip")
      error_message = "Migration ZIP does not match the release manifest."
    }
  }
}
resource "yandex_function_scaling_policy" "migrate" {
  function_id = yandex_function.migrate.id
  policy {
    tag                  = "$latest"
    zone_instances_limit = 1
    zone_requests_limit  = 1
  }
}
output "migration_function_id" { value = yandex_function.migrate.id }
