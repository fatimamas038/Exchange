
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

export const klineRouter = Router();

// klineRouter.get("/", async (req, res) => {
//     const { market, interval, startTime, endTime } = req.query;

//     let query;
//     switch (interval) {
//         case '1m':
//             query = `SELECT * FROM klines_1m WHERE bucket >= $1 AND bucket <= $2`;
//             break;
//         case '1h':
//             query = `SELECT * FROM klines_1m WHERE  bucket >= $1 AND bucket <= $2`;
//             break;
//         case '1w':
//             query = `SELECT * FROM klines_1w WHERE bucket >= $1 AND bucket <= $2`;
//             break;
//         default:
//             return res.status(400).send('Invalid interval');
//     }

//     try {
//         //@ts-ignore
//         const result = await pgClient.query(query, [new Date(startTime * 1000 as string), new Date(endTime * 1000 as string)]);
//         res.json(result.rows.map(x => ({
//             close: x.close,
//             end: x.bucket,
//             high: x.high,
//             low: x.low,
//             open: x.open,
//             quoteVolume: x.quoteVolume,
//             start: x.start,
//             trades: x.trades,
//             volume: x.volume,
//         })));
//     } catch (err) {
//         console.log(err);
//         res.status(500).send(err);
//     }
// });


 klineRouter.get("/",async (req, res) => {
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
