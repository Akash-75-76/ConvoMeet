// socketmanager.js
import { Server } from "socket.io";

let connections = {};   // { roomPath: [socketId, ...] }
let messages = {};      // chat history per room
let timeOnLine = {};    // connection timestamps

export const ConnectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["*"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("join-call", (path) => {
      if (!connections[path]) {
        connections[path] = [];
        messages[path] = [];
      }

      // existing peers currently in the room (before adding new one)
      const existing = [...connections[path]];

      // Tell the new socket who is already in the room
      if (existing.length > 0) {
        socket.emit("existing-peers", existing);
      } else {
        socket.emit("existing-peers", []);
      }

      // Notify existing peers that a new peer joined
      existing.forEach((clientId) => {
        io.to(clientId).emit("new-peer", socket.id);
      });

      // Add the new socket to the room list
      connections[path].push(socket.id);
      timeOnLine[socket.id] = Date.now();

      // Send chat history to the new user
      messages[path].forEach((msg) => {
        socket.emit("chat-message", msg.data, msg.sender, msg["socket-id-sender"]);
      });

      console.log(`Socket ${socket.id} joined room ${path}. Members now:`, connections[path]);
    });

    // Relay signaling (SDP/ICE) from A -> B
    socket.on("signal", (toId, message) => {
      io.to(toId).emit("signal", socket.id, message);
    });

    // Chat messages
    socket.on("chat-message", (data, sender) => {
      let matchingRoom = null;
      for (const [room, members] of Object.entries(connections)) {
        if (members.includes(socket.id)) {
          matchingRoom = room;
          break;
        }
      }

      if (matchingRoom) {
        const msgObj = { sender, data, "socket-id-sender": socket.id };
        messages[matchingRoom].push(msgObj);

        connections[matchingRoom].forEach((memberId) => {
          io.to(memberId).emit("chat-message", data, sender, socket.id);
        });
      }
    });

    socket.on("disconnect", () => {
      let foundRoom = null;
      for (const [room, members] of Object.entries(connections)) {
        if (members.includes(socket.id)) {
          foundRoom = room;
          break;
        }
      }

      if (foundRoom) {
        // notify remaining peers
        connections[foundRoom].forEach((id) => {
          if (id !== socket.id) {
            io.to(id).emit("user-left", socket.id);
          }
        });

        // remove from connections
        connections[foundRoom] = connections[foundRoom].filter((id) => id !== socket.id);

        if (connections[foundRoom].length === 0) {
          delete connections[foundRoom];
          delete messages[foundRoom];
        }
      }

      delete timeOnLine[socket.id];
      console.log("Socket disconnected:", socket.id);
    });
  });

  return io;
};
