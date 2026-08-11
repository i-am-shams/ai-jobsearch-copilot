import * as signalR from '@microsoft/signalr';

// Same pattern as api/client.ts — VITE_HUB_URL=/hubs/match (relative) in production.
const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:5220/hubs/match';

export function createConnection(token: string) {
  return new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL, {
      accessTokenFactory: () => token,
    })
    .withAutomaticReconnect()
    .build();
}
