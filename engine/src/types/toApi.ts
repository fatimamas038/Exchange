import { Order } from "../trade/Orderbook";
import { UserBalance } from "../trade/Engine";
export const CREATE_ORDER = "CREATE_ORDER";
export const CANCEL_ORDER = "CANCEL_ORDER";
export const ON_RAMP = "ON_RAMP";
export const GET_BALANCES = "GET_BALANCES";
export const GET_DEPTH = "GET_DEPTH";
export const TICKER_INFO="TICKER_INFO"

export type MessageToApi = {
    type: "DEPTH",
    payload: {
        asks: [string, string][],
        bids: [string, string][],
    }
} | {
    type: "ORDER_PLACED",
    payload: {
        orderId: string,
        executedQty: number,
        fills: {
            price: string,
            qty: number,
            tradeId: number
        }[]
    }
} | {
    type: "ORDER_CANCELLED",
    payload: {
        orderId: string,
        executedQty: number,
        remainingQty: number
    }
} | {
    type: "OPEN_ORDERS",
    payload: Order[]
}| {
    type: "GET_BALANCES",
    payload:{ balances: UserBalance | undefined }
}|{
    type: "ERROR",
    payload: string
}|{
    type: "ON_RAMP",
    payload: UserBalance | undefined
}|{
    type: "TICKER_INFO",
    payload:{
        bestBid:Number,
        bestAsk:Number
    }
}


