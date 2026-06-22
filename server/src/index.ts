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

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((s) => s.trim())
  : ['http://localhost:5173'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: allowedOrigins }));
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

// Keep-alive: ping ตัวเองทุก 14 นาที เพื่อป้องกัน Railway sleep
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  const selfUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`;
  setInterval(async () => {
    try {
      await fetch(selfUrl);
      console.log('[keep-alive] ping ok');
    } catch {
      // ignore
    }
  }, 14 * 60 * 1000);
}
