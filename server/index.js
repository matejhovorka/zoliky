// Main Server: Express + Socket.IO for Czech Žolíky
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import { RoomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager(io);

// Find local IPv4 address for QR code and local network access (phones, tablets)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignore internal (127.0.0.1) and non-ipv4
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
const localIp = getLocalIpAddress();

app.use(express.json());

// API Info endpoint
app.get('/api/info', (req, res) => {
  let publicUrl = process.env.PUBLIC_URL || null;
  try {
    const pubFile = path.join(rootDir, 'public_url.txt');
    if (!publicUrl && fs.existsSync(pubFile)) {
      publicUrl = fs.readFileSync(pubFile, 'utf8').trim();
    }
  } catch (e) {}

  res.json({
    status: 'ok',
    port: PORT,
    localIp,
    localUrl: `http://${localIp}:${PORT}`,
    publicUrl
  });
});

// Check room existence
app.get('/api/room/:code', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ exists: false, error: 'Místnost neexistuje' });
  }
  res.json({
    exists: true,
    code: room.code,
    playerCount: room.players.length,
    status: room.status
  });
});

// Serve frontend build if dist exists
app.use(express.static(path.join(rootDir, 'dist')));

// Fallback to index.html for SPA routing
app.use((req, res) => {
  const distIndexPath = path.join(rootDir, 'dist', 'index.html');
  res.sendFile(distIndexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Žolíky Server</title></head>
          <body style="font-family:sans-serif; text-align:center; padding: 40px; background: #1a3322; color: #fff;">
            <h1>🃏 Žolíky Server běží!</h1>
            <p>Frontend se právě připravuje nebo staví...</p>
          </body>
        </html>
      `);
    }
  });
});

// WebSockets Handling
io.on('connection', (socket) => {
  // Join Room
  socket.on('room:join', ({ roomCode, playerName, playerId }, callback) => {
    const result = roomManager.joinRoom(roomCode, playerName, playerId);
    if (!result.success) {
      return callback?.(result);
    }

    const { room, player } = result;
    socket.data.playerId = player.id;
    socket.data.roomCode = room.code;
    socket.join(room.code);

    callback?.({
      success: true,
      playerId: player.id,
      player,
      room: roomManager.getSanitizedState(room, player.id)
    });

    roomManager.broadcastRoom(room);
  });

  // Create Room
  socket.on('room:create', ({ playerName, customCode }, callback) => {
    const { room, player } = roomManager.createRoom(playerName, customCode);
    socket.data.playerId = player.id;
    socket.data.roomCode = room.code;
    socket.join(room.code);

    callback?.({
      success: true,
      playerId: player.id,
      player,
      room: roomManager.getSanitizedState(room, player.id)
    });

    roomManager.broadcastRoom(room);
  });

  // Add Bot
  socket.on('room:addBot', (_, callback) => {
    const code = socket.data.roomCode;
    const result = roomManager.addBot(code);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Update Settings
  socket.on('room:settings', ({ settings }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.updateSettings(code, playerId, settings);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Start Game
  socket.on('room:start', (_, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.startGame(code, playerId);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Draw Card
  socket.on('game:draw', ({ source }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.drawCard(code, playerId, source);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true, drawnCard: result.drawnCard });
    roomManager.broadcastRoom(result.room);
  });

  // Return Discard Card & Draw from Talon
  socket.on('game:returnDiscard', (_, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.returnDiscardCard(code, playerId);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true, newCard: result.newCard });
    roomManager.broadcastRoom(result.room);
  });

  // Meld Cards
  socket.on('game:meld', ({ melds }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.meldCards(code, playerId, melds);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Lay Off Cards
  socket.on('game:layOff', ({ tableMeldId, cards }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.layOff(code, playerId, tableMeldId, cards);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Swap Joker
  socket.on('game:swapJoker', ({ tableMeldId, jokerId, handCardId }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.swapJoker(code, playerId, tableMeldId, jokerId, handCardId);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Discard Card
  socket.on('game:discard', ({ cardId }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.discardCard(code, playerId, cardId);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true, roundEnded: result.roundEnded || false });
    roomManager.broadcastRoom(result.room);
  });

  // Next Round
  socket.on('game:nextRound', (_, callback) => {
    const code = socket.data.roomCode;
    const room = roomManager.getRoom(code);
    if (!room) return callback?.({ success: false });

    const result = roomManager.startNewRound(room);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Kick Player
  socket.on('room:kickPlayer', ({ targetPlayerId }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.kickPlayer(code, playerId, targetPlayerId);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    for (const [id, s] of io.of("/").sockets) {
      if (s.data.roomCode === code && s.data.playerId === targetPlayerId) {
        s.emit('player:kicked', { reason: 'kicked', message: 'Byl(a) jste odebrán(a) hostitelem z místnosti.' });
        s.leave(code);
        s.data.roomCode = null;
      }
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Give Pesek (Pešek Button)
  socket.on('room:givePesek', ({ targetPlayerId }, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.givePesek(code, playerId, targetPlayerId);
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    for (const [id, s] of io.of("/").sockets) {
      if (s.data.roomCode === code && s.data.playerId === targetPlayerId) {
        s.emit('player:kicked', { reason: 'pesek', message: '🪵 Dostal(a) jste Peška od hostitele a byl(a) jste vyřazen(a) ze hry!' });
        s.leave(code);
        s.data.roomCode = null;
      }
    }
    callback?.({ success: true });
    roomManager.broadcastRoom(result.room);
  });

  // Leave Game (Active game or lobby)
  socket.on('room:leaveGame', (_, callback) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const result = roomManager.leaveGame(code, playerId);
    if (result.success) {
      socket.leave(code);
      socket.data.roomCode = null;
      callback?.({ success: true });
      if (result.room) {
        roomManager.broadcastRoom(result.room);
      }
    } else {
      callback?.({ success: false, error: result.error });
    }
  });

  // Send Chat Message
  socket.on('chat:send', ({ text }) => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const msg = roomManager.addChatMessage(code, playerId, text);
    if (msg) {
      io.to(code).emit('chat:received', msg);
    }
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (code && playerId) {
      const room = roomManager.getRoom(code);
      if (room) {
        const player = room.players.find(p => p.id === playerId);
        if (player) {
          player.connected = false;
          roomManager.broadcastRoom(room);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`🃏 ŽOLÍKY SERVER BĚŽÍ!`);
  console.log(`🌐 Lokální adresa: http://localhost:${PORT}`);
  console.log(`📱 Mobil / iPad (stejná Wi-Fi): http://${localIp}:${PORT}`);
  console.log(`===========================================`);
});
