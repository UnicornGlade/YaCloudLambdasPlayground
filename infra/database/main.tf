# Prepared plan only. Do not apply before confirming the revised DB cost.
locals {
  labels = { project = "lambdas-playground", managed-by = "terraform" }
  # Available zones verified by creation. c is DOWN; k reports UP but
  # subnet creation is forbidden for this folder (no resource was created).
  subnets = {
    ru-central1-a = "10.77.0.0/24"
    ru-central1-b = "10.77.1.0/24"
    ru-central1-d = "10.77.2.0/24"
    ru-central1-e = "10.77.3.0/24"
  }
}
resource "yandex_vpc_network" "application" {
  name      = "playground-private"
  folder_id = var.folder_id
  labels    = local.labels
  lifecycle { prevent_destroy = true }
}
resource "yandex_vpc_subnet" "application" {
  for_each       = local.subnets
  name           = "playground-${each.key}"
  folder_id      = var.folder_id
  network_id     = yandex_vpc_network.application.id
  zone           = each.key
  v4_cidr_blocks = [each.value]
  labels         = local.labels
  lifecycle { prevent_destroy = true }
}
resource "yandex_vpc_security_group" "postgresql" {
  name       = "playground-postgresql"
  folder_id  = var.folder_id
  network_id = yandex_vpc_network.application.id
  labels     = local.labels
  ingress {
    description    = "PostgreSQL only from Cloud Functions service subnets attached to this VPC"
    protocol       = "TCP"
    port           = 6432
    v4_cidr_blocks = ["198.19.0.0/16"]
  }
  ingress {
    description       = "Internal cluster communication"
    protocol          = "ANY"
    predefined_target = "self_security_group"
  }
  egress {
    description       = "Internal cluster communication"
    protocol          = "ANY"
    predefined_target = "self_security_group"
  }
  lifecycle { prevent_destroy = true }
}
resource "yandex_mdb_postgresql_cluster" "counter" {
  name                = "playground-postgresql"
  folder_id           = var.folder_id
  environment         = "PRODUCTION"
  network_id          = yandex_vpc_network.application.id
  security_group_ids  = [yandex_vpc_security_group.postgresql.id]
  deletion_protection = true
  labels              = local.labels
  config {
    version = "17"
    resources {
      resource_preset_id = "s3-c2-m8"
      disk_type_id       = "network-ssd"
      disk_size          = 10
    }
    backup_retain_period_days = 7
    backup_window_start {
      hours   = 3
      minutes = 0
    }
    pooler_config { pooling_mode = "SESSION" }
    connection_manager { enabled = true }
    access {
      data_lens     = false
      data_transfer = false
      serverless    = false
      web_sql       = false
      yandex_query  = false
    }
  }
  host {
    zone             = "ru-central1-d"
    subnet_id        = yandex_vpc_subnet.application["ru-central1-d"].id
    assign_public_ip = false
  }
  maintenance_window { type = "ANYTIME" }
  lifecycle { prevent_destroy = true }
}
# Passwords generated server-side and stored via Connection Manager in Lockbox.
# Never fetch passwords into Terraform data sources or outputs.
resource "yandex_mdb_postgresql_user" "owner" {
  cluster_id        = yandex_mdb_postgresql_cluster.counter.id
  name              = "counter_owner"
  generate_password = true
  conn_limit        = 10
  lifecycle { prevent_destroy = true }
}
resource "yandex_mdb_postgresql_database" "counter" {
  cluster_id = yandex_mdb_postgresql_cluster.counter.id
  name       = "counter"
  owner      = yandex_mdb_postgresql_user.owner.name
  lifecycle { prevent_destroy = true }
}
resource "yandex_mdb_postgresql_user" "application" {
  cluster_id        = yandex_mdb_postgresql_cluster.counter.id
  name              = "counter_app"
  generate_password = true
  conn_limit        = 16
  settings = {
    statement_timeout                   = 5000
    lock_timeout                        = 2000
    idle_in_transaction_session_timeout = 10000
  }
  permission { database_name = yandex_mdb_postgresql_database.counter.name }
  lifecycle { prevent_destroy = true }
}
output "network_id" { value = yandex_vpc_network.application.id }
output "cluster_id" { value = yandex_mdb_postgresql_cluster.counter.id }
output "database_name" { value = yandex_mdb_postgresql_database.counter.name }
output "master_host" { value = "c-${yandex_mdb_postgresql_cluster.counter.id}.rw.mdb.yandexcloud.net" }
