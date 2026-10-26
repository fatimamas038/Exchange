import fs from "fs";
import { RedisManager } from "../RedisManager";
import { ORDER_UPDATE, TRADE_ADDED } from "../types/index";
import { CANCEL_ORDER, CREATE_ORDER, GET_DEPTH, GET_OPEN_ORDERS, MessageFromApi, ON_RAMP, GET_BALANCES,TICKER_INFO } from "../types/fromApi";
import { Fill, Order, Orderbook } from "./Orderbook";
import { log } from "console";



export const BASE_CURRENCY = "INR";
const VALID_MARKETS = new Set([
    "TATA_INR",
    "BTC_INR",
    "ETH_INR",
    "SOL_INR"
]);
 
export interface UserBalance {
    [key: string]: {
        available: number;
        locked: number;
    }
}

export class Engine {
    private orderbooks: Orderbook[] = [];
    
    private balances: Map<string, UserBalance> = new Map();

    constructor() {
        let snapshot = null
        console.log("engine initialised");
        
        try {
            if (process.env.WITH_SNAPSHOT) {
                
                snapshot = fs.readFileSync("./snapshot.json");
                console.log("in engine class");
                console.log(JSON.parse(snapshot.toString()))
                console.log("snapshot balances", JSON.parse(snapshot.toString()).balances);
            }
        } catch (e) {
            console.log("No snapshot found");
        }

        if (snapshot) {
            const snapshotSnapshot = JSON.parse(snapshot.toString());

            // console.log("snapshotSnapshot: ", snapshotSnapshot);
            this.orderbooks = snapshotSnapshot.orderbooks.map((o: any) => new Orderbook(o.baseAsset, o.bids, o.asks, o.lastTradeId, o.currentPrice));
            // console.log("orderbooks:\n", JSON.stringify(this.orderbooks, null, 2));

            this.balances = new Map(snapshotSnapshot.balances);
            console.log("balances:\n", JSON.stringify(Array.from(this.balances.entries()), null, 2));
        } else {
            this.orderbooks = [new Orderbook(`TATA`, [], [], 0, 0)];
            this.setBaseBalances();
        }
        setInterval(() => {
            console.log("Saving snapshot...");  
            this.saveSnapshot();
           // console.log("Snapshot saved.\n", JSON.parse(fs.readFileSync("./snapshot.json").toString()));
        }, 1000 * 3);
     }

    saveSnapshot() {
        console.log("writing to snapshot", this.balances.entries());
        
        const snapshotSnapshot = {
            orderbooks: this.orderbooks.map(o => o.getSnapshot()),
            balances: Array.from(this.balances.entries())
        }

        fs.writeFileSync("./snapshot.json", JSON.stringify(snapshotSnapshot));
    }

    private normalizeMarket(market: string) {
        return market.replace(/-/g, "_");
    }

