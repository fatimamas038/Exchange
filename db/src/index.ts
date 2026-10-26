import * as dotenv from "dotenv";

dotenv.config();
import { Client } from 'pg';
import { createClient } from 'redis';  
import { DbMessage } from './types';

const pgClient = new Client({
    user: process.env.PGUSER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.PORT ? parseInt(process.env.PORT) : 5432,
});
pgClient.connect();

async function main() {
    const redisClient = createClient();
    await redisClient.connect();
    console.log("connected to redis");

    while (true) {
        const response = await redisClient.rPop("db_processor" as string)
        if (!response) {

        }  else {
            const data: DbMessage = JSON.parse(response);
            if (data.type === "TRADE_ADDED") {
                console.log("adding data");
                console.log(data);
              
                const query = 'INSERT INTO trades (time, market,price,quantity,quote_quantity,is_buyer_maker,trade_id) VALUES ($1,$2,$3,$4,$5,$6,$7)';
             
                const values =  [
    new Date(data.data.timestamp),
    data.data.market,
    data.data.price,
    Number(data.data.quantity),
    Number(data.data.quoteQuantity),
    data.data.isBuyerMaker,
    data.data.id
];
                await pgClient.query(query, values);
            }
        }
    }

}

main();