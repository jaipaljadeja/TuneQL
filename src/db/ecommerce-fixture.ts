export const ECOMMERCE_DEMO_NAME = 'Ecommerce Analytics & Orders';

export const INITIAL_BASELINE_SQL = `SELECT 
  c.region,
  COUNT(o.id) AS order_count,
  ROUND(SUM(o.total_amount), 2) AS total_revenue,
  ROUND(AVG(o.total_amount), 2) AS avg_order_value
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'completed'
  AND o.created_at >= '2024-03-01 00:00:00'
  AND o.created_at < '2024-04-01 00:00:00'
GROUP BY c.region
ORDER BY total_revenue DESC;`;

export const INITIAL_CONSTRAINTS = {
  targetRuntimeMs: 5,
  requireEquivalentResults: true,
  allowQueryRewrite: true,
  allowIndexes: true,
  maxNewIndexes: 1,
};

/**
 * Returns SQL DDL and seeded data generation statements for PGlite.
 * Uses generate_series and deterministic pseudo-random seeds for lightning-fast, reproducible browser setup.
 */
export function getEcommerceSeedSql(): string {
  return `
-- 1. Create Schema
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE customers (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  region TEXT NOT NULL,
  tier TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE products (
  id BIGINT PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  stock INT NOT NULL
);

CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE order_items (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL
);

-- 2. Seed Customers (3,000 rows)
INSERT INTO customers (id, name, email, region, tier, created_at)
SELECT
  i AS id,
  'Customer ' || i AS name,
  'user' || i || '@example.com' AS email,
  (ARRAY['US-East', 'US-West', 'EU-West', 'APAC', 'LATAM'])[1 + ((i * 7) % 5)] AS region,
  (ARRAY['standard', 'standard', 'gold', 'platinum'])[1 + ((i * 3) % 4)] AS tier,
  TIMESTAMP '2023-01-01 00:00:00' + ((i * 37) % 500 || ' days')::INTERVAL AS created_at
FROM generate_series(1, 3000) AS i;

-- 3. Seed Products (500 rows)
INSERT INTO products (id, sku, name, category, price, stock)
SELECT
  i AS id,
  'SKU-' || LPAD(i::TEXT, 5, '0') AS sku,
  'Product ' || i AS name,
  (ARRAY['Electronics', 'Home & Kitchen', 'Apparel', 'Books', 'Tools'])[1 + ((i * 11) % 5)] AS category,
  ROUND((15 + ((i * 19) % 350) + 0.99)::NUMERIC, 2) AS price,
  50 + ((i * 13) % 450) AS stock
FROM generate_series(1, 500) AS i;

-- 4. Seed Orders (60,000 rows)
INSERT INTO orders (id, customer_id, status, total_amount, created_at)
SELECT
  i AS id,
  1 + ((i * 47) % 3000) AS customer_id,
  (ARRAY['completed', 'pending', 'processing', 'cancelled', 'refunded', 'on_hold', 'disputed'])[1 + (i % 7)] AS status,
  ROUND((15 + (i % 450) + ((i % 100) * 0.01))::NUMERIC, 2) AS total_amount,
  TIMESTAMP '2023-01-01 00:00:00' + ((i * 17) % 730 || ' days')::INTERVAL + ((i * 23) % 86400 || ' seconds')::INTERVAL AS created_at
FROM generate_series(1, 60000) AS i;

-- 5. Seed Order Items (60,000 rows)
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
SELECT
  i AS id,
  1 + ((i - 1) / 2) AS order_id,
  1 + ((i * 23) % 500) AS product_id,
  1 + ((i * 3) % 4) AS quantity,
  ROUND((20 + ((i * 17) % 180) + 0.50)::NUMERIC, 2) AS unit_price
FROM generate_series(1, 60000) AS i;

-- 6. Initial Foreign Key Indexes (Base Setup)
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- Run ANALYZE to update statistics for the query planner
ANALYZE customers;
ANALYZE products;
ANALYZE orders;
ANALYZE order_items;
`;
}
