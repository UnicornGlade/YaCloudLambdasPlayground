terraform {
  required_version = "= 1.16.2"
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "= 0.228.0"
    }
  }
  backend "s3" {
    bucket                      = "unicornglade-tfstate-b1gh1fk7hbuj5hu9tujb"
    key                         = "terraform/application.tfstate"
    region                      = "ru-central1"
    endpoints                   = { s3 = "https://storage.yandexcloud.net" }
    use_lockfile                = true
    use_path_style              = true
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
}
variable "cloud_id" { type = string }
variable "folder_id" { type = string }
variable "domain" { type = string }
variable "enable_custom_domain" {
  type    = bool
  default = true
}
