const http = require('http');
const express = require('express');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(__dirname + '/public'));

// API echo
app.post('/echo', (req, res) => {
  console.log('Received:', req.body);
  io.emit('new_request', req.body);
  res.json({ received: req.body });
});

// WebSocket підключення
io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