    process({ message, clientId }: { message: MessageFromApi, clientId: string }) {
        switch (message.type) {
            case CREATE_ORDER:
                console.log("Processing create order message: ", message);
                try {
                    const { executedQty, fills, orderId } = this.createOrder(message.data.market, message.data.price, message.data.quantity, message.data.side, message.data.userId);
                   console.log("Order placed:", { executedQty, fills, orderId });   
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_PLACED",
                        payload: {
                            orderId,
                            executedQty,
                            fills
                        }
                    });
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred";
                    console.log(e);
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "ERROR",
                        payload: errorMessage
                        
                    });
                }
                break;
      case TICKER_INFO:
                    try {
                     const market=message.data.market
                     let orderbook = this.orderbooks.find(o => o.ticker() === market);
                let depth=orderbook?.getDepth()
                console.log("from engine", depth);
                let bestBid=depth?.bids.at(0)?.[0]
                let bestAsk=depth?.asks.at(-1)?.[0]
                RedisManager.getInstance().sendToApi(clientId, {  
                type: "TICKER_INFO",   
                payload: {
                   bestBid,
                   bestAsk
                }   as any   
            });    
                    } catch (error) {
                     console.log(error);
                        
                    }
                    break;          
             case GET_BALANCES:
    try {
        const userId = message.data.userId; 
        const userBalance = this.balances.get(String(userId));

        if (userBalance) {
            RedisManager.getInstance().sendToApi(clientId, {  
                type: "GET_BALANCES",   
                payload: {
                    balances: userBalance // Wrap it here to match your interface!
                }      
            });
        } else {
            console.log("No balances found for user ", userId);
            // Optional: If the API expects an explicit undefined payload when empty
            RedisManager.getInstance().sendToApi(clientId, {  
                type: "ERROR",   
                payload: "No balances found for user " + userId
            });
        }
    } catch (e) {
        console.log(e);
    }
    break;
                case CANCEL_ORDER:
                try {
                    const orderId = message.data.orderId;
                    const cancelMarket = this.normalizeMarket(message.data.market);
                    const cancelOrderbook = this.orderbooks.find(o => o.ticker() === cancelMarket);
                    const quoteAsset = cancelMarket.split("_")[1];
                    if (!cancelOrderbook) {
                        throw new Error("No orderbook found");
                    }

                    const order = cancelOrderbook.asks.find(o => o.orderId === orderId) || cancelOrderbook.bids.find(o => o.orderId === orderId);
                    if (!order) {
                        console.log("No order found");
                        throw new Error("No order found");
                    }

                    if (order.side === "buy") {
                        console.log("Cancelling buy order", order.orderId);
                        const price = cancelOrderbook.cancelBid(order)
                        const leftQuantity = order.quantity * order.price;
                        //@ts-ignore
                        this.balances.get(String(order.userId))[BASE_CURRENCY].available += leftQuantity;
                        //@ts-ignore
                        this.balances.get(String(order.userId))[BASE_CURRENCY].locked -= leftQuantity;
                        if (price) {
                            this.sendUpdatedDepthAt(price.toString(), cancelMarket);
                        }
                    } else {
                        console.log("Cancelling sell order", order.orderId);
                        const price = cancelOrderbook.cancelAsk(order)
                        const leftQuantity = order.quantity;
                        //@ts-ignore
                        this.balances.get(String(order.userId))[quoteAsset].available += leftQuantity;
                        //@ts-ignore
                        this.balances.get(String(order.userId))[quoteAsset].locked -= leftQuantity;
                        if (price) {
                            this.sendUpdatedDepthAt(price.toString(), cancelMarket);
                        }
                    }

                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_CANCELLED",
                        payload: {
                            orderId,
                            executedQty: order.originalQuantity - order.quantity,
                            remainingQty: order.quantity
                        }
                    });

                } catch (e) {
                    console.log("Error hwile cancelling order",);
                    console.log(e);
                }
                break;
            case GET_OPEN_ORDERS:
                try {
                    const market = this.normalizeMarket(message.data.market);
                    const openOrderbook = this.orderbooks.find(o => o.ticker() === market)
                    if (!openOrderbook) {
                        RedisManager.getInstance().sendToApi(clientId, {
                            type: "ERROR",
                            payload: "No orderbook found for market " + market
                        });
                        break;


                    }
                    const openOrders = openOrderbook.getOpenOrders(message.data.userId);
                    if (openOrders.length === 0) {
                        RedisManager.getInstance().sendToApi(clientId, {
                            type: "ERROR",
                            payload: "No open orders found for user " + message.data.userId + " in market " + market
                        });

                    }else{
   RedisManager.getInstance().sendToApi(clientId, {
                        type: "OPEN_ORDERS",
                        payload: openOrders
                    });
                    }
                
                 
                } catch (e) {
                    console.log(e);
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "OPEN_ORDERS",
                        payload: []
                    });
                }
                break;
            case ON_RAMP:
                const userId = message.data.userId;
                const amount = Number(message.data.amount);
                this.onRamp(userId, amount);
                RedisManager.getInstance().sendToApi(clientId, {    
                    type: "ON_RAMP",
                    payload: this.balances.get(String(userId)) 
                });
                break;
           
            case GET_DEPTH:
                try {
                    const market = this.normalizeMarket(message.data.market);
                    this.validateMarket(market)
                    const orderbook = this.orderbooks.find(o => o.ticker() === market);
                    if (!orderbook) {
                        throw new Error("No orderbook found");
                    }
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "DEPTH",
                        payload: orderbook.getDepth()
                    });
                } catch (e) {
                    console.log(e);
                     const errorMessage = e instanceof Error ? e.message : "An unknown error occurred";
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "ERROR",
                        payload: errorMessage
                        
                    });
                }
                break;
        }
    }

    addOrderbook(orderbook: Orderbook) {
        this.orderbooks.push(orderbook);
    }
