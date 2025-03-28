const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json()); // Обробка JSON

// Ехо-ендпоінтconst express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json()); // Обробка JSON

// Ехо-ендпоінт
app.post('/echo', (req, res) => {
    console.log('📥 Received:', req.body);
    io.emit('new_request', req.body); // Відправка на WebSocket
    res.json({ received: req.body });
});

// Підключення WebSocket
io.on('connection', (socket) => {
    console.log('✅ Client connected');
    socket.on('disconnect', () => console.log('❌ Client disconnected'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

app.post('/echo', (req, res) => {
    console.log('📥 Received:', req.body);
    io.emit('new_request', req.body); // Відправка на WebSocket
    res.json({ received: req.body });
});

// Підключення WebSocket
io.on('connection', (socket) => {
    console.log('✅ Client connected');
    socket.on('disconnect', () => console.log('❌ Client disconnected'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

