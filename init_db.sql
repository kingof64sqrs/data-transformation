-- ============================================
-- GOLDEN RECORD POC - DATABASE SCHEMA
-- ============================================

-- Simulated DB2 (Legacy System)
CREATE TABLE IF NOT EXISTS db2_customer_simulated (
    cust_id SERIAL PRIMARY KEY,
    fname TEXT NOT NULL,
    lname TEXT NOT NULL,
    phone TEXT,
    address TEXT
);

-- Bronze Layer (Raw Data)
CREATE TABLE IF NOT EXISTS bronze_customer (
    bronze_id SERIAL PRIMARY KEY,
    cust_id INT,
    fname TEXT,
    lname TEXT,
    phone TEXT,
    address TEXT,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Silver Layer (Cleaned Data)
CREATE TABLE IF NOT EXISTS silver_customer (
    silver_id SERIAL PRIMARY KEY,
    bronze_id INT REFERENCES bronze_customer(bronze_id),
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    city TEXT,
    cleaned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deduplication Results
CREATE TABLE IF NOT EXISTS duplicate_matches (
    match_id SERIAL PRIMARY KEY,
    silver_id_a INT REFERENCES silver_customer(silver_id),
    silver_id_b INT REFERENCES silver_customer(silver_id),
    match_score FLOAT,
    decision TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Review Queue (Manual Review)
CREATE TABLE IF NOT EXISTS review_queue (
    review_id SERIAL PRIMARY KEY,
    silver_id_a INT REFERENCES silver_customer(silver_id),
    silver_id_b INT REFERENCES silver_customer(silver_id),
    match_score FLOAT,
    status TEXT DEFAULT 'PENDING',
    reviewer_comment TEXT,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Golden Record (Final Output)
CREATE TABLE IF NOT EXISTS gold_customer (
    golden_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    city TEXT,
    source_ids INT[] NOT NULL,
    merged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kafka Offset Tracking
CREATE TABLE IF NOT EXISTS kafka_offsets (
    topic TEXT,
    partition INT,
    offset INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (topic, partition)
);

-- Sample data in simulated DB2
INSERT INTO db2_customer_simulated (fname, lname, phone, address) VALUES
('Krish', 'R', '9876543210', 'Bangalore'),
('Krishnan', 'Reddy', '9876543210', 'Bangalore'),
('John', 'Smith', '5551234567', 'New York'),
('Jon', 'Smith', '5551234567', 'NY'),
('Alice', 'Johnson', '5559876543', '456 Park Ave, Los Angeles'),
('Alice', 'Johnson', '5559876543', 'Los Angeles'),
('Bob', 'Wilson', '5552223333', '789 Oak St, Chicago'),
('Robert', 'Wilson', '5552223333', 'Chicago')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_silver_customer_name ON silver_customer(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_silver_customer_phone ON silver_customer(phone);
CREATE INDEX IF NOT EXISTS idx_bronze_ingested_at ON bronze_customer(ingested_at);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_duplicate_matches_decision ON duplicate_matches(decision);
