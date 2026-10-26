import { Client } from "pg";

const client = new Client({
    user: 'your_user',
    host: 'localhost',
    database: 'my_database',
    password: 'your_password',
    port: 5432,
});

async function initializeDB() {
    await client.connect();

    await client.query(`
        DROP TABLE IF EXISTS "trades";
  CREATE TABLE trades (
    time            TIMESTAMPTZ NOT NULL,
    market          TEXT NOT NULL,
    price           DOUBLE PRECISION NOT NULL,
    quantity        DOUBLE PRECISION NOT NULL,
    quote_quantity  DOUBLE PRECISION NOT NULL,
    is_buyer_maker  BOOLEAN,
    trade_id        TEXT
);
        
        SELECT create_hypertable('trades', 'time', 'price', 2);
    `);

    await client.query(`
        CREATE MATERIALIZED VIEW klines_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    market,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(quantity) AS volume
FROM trades
GROUP BY bucket, market;
    `);

    await client.query(`
       CREATE MATERIALIZED VIEW klines_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    market,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(quantity) AS volume
FROM trades
GROUP BY bucket, market;
    `);

    await client.query(`
       CREATE MATERIALIZED VIEW klines_1w
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 week', time) AS bucket,
    market,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(quantity) AS volume
FROM trades
GROUP BY bucket, market;
    `);

    await client.end();
    console.log("Database initialized successfully");
}

initializeDB().catch(console.error);

// to run any ts file
// npx ts-node file.ts
