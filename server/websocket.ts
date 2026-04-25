/**
 * WebSocket Server — Real-time Chat & Notifications
 * Provides WebSocket connections for live chat updates and system notifications.
 * Falls back to SSE for environments without WebSocket support.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./services/logger";
import { verifyToken } from "./auth";

interface ClientConnection {
  ws: WebSocket;
  userId?: number;
  dealershipId?: number;
  role?: string;
  channels: Set<string>;
  isAlive: boolean;
}

const clients = new Map<WebSocket, ClientConnection>();

export function initializeWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    const token = url.searchParams.get("token");

    let userId: number | undefined;
    let dealershipId: number | undefined;
    let role: string | undefined;

    if (token) {
      try {
        const payload = verifyToken(token);
        userId = payload.userId;
        dealershipId = payload.dealershipId;
        role = payload.role;
      } catch {
        ws.close(1008, "Invalid token");
        return;
      }
    }

    const client: ClientConnection = {
      ws,
      userId,
      dealershipId,
      role,
      channels: new Set(),
      isAlive: true,
    };

    clients.set(ws, client);
    logger.info("WebSocket client connected", { userId, dealershipId, role });

    // Subscribe to default channels
    if (dealershipId) {
      client.channels.add(`dealership:${dealershipId}`);
    }
    if (userId) {
      client.channels.add(`user:${userId}`);
    }

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(client, message);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      }
    });

    ws.on("pong", () => {
      client.isAlive = true;
    });

    ws.on("close", () => {
      clients.delete(ws);
      logger.info("WebSocket client disconnected", { userId, dealershipId });
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: "connected",
      channels: Array.from(client.channels),
      userId,
      dealershipId,
    }));
  });

  // Heartbeat — ping clients every 30s, disconnect unresponsive after 60s
  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.isAlive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      client.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  return wss;
}

function handleClientMessage(client: ClientConnection, message: any): void {
  switch (message.type) {
    case "subscribe":
      if (message.channel) {
        // Validate channel access
        if (message.channel.startsWith("dealership:") && client.dealershipId) {
          const requestedId = parseInt(message.channel.split(":")[1]);
          if (requestedId === client.dealershipId || client.role === "super_admin") {
            client.channels.add(message.channel);
            client.ws.send(JSON.stringify({ type: "subscribed", channel: message.channel }));
          }
        } else if (message.channel.startsWith("user:") && client.userId) {
          const requestedId = parseInt(message.channel.split(":")[1]);
          if (requestedId === client.userId || client.role === "super_admin") {
            client.channels.add(message.channel);
            client.ws.send(JSON.stringify({ type: "subscribed", channel: message.channel }));
          }
        }
      }
      break;

    case "unsubscribe":
      if (message.channel) {
        client.channels.delete(message.channel);
        client.ws.send(JSON.stringify({ type: "unsubscribed", channel: message.channel }));
      }
      break;

    case "ping":
      client.ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      break;
  }
}

/**
 * Broadcast a message to all clients subscribed to a channel.
 */
export function broadcast(channel: string, payload: any): void {
  const message = JSON.stringify({ type: "broadcast", channel, payload });
  for (const [ws, client] of clients) {
    if (client.channels.has(channel) && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Send a message to a specific user.
 */
export function sendToUser(userId: number, payload: any): void {
  const channel = `user:${userId}`;
  broadcast(channel, payload);
}

/**
 * Send a message to all users of a dealership.
 */
export function sendToDealership(dealershipId: number, payload: any): void {
  const channel = `dealership:${dealershipId}`;
  broadcast(channel, payload);
}
