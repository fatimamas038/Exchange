
import { Client } from 'pg';
import { Router } from "express";
import { RedisManager } from "../RedisManager";


const pgClient = new Client({
    user: process.env.PGUSER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.PORT ? parseInt(process.env.PORT) : 5432,
});
pgClient.connect();

export const tradesRouter=Router()

tradesRouter.get("/", async (req, res) => {
    const { market, limit = 100 } = req.query;

    const result = await pgClient.query(
        `SELECT * FROM trades
         WHERE market = $1
         ORDER BY time DESC
         LIMIT $2`,
        [market, limit]
    );
console.log(result.rows);
    res.json(result.rows);
});
