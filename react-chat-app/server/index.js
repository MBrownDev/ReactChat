require('dotenv').config();
console.log(process.env.HARPERDB_URL);
const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const harperSaveMessage = require('./services/harper-save-message');
const harperGetMessages = require('./services/harper-get-messages');
const leaveRoom = require('./utils/leave-room');

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST']
    },
});

const CHAT_BOT = 'ChatBot';

let chatRoom = '';
let allUsers = []; 

//Listen for when client connects via socket.io-client
io.on('connection', (socket) => {
    console.log(`User connected ${socket.id}`);

    //Add a user to room
    socket.on('join_room', (data) => {
        const { username, room } = data; //data sent from client when join_room event emitted
        socket.join(room);

        let _createdtime_ = Date.now(); //Timestamp
        // Send message to all users in room
        socket.to(room).emit('receive_message', {
            message: `${username} has joined the room`,
            username: CHAT_BOT,
            _createdtime_,
        });

        socket.emit('receive_message', {
            message: `Welcome ${username}`,
            username: CHAT_BOT,
            _createdtime_,
        });

        chatRoom = room;
        allUsers.push({ id: socket.id, username, room });
        chatRoomUsers = allUsers.filter((user) => user.room === room);
        socket.to(room).emit('chatroom_users', chatRoomUsers);
        socket.emit('chatroom_users', chatRoomUsers);

        // Get last 100 messages sent in the chat
        harperGetMessages(room)
        .then((last100Messages) => {
            // console.log('latest messages', last100messages);
            socket.emit('last_100_messages', last100Messages); // emits event for front end to listen for
        })
        .catch((err) => console.log(err));
    });

    socket.on('send_message', (data) => {
        const { message, username, room, _createdtime_ } = data;
        io.in(room).emit('receive_message', data);//Send to all users including sender
        //Save message in db
        harperSaveMessage(message, username, room, _createdtime_)
            .then((response) => console.log(response))
            .catch((err) => console.log(err));
    });

    socket.on('leave_room', (data) => {
        const { username, room } = data;
        socket.leave(room);
        const _createdtime_ = Date.now();
        // Remove user from memory
        allUsers = leaveRoom(socket.id, allUsers);
        socket.to(room).emit('chatroom_users', allUsers);
        socket.to(room).emit('receive_message', {
            username: CHAT_BOT,
            message: `${username} has left the chat`,
            _createdtime_,
        });
        console.log(`${username} has left the chat`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected from the chat');
        const user = allUsers.find((user) => user.id == socket.id);
        if(user?.username) {
            allUsers = leaveRoom(socket.id, allUsers);
            socket.to(chatRoom).emit('chatroom_users', allUsers);
            socket.to(chatRoom).emit('receive_message', {
                message: `${user.username} has disconnected from the chat.`,
            });
        }
    });
});

app.get('/', (req, res) => {
    res.send('Hello World');
});

server.listen(4001, () => 'Server is running on Port 4000');