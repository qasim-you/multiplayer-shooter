const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');

app.use(cors());

const io = new Server(server, {
    cors: {
        origin: "*", // Allow connections from Vercel or any other frontend host
        methods: ["GET", "POST"]
    }
});
const path = require('path');
const { GameRoom } = require('./gameLogic');

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

const rooms = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', ({ username, roomId }) => {
        // Leave previous room if any
        if (socket.roomId) {
            const prevRoom = rooms[socket.roomId];
            if (prevRoom) {
                prevRoom.removePlayer(socket.id);
                socket.leave(socket.roomId);
            }
        }

        socket.join(roomId);
        socket.roomId = roomId;

        console.log(`${username} joining room ${roomId}`);

        if (!rooms[roomId]) {
            rooms[roomId] = new GameRoom(roomId, io);
            console.log(`Created new room: ${roomId}`);
        }

        rooms[roomId].addPlayer(socket.id, username);

        // Send init data to the player
        socket.emit('init', {
            id: socket.id,
            mapWidth: rooms[roomId].mapWidth,
            mapHeight: rooms[roomId].mapHeight
        });
    });

    socket.on('playerMove', (input) => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].handleInput(socket.id, input);
        }
    });

    socket.on('playerShoot', (angle) => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].handleShoot(socket.id, angle);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].removePlayer(socket.id);
            // Optional: clean up empty rooms
            if (Object.keys(rooms[socket.roomId].players).length === 0) {
                // rooms[socket.roomId].stop();
                // delete rooms[socket.roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 7860;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
