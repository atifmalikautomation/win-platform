const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { verifyRound } = require('./provablyFair');
const CrashEngine = require('./crashEngine');
const { router: authRouter, authenticateToken, JWT_SECRET } = require('./routes/auth');
const cashierRouter = require('./routes/cashier');
const adminRouter = require('./routes/admin');
const { router: minesRouter } = require('./routes/mines');
const crashRouter = require('./routes/crash');

const app = express();
const server = http.createServer(app);

// Enable CORS for client development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize Crash Engine singleton
const crashEngine = new CrashEngine(io);
app.set('crashEngine', crashEngine);

// Public Provably Fair Verifier Endpoint
app.post('/api/verify', (req, res) => {
  try {
    const { serverSeed, clientSeed, nonce, houseEdge } = req.body;
    if (!serverSeed || !clientSeed || nonce === undefined) {
      return res.status(400).json({ error: 'serverSeed, clientSeed, and nonce are required' });
    }
    const result = verifyRound(serverSeed, clientSeed, Number(nonce), houseEdge ? Number(houseEdge) : 4);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mount modular REST routes
app.use('/api/auth', authRouter);
app.use('/api/cashier', cashierRouter);
app.use('/api/admin', adminRouter);
app.use('/api/mines', minesRouter);
app.use('/api/crash', crashRouter);

// Serve built frontend statically if available
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Fallback for SPA client routing
app.use((req, res) => {
  const indexPath = path.join(clientDistPath, 'index.html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send('LuckyWin API Server is running.');
    }
  });
});

// Socket.io real-time connection handler
io.on('connection', (socket) => {
  // Send current state to newly connected client
  socket.emit('crash:state_change', crashEngine.getState());

  // Allow client to request latest state anytime on mount or tab switch
  socket.on('crash:request_state', () => {
    socket.emit('crash:state_change', crashEngine.getState());
  });

  // Handle crash bet via socket
  socket.on('crash:bet', (data, callback) => {
    try {
      const { token, amount, autoCashout } = data;
      if (!token) throw new Error('Authentication required to place bets');

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.findUserById(decoded.id);
      if (!user || user.isBanned) throw new Error('Invalid user or account suspended');

      const result = crashEngine.placeBet(user.id, user.username, amount, autoCashout);
      if (callback) callback({ success: true, ...result });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Handle cashout via socket
  socket.on('crash:cashout', (data, callback) => {
    try {
      const { token, betId } = data;
      if (!token) throw new Error('Authentication required');

      const decoded = jwt.verify(token, JWT_SECRET);
      const result = crashEngine.cashout(decoded.id, betId);
      if (callback) callback({ success: true, ...result });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    // Client disconnected
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SKYWIN Gaming Platform running on http://localhost:${PORT}`);
  console.log(`🎮 Aviator X & Mines Ready!`);
  console.log(`=======================================================`);
});
