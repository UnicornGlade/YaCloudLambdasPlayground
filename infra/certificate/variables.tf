variable "cloud_id" {
  description = "Approved cloud; this ID is not a secret."
  type        = string
  default     = "b1gmsvb6g8s7kq62pdv3"
}

variable "folder_id" {
  description = "Dedicated lambda-playground-folder; do not use the unrelated default folder."
  type        = string
  default     = "b1gh1fk7hbuj5hu9tujb"
}

variable "domain" {
  description = "Confirmed subdomain. The root domain is intentionally not managed here."
  type        = string
  default     = "playground.unicornglade.tech"

  validation {
    condition     = var.domain == "playground.unicornglade.tech"
    error_message = "Only the explicitly approved playground.unicornglade.tech is allowed in this bootstrap."
  }
}
