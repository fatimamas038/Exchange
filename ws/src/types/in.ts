
export const SUBSCRIBE = "SUBSCRIBE";
export const UNSUBSCRIBE = "UNSUBSCRIBE";
// This file contains the types for the incoming messages that the WebSocket server receives from clients.  
// example of incoming message:
// {
//   "method": "SUBSCRIBE",
//   "params": ["depth@TATA_INR"]
// }

// {
//   "method": "SUBSCRIBE",
//   "params": [
//     "trade@TATA_INR"
//   ]
// }
export type SubscribeMessage = {
    method: typeof SUBSCRIBE,
    params: string[]
}

export type UnsubscribeMessage = {
    method: typeof UNSUBSCRIBE,
    params: string[]
}

export type IncomingMessage = SubscribeMessage | UnsubscribeMessage;