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

// Add device mapping cache
const deviceImeiMap = new Map();

// Set password
const CORRECT_PASSWORD = '88888888';

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
    const { latitude, longitude, timestamp, username, track, device_id, imei, sos } = req.body;

    // Update device-IMEI mapping if IMEI is provided
    if (device_id && imei) {
      deviceImeiMap.set(device_id, imei);
    }

    // Get IMEI from cache if not provided in current request
    const cachedImei = device_id ? deviceImeiMap.get(device_id) : null;

    const runnerData = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      timestamp: timestamp || new Date().toISOString(),
      username: username || null,
      device_id: device_id || null,
      imei: imei || cachedImei || null, // Use cached IMEI if available
      track: track || null,
      sos: sos || false
    };

    const result = await db.collection('runners').insertOne(runnerData);
    console.log('Stored runner data:', runnerData);

    io.emit('new_runner', runnerData);

    res.json({
      success: true,
      id: result.insertedId,
      data: runnerData
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

// Authentication middleware
function checkAuth(req, res, next) {
    const isAuthenticated = req.headers['x-auth'] === process.env.APP_PASSWORD;
    if (!isAuthenticated) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Add to your existing endpoints
app.post('/verify-password', (req, res) => {
    const { password } = req.body;
    const correctPassword = process.env.APP_PASSWORD || 'your_password_here'; // Use environment variable

    if (password === correctPassword) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// Get all tracks
app.get('/tracks', checkAuth, async (req, res) => {
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
app.get('/track/:timestamp', checkAuth, async (req, res) => {
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

// Get all tracks with aggregated info
app.get('/admin/tracks', checkAuth, async (req, res) => {
    try {
        if (!isDbConnected) {
            return res.status(503).json({ error: 'Database not connected' });
        }

        const tracks = await db.collection('runners').aggregate([
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $eq: ["$track", null] },
                            then: "SOS Signals",
                            else: "$track"
                        }
                    },
                    count: { $sum: 1 },
                    lastUpdate: { $max: '$timestamp' },
                    users: { $addToSet: '$username' },
                    hasSOS: { $max: { $cond: [{ $eq: ["$sos", true] }, 1, 0] } },
                    // Add device info
                    devices: {
                        $addToSet: {
                            device_id: '$device_id',
                            imei: '$imei',
                            username: '$username'  // Add username to device info
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    count: 1,
                    lastUpdate: 1,
                    userCount: { $size: '$users' },
                    users: 1,
                    hasSOS: 1,
                    devices: {
                        $filter: {
                            input: '$devices',
                            as: 'device',
                            cond: { $ne: ['$$device.device_id', null] }
                        }
                    }
                }
            },
            { $sort: { lastUpdate: -1 } }
        ]).toArray();

        if (!tracks || tracks.length === 0) {
            return res.json([]);
        }

        res.json(tracks);
    } catch (error) {
        console.error('Error fetching tracks:', error);
        res.status(500).json({
            error: 'Failed to fetch tracks'
        });
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
app.put('/admin/track', checkAuth, async (req, res) => {
    const { oldValue, newValue } = req.body;

    if (!newValue || newValue.trim() === '') {
        return res.status(400).json({ message: 'Track name cannot be empty' });
    }

    try {
        const filter = { track: oldValue === 'null' ? null : oldValue };
        const update = { $set: { track: newValue } };

        const result = await db.collection('runners').updateMany(filter, update);

        if (result.modifiedCount > 0) {
            res.json({ message: 'Track renamed successfully' });
        } else {
            res.status(404).json({ message: 'Track not found' });
        }
    } catch (error) {
        console.error('Error renaming track:', error);
        res.status(500).json({ message: 'Failed to rename track' });
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
app.delete('/admin/track/:trackId', checkAuth, async (req, res) => {
    try {
        const trackId = req.params.trackId === 'null' ? null : req.params.trackId;

        const filter = trackId === null ?
            { $or: [{ track: null }, { sos: true }] } :
            { track: trackId };

        const result = await db.collection('runners').deleteMany(filter);

        if (result.deletedCount > 0) {
            io.emit('data_updated');
            res.json({
                message: 'Track deleted successfully',
                deletedCount: result.deletedCount
            });
        } else {
            res.status(404).json({ message: 'Track not found' });
        }
    } catch (error) {
        console.error('Error deleting track:', error);
        res.status(500).json({
            message: 'Failed to delete track',
            error: error.message
        });
    }
});

// Додати новий endpoint
app.post('/admin/clear-data', async (req, res) => {
    try {
        await db.collection('runners').deleteMany({});
        io.emit('data_updated');
        res.json({ success: true, message: 'All data cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear data' });
    }
});

app.post('/check-password', (req, res) => {
  const { password } = req.body;
  if (password === CORRECT_PASSWORD) {
      res.json({ authenticated: true });
  } else {
      res.status(401).json({ authenticated: false, message: 'Incorrect password' });
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