private getOrCreateOrderbook(market: string) {
    const normalized = this.normalizeMarket(market);

    let orderbook = this.orderbooks.find(o => o.ticker() === normalized);

    if (!orderbook) {
        orderbook = new Orderbook(
            normalized.split("_")[0],
            [],
            [],
            0,
            0
        );

        this.orderbooks.push(orderbook);
    }

    return orderbook;
}
   
private validateMarket(market: string) {
    const normalized = market

    if (!VALID_MARKETS.has(normalized)) {
        throw new Error(`Invalid market: ${normalized}. Supported markets: ${Array.from(VALID_MARKETS).join(", ")}`);
    }

    return normalized;
}

createOrder(market: string, price: string, quantity: string, side: "buy" | "sell", userId: string) {
        market = this.normalizeMarket(market);
        this.validateMarket(market)

        // const orderbook = this.orderbooks.find(o => o.ticker() === market)
        const orderbook=this.getOrCreateOrderbook(market)
        const baseAsset = market.split("_")[0];
        const quoteAsset = market.split("_")[1];

        if (!orderbook) {
            throw new Error("No orderbook found");
        }
// console.log(`Creating order for user ${userId} in market ${market}`);
// console.log(`bids: orderbook.bids: ${JSON.stringify(orderbook.bids)} `);
//check if user actually exist if not initialize there balances
   if(this.balances.get(String(userId)) === undefined) {
            this.balances.set(String(userId), {
                [baseAsset]: { available: 0, locked: 0 }
            }); 
        }
        //@ts-ignore
        console.log("checking base asset initialization while order creation", this.balances.get(String(userId))[baseAsset]);
        console.log(this.balances.get(String(userId)));
        console.log(baseAsset);
        console.log(quoteAsset);
        
        
        
        //@ts-ignore
    if(!this.balances.get(String(userId))[baseAsset]) {
            this.balances.set(userId, {
                [baseAsset]: { available: 0, locked: 0 }
            }); 
        }
         
        this.checkAndLockFunds(baseAsset, quoteAsset, side, String(userId), quoteAsset, price, quantity);

        const originalQuantity = Number(quantity);
        const order: Order = {
            price: Number(price),
            quantity: originalQuantity,
            originalQuantity: originalQuantity,
            orderId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            side,
            userId
        }
console.log("adding order:"  , order);

        const { fills, executedQty } = orderbook.addOrder(order);

        this.updateBalance(userId, baseAsset, quoteAsset, side, fills, executedQty);

        this.createDbTrades(fills, market, userId, side);

        //changes are pending so that it accounts for partial fills as well(suggested by copilot)
        this.updateDbOrders(order, executedQty, fills, market, originalQuantity);
        this.publisWsDepthUpdates(fills, price, side, market);
        this.publishWsTrades(fills, userId, market);
        console.log("orderbook after createOrder: ", orderbook);
        return { executedQty, fills, orderId: order.orderId };
    }

    updateDbOrders(order: Order, executedQty: number, fills: Fill[], market: string, originalQuantity: number) {
        RedisManager.getInstance().pushMessage({
            type: ORDER_UPDATE,
            data: {
                orderId: order.orderId,
                executedQty: executedQty,
                market: market,
                price: order.price.toString(),
                quantity: originalQuantity.toString(),
                side: order.side,
            }
        });

        fills.forEach(fill => {
            RedisManager.getInstance().pushMessage({
                type: ORDER_UPDATE,
                data: {
                    orderId: fill.markerOrderId,
                    executedQty: fill.qty
                }
            });
        });
    }

    createDbTrades(fills: Fill[], market: string, userId: string, side: "buy" | "sell") {
        fills.forEach(fill => {
            RedisManager.getInstance().pushMessage({
                type: TRADE_ADDED,
                data: {
                    market: market,
                    id: fill.tradeId.toString(),
                 isBuyerMaker: fill.isBuyerMaker,
                    price: fill.price,
                    quantity: fill.qty.toString(),
                    quoteQuantity: (fill.qty * Number(fill.price)).toString(),
                    timestamp: Date.now()
                }
            });
        });
    }
