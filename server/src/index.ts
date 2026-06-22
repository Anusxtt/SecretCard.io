import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './rooms/RoomManager';
import { registerLobbyHandlers } from './socket/lobbyHandlers';
import { registerSomSipHandlers } from './socket/somSipHandlers';
import { registerKhangHandlers } from './socket/khangHandlers';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const roomManager = new RoomManager();

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  registerLobbyHandlers(io, socket, roomManager);
  registerSomSipHandlers(io, socket, roomManager);
  registerKhangHandlers(io, socket, roomManager);

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
    roomManager.handleDisconnect(socket.id, io);
  });
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
