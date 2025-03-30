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

// Add connection state variable
let isDbConnected = false;

// Connect to MongoDB
MongoClient.connect(mongoUrl)
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db(dbName);
    isDbConnected = true;

    // Add connection monitoring
    client.on('close', () => {
      console.log('MongoDB connection closed');
      isDbConnected = false;
    });
    client.on('reconnect', () => {
      console.log('MongoDB reconnected');
      isDbConnected = true;
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    isDbConnected = false;
  });

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

// Add DB status endpoint
app.get('/db-status', (req, res) => {
  res.json({ connected: isDbConnected });
});

// Get all tracks
app.get('/tracks', async (req, res) => {
  if (!isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
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

// Add new admin endpoints

// Get all tracks with count
app.get('/admin/tracks', async (req, res) => {
    try {
        const tracks = await db.collection('runners').aggregate([
            {
                $group: {
                    _id: '$track',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } }
        ]).toArray();
        res.json(tracks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

// Get all unique users
app.get('/admin/users', async (req, res) => {
    try {
        const users = await db.collection('runners').distinct('username');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Update track
app.put('/admin/track', async (req, res) => {
    try {
        const { oldValue, newValue } = req.body;
        await db.collection('runners').updateMany(
            { track: oldValue },
            { $set: { track: newValue } }
        );
        io.emit('data_updated');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update track' });
    }
});

// Update user
app.put('/admin/user', async (req, res) => {
    try {
        const { oldValue, newValue } = req.body;
        await db.collection('runners').updateMany(
            { username: oldValue },
            { $set: { username: newValue } }
        );
        io.emit('data_updated');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete track
app.delete('/admin/track/:trackId', async (req, res) => {
    try {
        await db.collection('runners').deleteMany({ track: req.params.trackId });
        io.emit('data_updated');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete track' });
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

