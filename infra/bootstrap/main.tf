resource "yandex_storage_bucket" "state" {
  bucket        = "unicornglade-tfstate-b1gh1fk7hbuj5hu9tujb"
  folder_id     = "b1gh1fk7hbuj5hu9tujb"
  acl           = "private"
  force_destroy = false
  max_size      = 134217728

  anonymous_access_flags {
    read        = false
    list        = false
    config_read = false
  }
  versioning {
    enabled = true
  }
  # In Yandex Storage a policy also needs an explicit Allow; a Deny-only
  # policy blocks even the owner. This does NOT grant anonymous access.
  policy = file("${path.module}/state-policy.json")
  lifecycle {
    prevent_destroy = true
  }
}
output "state_bucket" {
  value = yandex_storage_bucket.state.bucket
}