//how in ws a publish request is made: SubscriptionManager's redisCallbackHandler gets triggered on a new message in the subscribed channel, and it publishes the message to all users subscribed to that channel. So we just need to publish to the right channel here in Engine and the SubscriptionManager will take care of the rest.
    publishWsTrades(fills: Fill[], userId: string, market: string) {
        fills.forEach(fill => {
            RedisManager.getInstance().publishMessage(`trade@${market}`, {
                stream: `trade@${market}`,
                data: {
                    e: "trade",
                    t: fill.tradeId,
                    m: fill.isBuyerMaker,
                    p: fill.price,
                    q: fill.qty.toString(),
                    s: market,
                }
            });
        });
    }

//     sendUpdatedDepthAt(price: string, market: string) {
//         const orderbook = this.orderbooks.find(o => o.ticker() === market);
//         if (!orderbook) {
//             return;
//         }
//       const depth = orderbook.getDepth();
//         const updatedBids = depth?.bids.filter(x => x[0] === price);
//         const updatedAsks = depth?.asks.filter(x => x[0] === price);
// console.log("checking market depth updates at price ", price, " for market ", market);
//         RedisManager.getInstance().publishMessage(`depth@${market}`, {
//             stream: `depth@${market}`,
//             data: {
//                 a: updatedAsks.length ? updatedAsks : [[price, "0"]],
//                 b: updatedBids.length ? updatedBids : [[price, "0"]],
//                 e: "depth"
//             }
//         });
//     }


// publisWsDepthUpdates(fills: Fill[], price: string, side: "buy" | "sell", market: string) {
//         const orderbook = this.orderbooks.find(o => o.ticker() === market);
//         if (!orderbook) {
//             return;
//         }
//         const depth = orderbook.getDepth();
//         if (side === "buy") {
//             const updatedAsks = depth?.asks.filter(x => fills.map(f => f.price).includes(x[0].toString()));
//             const updatedBid = depth?.bids.find(x => x[0] === price);
//             console.log("publish ws depth updates")
//             RedisManager.getInstance().publishMessage(`depth@${market}`, {
//                 stream: `depth@${market}`,
//                 data: {
//                     a: updatedAsks,
//                     b: updatedBid ? [updatedBid] : [],
//                     e: "depth"
//                 }
//             });
//         }
//         if (side === "sell") {
//             const updatedBids = depth?.bids.filter(x => fills.map(f => f.price).includes(x[0].toString()));
//             const updatedAsk = depth?.asks.find(x => x[0] === price);
//             console.log("publish ws depth updates")
//             RedisManager.getInstance().publishMessage(`depth@${market}`, {
//                 stream: `depth@${market}`,
//                 data: {
//                     a: updatedAsk ? [updatedAsk] : [],
//                     b: updatedBids,
//                     e: "depth"
//                 }
//             });
//         }
//     }


sendUpdatedDepthAt(price: string, market: string) {
    const orderbook = this.orderbooks.find(o => o.ticker() === market);

    if (!orderbook) return;

    const depth = orderbook.getDepth();

    const bidLevel = depth.bids.find(x => x[0] === price);
    const askLevel = depth.asks.find(x => x[0] === price);

    const data: any = {
        e: "depth",
        a: [],
        b: []
    };

    if (askLevel) {
        data.a = [[askLevel[0], askLevel[1]]];
    } else {
        data.a = [[price, "0"]];
    }

    if (bidLevel) {
        data.b = [[bidLevel[0], bidLevel[1]]];
    } else {
        data.b = [[price, "0"]];
    }

    RedisManager.getInstance().publishMessage(`depth@${market}`, {
        stream: `depth@${market}`,
        data
    });
}

