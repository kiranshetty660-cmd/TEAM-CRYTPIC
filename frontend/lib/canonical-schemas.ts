// ==============================================================================
// AUTHORITATIVE CENTRALIZED SCHEMAS FOR TRACERX FRONTEND
// Synchronized single source of truth with backend app/engine/canonical_schemas.py
// ==============================================================================

export const REQUIRED_SCHEMAS: Record<string, string[]> = {
  products: ["sku", "molecule", "brand", "category", "storage", "critical_drug"],
  batch_inventory: ["sku", "batch", "warehouse", "qty", "mfg_date", "expiry_date"],
  dispatches: ["date", "customer", "sku", "batch", "qty"],
  customers: ["customer", "type", "location", "credit_terms"],
  temperature_logs: ["warehouse", "cold_room", "timestamp", "temp_c"],
  temp_logs: ["warehouse", "cold_room", "timestamp", "temp_c"],
  suppliers: ["manufacturer", "sku", "lead_time_days", "moq", "return_window_days"],
  purchase_orders: ["po", "manufacturer", "sku", "qty", "expected_date", "status"],
  recalls: ["date", "sku", "batches", "reason", "recall_class"],
};

export const OPTIONAL_FIELDS: Record<string, string[]> = {
  products: [],
  batch_inventory: ["cold_room", "status"],
  dispatches: ["from_warehouse"],
  customers: ["name"],
  temperature_logs: [],
  temp_logs: [],
  suppliers: ["unit_cost", "credit_pct"],
  purchase_orders: [],
  recalls: ["id"],
};

export const ENTITY_CONFIG: Record<
  string,
  {
    title: string;
    description: string;
    enums?: Record<string, string[]>;
  }
> = {
  products: {
    title: "Products",
    description: "Product Master Catalog & Molecules",
    enums: {
      storage: ["ambient", "2-8C"],
    },
  },
  batch_inventory: {
    title: "Batch Inventory",
    description: "Warehouse Batches & Expiry Dates",
  },
  dispatches: {
    title: "Dispatches",
    description: "Historical Customer Shipments",
  },
  customers: {
    title: "Customers",
    description: "Hospitals & Retail Chemists",
    enums: {
      type: ["chemist", "hospital"],
    },
  },
  temp_logs: {
    title: "Temperature Logs",
    description: "Cold Storage IoT Sensor Streams",
  },
  temperature_logs: {
    title: "Temperature Logs",
    description: "Cold Storage IoT Sensor Streams",
  },
  suppliers: {
    title: "Suppliers",
    description: "Manufacturer Lead Times & Return Terms",
  },
  purchase_orders: {
    title: "Purchase Orders",
    description: "Purchase Orders & Inbound Shipments",
  },
  recalls: {
    title: "Recalls",
    description: "CDSCO Regulatory Recalls",
  },
};
