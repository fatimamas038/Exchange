import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { GET_BALANCES } from "../types";
import { ON_RAMP } from "../types";

export const balancesRouter = Router();

// orderRouter.post("/", async (req, res) => {
//     const { market, price, quantity, side, userId } = req.body;
//     console.log({ market, price, quantity, side, userId })
//     //TODO: can u make the type of the response object right? Right now it is a union.
//     const response = await RedisManager.getInstance().sendAndAwait({
//         type: CREATE_ORDER,
//         data: {
//             market,
//             price,
//             quantity,
//             side,
//             userId
//         }
//     });
//     res.json(response.payload);
// });


balancesRouter.get("/", async (req, res) => { 
    console.log(req.query.userId);  
    const { userId } = req.query.userId ? { userId: req.query.userId as string } : { userId: "" };    
    console.log("userId", userId)
const response = await RedisManager.getInstance().sendAndAwait({   
    type: GET_BALANCES,
    data: {
        userId}   
        
 })
  res.json(response.payload);
})
balancesRouter.post("/", async (req, res) => {
    const { userId, amount } = req.body;
    console.log({ userId, amount });
    const response = await RedisManager.getInstance().sendAndAwait({
        type: "ON_RAMP",    
        data: {
            userId,
            amount
        }
    });
    res.json(response.payload);
}); 