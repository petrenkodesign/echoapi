const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB connection URL
const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'runners';
let db;

// Connect to MongoDB
MongoClient.connect(mongoUrl)
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db(dbName);
  })
  .catch(err => console.error('MongoDB connection error:', err));

app.use(express.json());
app.use(express.static(__dirname + '/public'));

// API echo
app.post('/echo', (req, res) => {
  console.log('Received:', req.body);
  io.emit('new_request', req.body);
  res.json({ received: req.body });
});

// New endpoint for storing runner data
app.post('/call', async (req, res) => {
  try {
    const result = await db.collection('runners').insertOne(req.body);
    console.log('Stored runner data:', req.body);
    io.emit('new_runner', req.body);
    res.json({
      success: true,
      id: result.insertedId,
      data: req.body
    });
  } catch (error) {
    console.error('Error storing data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store data'
    });
  }
});

// Get all tracks
app.get('/tracks', async (req, res) => {
  try {
    const tracks = await db.collection('runners').find({}).toArray();
    res.json(tracks);
  } catch (error) {
    console.error('Error fetching tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Get specific track
app.get('/track/:timestamp', async (req, res) => {
  try {
    const trackTime = req.params.timestamp;
    const points = await db.collection('runners')
      .find({
        $or: [
          { track: trackTime },
          { timestamp: new RegExp('^' + trackTime) }
        ]
      })
      .toArray();
    res.json(points);
  } catch (error) {
    console.error('Error fetching track:', error);
    res.status(500).json({ error: 'Failed to fetch track' });
  }
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

