import * as dotenv from "dotenv";

dotenv.config();
import express from "express";
import cors from "cors";
import { orderRouter } from "./routes/order";
import { depthRouter } from "./routes/depth";
import { tradesRouter } from "./routes/trades";
import { klineRouter } from "./routes/kline";
import { tickersRouter } from "./routes/ticker";
import { balancesRouter } from "./routes/balances"; 
import { dbRouter } from "./routes/dbqueries"

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/depth", depthRouter);
app.use("/api/v1/trades", tradesRouter);
app.use("/api/v1/klines", klineRouter);
app.use("/api/v1/tickers", tickersRouter);
app.use("/api/v1/balances", balancesRouter);
app.use("/api/v1/db", dbRouter)
app.get("/",(req,res)=>{
    console.log("welcome from API server")
res.send("hello from server")
})



app.listen(3000, () => {
    console.log("Server is running on port 3000");
});