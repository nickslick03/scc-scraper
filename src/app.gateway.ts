import { Injectable } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  
  @Injectable()
  @WebSocketGateway({
    cors: {
      origin: '*', // Adjust CORS settings if needed
    },
  })
  export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  
    // Store the connected clients and their Socket IDs
    private clients: Map<string, Socket> = new Map();
  
    @WebSocketServer()
    server: Server;
  
    handleConnection(client: Socket) {
      console.log(`Client connected: ${client.id}`);
      this.clients.set(client.id, client);
      client.emit('id', client.id);
    }
  
    handleDisconnect(client: Socket) {
      console.log(`Client disconnected: ${client.id}`);
      this.clients.delete(client.id);
    }
  
    emitEvent(clientId: string, event: string, message: string): void {
      const client = this.clients.get(clientId);
      if (client) {
        client.emit(event, message);
        console.log(`Message sent to client ${clientId}: ${message}`);
      } else {
        console.log(`Client with ID ${clientId} not found`);
      }
    }
  
    // Example: Listen for an event where a client can send a private message
    // @SubscribeMessage('sendPrivateMessage')
    // handlePrivateMessage(client: Socket, payload: { recipientId: string; message: string }) {
    //   const { recipientId, message } = payload;
    //   this.updateProgress(recipientId, message);
    // }
  }
  