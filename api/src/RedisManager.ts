
import { RedisClientType, createClient } from "redis";
import { MessageFromOrderbook } from "./types";
import { MessageToEngine } from "./types/to";

export class RedisManager {
    private client: RedisClientType;
    private publisher: RedisClientType;
    private clientReady: Promise<void>;
    private publisherReady: Promise<void>;
    private static instance: RedisManager;

    private constructor() {
        this.client = createClient();
        this.client.on("error", (err) => console.error("Redis client error", err));
        this.clientReady = this.client.connect().then(() => {}).catch((err) => {
            console.error("Redis client connect error", err);
        });

        this.publisher = createClient();
        this.publisher.on("error", (err) => console.error("Redis publisher error", err));
        this.publisherReady = this.publisher.connect().then(() => {}).catch((err) => {
            console.error("Redis publisher connect error", err);
        });
    }

    public static getInstance() {
        if (!this.instance)  {
            this.instance = new RedisManager();
        }
        return this.instance;
    }

    public async sendAndAwait(message: MessageToEngine) {
        await Promise.all([this.clientReady, this.publisherReady]);

        return new Promise<MessageFromOrderbook>(async (resolve, reject) => {
            const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            console.log("Generated client ID: ", id);
            console.log("Subscribing to channel with message: ", message);

            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.client.unsubscribe(id).catch(() => {});
                reject(new Error("Timed out waiting for engine response"));
            }, 15000);

            try {
                await this.client.subscribe(id, (redisMessage) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    this.client.unsubscribe(id).catch(() => {});
                    try {
                        resolve(JSON.parse(redisMessage));
                    } catch (e) {
                        reject(e as Error);
                    }
                });
            } catch (err) {
                clearTimeout(timeout);
                reject(err as Error);
                return;
            }

            console.log("Publishing message: ", message);
            try {
                await this.publisher.lPush("messages", JSON.stringify({ clientId: id, message }));
            } catch (err) {
                clearTimeout(timeout);
                this.client.unsubscribe(id).catch(() => {});
                reject(err as Error);
            }
        });
    }
    public getRandomClientId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

}