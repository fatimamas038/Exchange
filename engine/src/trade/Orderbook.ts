import { BASE_CURRENCY } from "./Engine";

export interface Order {
    price: number;
    quantity: number;
    originalQuantity: number;
    orderId: string;
    side: "buy" | "sell";
    userId: string;
}

export interface Fill {
    price: string;
    qty: number;
    tradeId: number;
    otherUserId: string;
    markerOrderId: string;
    isBuyerMaker: boolean
}

export class Orderbook {
    bids: Order[];
    asks: Order[];
    baseAsset: string;
    quoteAsset: string = BASE_CURRENCY;
    lastTradeId: number;
    currentPrice: number;

    constructor(baseAsset: string, bids: Order[], asks: Order[], lastTradeId: number, currentPrice: number) {
        this.bids = bids;
        this.asks = asks;
        this.baseAsset = baseAsset;
        this.lastTradeId = lastTradeId || 0;
        this.currentPrice = currentPrice ||0;

    }

    ticker() {
        return `${this.baseAsset}_${this.quoteAsset}`;
    }

    getSnapshot() {
        return {
            baseAsset: this.baseAsset,
            bids: this.bids,
            asks: this.asks,
            lastTradeId: this.lastTradeId,
            currentPrice: this.currentPrice
        }
    }

    //TODO: Add self trade prevention
    addOrder(order: Order): {
        executedQty: number,
        fills: Fill[]
    } {
        if (order.side === "buy") {
            const {executedQty, fills} = this.matchBid(order); 
            if (executedQty === order.quantity) {
                return {
                    executedQty,
                    fills
                }
            }
            order.quantity = order.quantity - executedQty;
            this.bids.push(order);
            return {
                executedQty,
                fills
            }
        } else {
            const {executedQty, fills} = this.matchAsk(order);
            if (executedQty === order.quantity) {
                return {
                    executedQty,
                    fills
                }
            }
            order.quantity = order.quantity - executedQty;
            this.asks.push(order);
            return {
                executedQty,
                fills
            }
        }
    }

    matchBid(order: Order): {fills: Fill[], executedQty: number} {
        const fills: Fill[] = [];
        let executedQty = 0;
//first sort the array asks and bids by price
        this.asks.sort((a, b) => a.price - b.price);
        for (let i = 0; i < this.asks.length && executedQty < order.quantity; i++) {
            if (this.asks[i].price <= order.price) {
                const filledQty = Math.min(order.quantity - executedQty, this.asks[i].quantity);
                executedQty += filledQty;
                // decrement resting order quantity immediately
                this.asks[i].quantity -= filledQty;
                fills.push({
                    price: this.asks[i].price.toString(),
                    qty: filledQty,
                    tradeId: this.lastTradeId++,
                    otherUserId: this.asks[i].userId,
                    markerOrderId: this.asks[i].orderId,
                    isBuyerMaker: false

                });
                // remove resting order if fully executed
                if (this.asks[i].quantity === 0) {
                    this.asks.splice(i, 1);
                    i--;
                }
            }
        }
        return {
            fills,
            executedQty
        };
    }

    matchAsk(order: Order): {fills: Fill[], executedQty: number} {
        const fills: Fill[] = [];
        let executedQty = 0;
        this.bids.sort((a, b) => b.price - a.price);
        console.log("Matching ask order: ", this.bids);
        for (let i = 0; i < this.bids.length && executedQty < order.quantity; i++) {
            if (this.bids[i].price >= order.price) {
                const amountRemaining = Math.min(order.quantity - executedQty, this.bids[i].quantity);
                executedQty += amountRemaining;
                // decrement resting order quantity immediately
                this.bids[i].quantity -= amountRemaining;
                fills.push({
                    price: this.bids[i].price.toString(),
                    qty: amountRemaining,
                    tradeId: this.lastTradeId++,
                    otherUserId: this.bids[i].userId,
                    markerOrderId: this.bids[i].orderId,
                    isBuyerMaker: true
                });
                // remove resting order if fully executed
                if (this.bids[i].quantity === 0) {
                    this.bids.splice(i, 1);
                    i--;
                }
            }
        }
        return {
            fills,
            executedQty
        };
    }

    //TODO: Can you make this faster? Can you compute this during order matches?
    getDepth() {
        const bids: [string, string][] = [];
        const asks: [string, string][] = [];

        const bidsObj: {[key: string]: number} = {};
        const asksObj: {[key: string]: number} = {};

        for (let i = 0; i < this.bids.length; i++) {
            const order = this.bids[i];
            if (!bidsObj[order.price]) {
                bidsObj[order.price] = 0;
            }
            bidsObj[order.price] += order.quantity;
        }

        for (let i = 0; i < this.asks.length; i++) {
            const order = this.asks[i];
            if (!asksObj[order.price]) {
                asksObj[order.price] = 0;
            }
            asksObj[order.price] += order.quantity;
        }

        for (const price in bidsObj) {
            bids.push([price, bidsObj[price].toString()]);
        }

        for (const price in asksObj) {
            asks.push([price, asksObj[price].toString()]);
        }
asks.sort((a, b) => Number(b[0]) - Number(a[0]));
bids.sort((a, b) => Number(b[0]) - Number(a[0]));  
        return {
            asks,
            bids
        };
    }

    getOpenOrders(userId: string): Order[] {
        const asks = this.asks.filter(x => x.userId === userId);
        const bids = this.bids.filter(x => x.userId === userId);
        return [...asks, ...bids];
    }

    cancelBid(order: Order) {
        const index = this.bids.findIndex(x => x.orderId === order.orderId);
        if (index !== -1) {
            const price = this.bids[index].price;
            this.bids.splice(index, 1);
            return price
        }
    }

    cancelAsk(order: Order) {
        const index = this.asks.findIndex(x => x.orderId === order.orderId);
        if (index !== -1) {
            const price = this.asks[index].price;
            this.asks.splice(index, 1);
            return price
        }
    }

}
