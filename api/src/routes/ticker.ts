
import { Client } from "pg";
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

export const tickersRouter = Router();


tickersRouter.get("/", async (req, res) => {  
 
    const market=req.query.market as string 

       const result = await pgClient.query(`SELECT
    last(price, time) AS last_price,
    MAX(price) AS high,
    MIN(price) AS low,
    SUM(quantity) AS volume
FROM trades
WHERE market = $1
AND time >= NOW() - INTERVAL '24 hours'`,[market])
const ticker=result.rows[0]

console.log(ticker);

      const response = await RedisManager.getInstance().sendAndAwait({
            type: "TICKER_INFO",
            data: {
                market,
              }
        });

if (response && response.type === "TICKER_INFO") {
    const bestBid = response.payload.bestBid;
    const bestAsk = response.payload.bestAsk;
    console.log("from api/ticker route - best ask", bestAsk);
     console.log("from api/ticker route - best bid", bestBid);
    
 if(!ticker.last_price){
    return res.json({ error: "No trades happened in last 24 hrs(UTC)" });
 }
    return res.json({ market, bestBid, bestAsk, ...ticker});
} else {

    return res.status(500).json({ error: "Invalid response type from engine" });
}

  
});