publisWsDepthUpdates(
    fills: Fill[],
    price: string,
    side: "buy" | "sell",
    market: string
){
    const orderbook = this.orderbooks.find(
        o => o.ticker() === market
    );

    if (!orderbook) {
        return;
    }

    const depth = orderbook.getDepth();

    const affectedPrices = new Set<string>();

    affectedPrices.add(price.toString());
console.log("affected prices", affectedPrices)
    fills.forEach(fill => {
        affectedPrices.add(fill.price.toString());
    });

    const asks: [string, string][] = [];
    const bids: [string, string][] = [];

    affectedPrices.forEach(priceLevel => {
        const askLevel = depth.asks.find(
            x => x[0].toString() === priceLevel
        );
        console.log(depth.asks);
        
console.log("asklevel at price",priceLevel, askLevel);

        const bidLevel = depth.bids.find(
            x => x[0].toString() === priceLevel
        );

        asks.push(
            askLevel
                ? [askLevel[0].toString(), askLevel[1].toString()]
                : [priceLevel, "0"]
        );

        bids.push(
            bidLevel
                ? [bidLevel[0].toString(), bidLevel[1].toString()]
                : [priceLevel, "0"]
        );
    });

    RedisManager.getInstance().publishMessage(
        `depth@${market}`,
        {
            stream: `depth@${market}`,
            data: {
                a: asks,
                b: bids,
                e: "depth"
            }
        }
    );
}

    updateBalance(userId: string, baseAsset: string, quoteAsset: string, side: "buy" | "sell", fills: Fill[], executedQty: number) {
       fills.forEach((fill)=>{
 if(this.balances.get(fill.otherUserId) === undefined) {
            this.balances.set(String(fill.otherUserId), {
                [baseAsset]: { available: 0, locked: 0 },
                [quoteAsset]: { available: 0, locked: 0 }
            }); 
        }
     })
        if (side === "buy") {
            fills.forEach(fill => {
                // Update quote asset balance
                
                //@ts-ignore
                this.balances.get(fill.otherUserId)[quoteAsset].available = this.balances.get(fill.otherUserId)?.[quoteAsset].available + (fill.qty * fill.price);

                //@ts-ignore
                this.balances.get(String(userId))[quoteAsset].locked = this.balances.get(String(userId))?.[quoteAsset].locked - (fill.qty * fill.price);
            

                // Update base asset balance

                //@ts-ignore
                this.balances.get(fill.otherUserId)[baseAsset].locked = this.balances.get(fill.otherUserId)?.[baseAsset].locked - fill.qty;
console.log("balances after updating other user: ", this.balances);
if (this.balances.get(String(userId)) === undefined) {
        this.balances.set(String(userId), {
            [baseAsset]: { available: 0, locked: 0 }
        });
    }
        //@ts-ignore
    console.log("for error debugging", this.balances.get(String(userId))[baseAsset]);
    //@ts-ignore
          if(!this.balances.get(String(userId))[baseAsset]){
            //@ts-ignore
            this.balances.get(String(userId))[baseAsset]=  { available: 0, locked: 0 }
          }
    //@ts-ignore
                this.balances.get(String(userId))[baseAsset].available = this.balances.get(String(userId))?.[baseAsset].available + fill.qty;

            });

        } else {
            fills.forEach(fill => {
                // Update quote asset balance
                //@ts-ignore
                this.balances.get(fill.otherUserId)[quoteAsset].locked = this.balances.get(fill.otherUserId)?.[quoteAsset].locked - (fill.qty * fill.price);

                //@ts-ignore
                this.balances.get(String(userId))[quoteAsset].available = this.balances.get(String(userId))?.[quoteAsset].available + (fill.qty * fill.price);

                // Update base asset balance
       
                //@ts-ignore
                this.balances.get(fill.otherUserId)[baseAsset].available = this.balances.get(fill.otherUserId)?.[baseAsset].available + fill.qty;

                //@ts-ignore
                this.balances.get(String(userId))[baseAsset].locked = this.balances.get(String(userId))?.[baseAsset].locked - (fill.qty);

            });
        }
    }

    checkAndLockFunds(baseAsset: string, quoteAsset: string, side: "buy" | "sell", userId: string, asset: string, price: string, quantity: string) {
        // console.log("balances", this.balances, "\n", this.balances.get("5")); 

        if (side === "buy") {
console.log("in check and lock funds");

            console.log(`Checking funds for user ${userId} for market ${quoteAsset}`);
            console.log(`Available funds for user ${userId}: ${this.balances.get(String(userId))?.[quoteAsset]?.available}`);
            if ((this.balances.get(String(userId))?.[quoteAsset]?.available || 0) < Number(quantity) * Number(price)) {
                throw new Error("Insufficient funds");
            }
            //@ts-ignore
            this.balances.get(String(userId))[quoteAsset].available = this.balances.get(String(userId))?.[quoteAsset].available - (Number(quantity) * Number(price));

            //@ts-ignore
            this.balances.get(String(userId))[quoteAsset].locked = this.balances.get(String(userId))?.[quoteAsset].locked + (Number(quantity) * Number(price));
        } else {
            if ((this.balances.get(String(userId))?.[baseAsset]?.available || 0) < Number(quantity)) {
                throw new Error("Insufficient funds");
            }
            //@ts-ignore
            this.balances.get(String(userId))[baseAsset].available = this.balances.get(String(userId))?.[baseAsset].available - (Number(quantity));

            //@ts-ignore
            this.balances.get(String(userId))[baseAsset].locked = this.balances.get(String(userId))?.[baseAsset].locked + Number(quantity);
        }
    }

