// This file contains the types for the outgoing messages that the WebSocket server sends to clients.
//example of outgoing message:  
// {     "type": "ticker",
//     "data": {
//         "c": "0.0025",   
//         "h": "0.0025",
//         "l": "0.0025",
//         "v": "100",
//         "V": "100",
//         "s": "BTCUSDT"
//     }
// }
// c in data implies current price, h is high price, l is low price, v is total traded base asset volume, V is total traded quote asset volume, s is symbol.
//in code this is used in the User class to send messages to clients, and in the SubscriptionManager class to send messages to clients subscribed to a channel.

export type TickerUpdateMessage = {
    type: "ticker",
    data: {
        c?: string,
        h?: string,
        l?: string,
        v?: string,
        V?: string,
        s?: string,
        id: number,
        e: "ticker"
    }
} 

export type DepthUpdateMessage = {
    type: "depth",
    data: {
        b?: [string, string][],
        a?: [string, string][],
        id: number,
        e: "depth"
    }
}

//example of depth update message:  
// {     "type": "depth",   
//     "data": {
//         "b": [ ["0.0024", "10"] ],   
//         "a": [ ["0.0026", "20"] ],
//         "id": 123,
//         "e": "depth"
//     }
// }
// b in data implies bid updates, a is ask updates, id is update id, e is event type.       

export type OutgoingMessage = TickerUpdateMessage | DepthUpdateMessage;