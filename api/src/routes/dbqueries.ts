import { Router } from "express";
import { CREATE_ORDER, CANCEL_ORDER, ON_RAMP, GET_OPEN_ORDERS } from "../types";


import { Client } from "pg";

export const pgClient = new Client({
  user: "your_user",
  host: "localhost", // or docker service name
  database: "my_database",
  password: "your_password",
  port: 5432,
});

pgClient.connect();

export const dbRouter = Router();

dbRouter.get("/trades", async (req, res) => {
    const { market, limit = 100 } = req.query;

    const result = await pgClient.query(
        `SELECT * FROM trades
         WHERE market = $1
         ORDER BY time DESC
         LIMIT $2`,
        [market, limit]
    );

    res.json(result.rows);
});

dbRouter.get("/candles", async (req, res) => {
    const { market, interval = "1m" } = req.query;

    const tableMap = {
        "1m": "klines_1m",
        "1h": "klines_1h",
        "1w": "klines_1w",
    };
//@ts-ignore
    const table = tableMap[interval];

    const result = await pgClient.query(
        `SELECT * FROM ${table}
         WHERE market = $1
         ORDER BY bucket ASC`,
        [market]
    );

    res.json(result.rows);
});