//     onRamp(userId: string, amount: number) {

//         const userBalance = this.balances.get(String(userId));
//         console.log("fromon ramp1", userBalance);
        
//         if (!userBalance) {
//             this.balances.set(userId, {
//                 [BASE_CURRENCY]: {
//                     available: amount,
//                     locked: 0
//                 }
            
//             });
//         }
            
//     const existing = this.balances.get(userId)
//          let availableBaseCurrency=userBalance?.[BASE_CURRENCY];
        
//     if(!availableBaseCurrency){
//   this.balances.set(userId, {
//     ...existing,
//                 [BASE_CURRENCY]: {
//                     available: amount,
//                     locked: 0
//                 }})
//             console.log("from onramp2", this.balances.get(userId));
            
//     }else{
//         //@ts-ignore
//        this.balances.get(userId)[BASE_CURRENCY].available+=amount 
//        console.log("from on ramp3", this.balances.get(userId));
       
//     }
//     }

onRamp(userId: string, amount: number) {
    const id = String(userId);

    // 1. get or initialize user
    let userBalance = this.balances.get(id);

    if (!userBalance) {
        userBalance = {};
        this.balances.set(id, userBalance);
    }

    console.log("before onramp", structuredClone(userBalance));

    // 2. get or initialize base currency
    if (!userBalance[BASE_CURRENCY]) {
        userBalance[BASE_CURRENCY] = {
            available: 0,
            locked: 0
        };
    }

    // 3. update safely
    userBalance[BASE_CURRENCY].available += amount;

    console.log("after onramp", structuredClone(userBalance));
}
   

    setBaseBalances() {
        this.balances.set("1", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0
            },
            "TATA": {
                available: 10000000,
                locked: 0
            }
        });

        this.balances.set("2", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0
            },
            "TATA": {
                available: 10000000,
                locked: 0
            }
        });

        this.balances.set("5", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0
            },
            "TATA": {
                available: 10000000,
                locked: 0
            }
        });
    }

}

/* EXplanation for updateDbOrders   (but it is nowhere consumed only trades are)
When a new order partially fills one or more resting orders:

Messages sent to DB
New order update with:

orderId = new order's ID
executedQty = amount filled from new order
all order details (price, quantity, side)
Resting order update (for each order hit):

orderId = resting order's ID
executedQty = amount that resting order was filled
Example scenario
New buy order A arrives for 10 @ 100:

Matches resting sell order X (5 @ 100)
Matches resting sell order Y (3 @ 100)
Remainder 2 sits on book
Messages sent:
ORDER_UPDATE: { orderId: A, executedQty: 8, quantity: 10, ... }
ORDER_UPDATE: { orderId: X, executedQty: 5 }
ORDER_UPDATE: { orderId: Y, executedQty: 3 }
*/






