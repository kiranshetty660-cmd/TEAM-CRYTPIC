from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    Date,
    DateTime,
    Text,
    Index,
    ForeignKey,
)
from app.db import Base

class Product(Base):
    __tablename__ = "products"

    sku = Column(String(50), primary_key=True, index=True)
    molecule = Column(String(200), nullable=False)
    brand = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    storage = Column(String(20), nullable=False)  # 'ambient' or '2-8C'
    critical_drug = Column(Boolean, default=False, nullable=False)

class BatchInventory(Base):
    __tablename__ = "batch_inventory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    batch = Column(String(50), nullable=False, index=True)
    warehouse = Column(String(50), nullable=False, index=True)
    cold_room = Column(String(50), nullable=True)
    qty = Column(Integer, nullable=False, default=0)
    mfg_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="active")  # 'active', 'blocked', 'quarantine', 'returned'

    __table_args__ = (
        Index("idx_batch_inv_sku_expiry", "sku", "expiry_date"),
        Index("idx_batch_inv_sku_batch", "sku", "batch"),
    )

class Customer(Base):
    __tablename__ = "customers"

    customer_id = Column(String(50), primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    type = Column(String(20), nullable=False)  # 'chemist' or 'hospital'
    location = Column(String(200), nullable=False)
    credit_terms = Column(String(50), nullable=False, default="Net 30")

class Dispatch(Base):
    __tablename__ = "dispatches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    customer_id = Column(String(50), ForeignKey("customers.customer_id"), nullable=False, index=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    batch = Column(String(50), nullable=False, index=True)
    qty = Column(Integer, nullable=False)
    from_warehouse = Column(String(50), nullable=False)

    __table_args__ = (
        Index("idx_dispatches_sku_date", "sku", "date"),
        Index("idx_dispatches_batch", "batch"),
    )

class TempLog(Base):
    __tablename__ = "temp_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    warehouse = Column(String(50), nullable=False, index=True)
    cold_room = Column(String(50), nullable=False, index=True)
    ts = Column(DateTime, nullable=False, index=True)
    temp_c = Column(Float, nullable=False)

    __table_args__ = (
        Index("idx_temp_logs_wh_room_ts", "warehouse", "cold_room", "ts"),
    )

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manufacturer = Column(String(200), nullable=False, index=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    lead_time_days = Column(Integer, nullable=False, default=7)
    moq = Column(Integer, nullable=False, default=100)
    return_window_days = Column(Integer, nullable=False, default=60)
    credit_pct = Column(Float, nullable=False, default=0.60)
    unit_cost = Column(Float, nullable=False, default=100.0)

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po = Column(String(50), primary_key=True, index=True)
    manufacturer = Column(String(200), nullable=False)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    qty = Column(Integer, nullable=False)
    expected_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="ordered")  # 'draft', 'ordered', 'received', 'cancelled'
    draft = Column(Boolean, nullable=False, default=False)

class Recall(Base):
    __tablename__ = "recalls"

    id = Column(String(50), primary_key=True, index=True)
    date = Column(Date, nullable=False)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    batches = Column(Text, nullable=False)  # JSON serialized list of batch IDs e.g. '["B2231"]'
    reason = Column(Text, nullable=False)
    recall_class = Column(String(10), nullable=False)  # 'I', 'II', 'III'

class Action(Base):
    __tablename__ = "actions"

    id = Column(String(50), primary_key=True, index=True)
    type = Column(String(50), nullable=False)  # BLOCK_BATCH, SEND_NOTICES, URGENT_PO, TRANSFER, RETURN_REQUEST, etc.
    payload = Column(Text, nullable=False)  # JSON
    evidence = Column(Text, nullable=False)  # JSON
    options = Column(Text, nullable=False)  # JSON
    chosen_option = Column(String(50), nullable=True)
    status = Column(String(30), nullable=False, default="draft")  # draft, pending_approval, approved, executed, rejected
    required_role = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False)
    decided_by = Column(String(100), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    reason = Column(Text, nullable=True)

class Ledger(Base):
    __tablename__ = "ledger"

    seq = Column(Integer, primary_key=True, autoincrement=False)  # strictly sequential 1, 2, 3...
    ts = Column(String(50), nullable=False)
    event_type = Column(String(50), nullable=False)
    payload = Column(Text, nullable=False)  # canonical JSON
    prev_hash = Column(String(64), nullable=False)
    hash = Column(String(64), nullable=False)

class Anchor(Base):
    __tablename__ = "anchors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    from_seq = Column(Integer, nullable=False)
    to_seq = Column(Integer, nullable=False)
    merkle_root = Column(String(66), nullable=False)
    tx_hash = Column(String(100), nullable=False)
    chain = Column(String(50), nullable=False, default="simulated")  # 'amoy' or 'simulated'
    status = Column(String(20), nullable=False, default="confirmed")
