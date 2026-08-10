import * as signalR from '@microsoft/signalr';

export function createConnection(token: string) {
  return new signalR.HubConnectionBuilder()
    .withUrl('http://localhost:5220/hubs/match', {
      accessTokenFactory: () => token,
    })
    .withAutomaticReconnect()
    .build();
}
