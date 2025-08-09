import { Server } from "socket.io";

let connections = {};
let messages = {};
let timeOnLine = {};

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
    console.log("New socket connected:", socket.id);

    socket.on("join-call", (path) => {
      if (!connections[path]) {
        connections[path] = [];
        messages[path] = [];
      }

      connections[path].push(socket.id);
      timeOnLine[socket.id] = Date.now();

      console.log(`User ${socket.id} joined room ${path}`);

      // Send existing peers to the new user
      connections[path].forEach((clientId) => {
        if (clientId !== socket.id) {
          socket.emit("user-joined", clientId);
        }
      });

      // Tell existing peers about the new user
      connections[path].forEach((clientId) => {
        if (clientId !== socket.id) {
          io.to(clientId).emit("user-joined", socket.id);
        }
      });

      // Send chat history to the new user
      messages[path].forEach((msg) => {
        socket.emit("chat-message", msg.data, msg.sender, msg["socket-id-sender"]);
      });
    });

    socket.on("signal", (toId, message) => {
      io.to(toId).emit("signal", socket.id, message);
    });

    socket.on("chat-message", (data, sender) => {
      let matchingRoom = null;
      for (const [room, members] of Object.entries(connections)) {
        if (members.includes(socket.id)) {
          matchingRoom = room;
          break;
        }
      }

      if (matchingRoom) {
        messages[matchingRoom].push({
          sender,
          data,
          "socket-id-sender": socket.id,
        });

        connections[matchingRoom].forEach((memberId) => {
          io.to(memberId).emit("chat-message", data, sender, socket.id);
        });
      }
    });

    socket.on("disconnect", () => {
      let key;
      for (const [room, members] of Object.entries(connections)) {
        if (members.includes(socket.id)) {
          key = room;

          members.forEach((id) => {
            if (id !== socket.id) {
              io.to(id).emit("user-left", socket.id);
            }
          });

          connections[key] = members.filter((id) => id !== socket.id);

          if (connections[key].length === 0) {
            delete connections[key];
            delete messages[key];
          }

          delete timeOnLine[socket.id];
          break;
        }
      }
      console.log("Socket disconnected:", socket.id);
    });
  });

  return io;
};
