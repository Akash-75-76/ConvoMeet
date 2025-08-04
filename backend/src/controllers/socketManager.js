import { Server } from "socket.io";

let connections = {};
let messages = {};
let timeOnLine = {};

export const ConnectToSocket = (server) => {
  const io = new Server(server.{
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["*"],
        credentials: true,
  });

  io.on("connection", (socket) => {
    
    socket.on("join-call", (path) => {
      if (connections[path] === undefined) {
        connections[path] = [];
        messages[path] = [];
      }

      connections[path].push(socket.id);
      timeOnLine[socket.id] = Date.now();

      for (let a = 0; a < connections[path].length; a++) {
        const msg = messages[path][a];
        if (msg) {
          io.to(connections[path][a]).emit(
            "chat-message",
            msg["data"],
            msg["sender"],
            msg["socket-id-sender"]
          );
        }
      }
    });

    socket.on("signal", (toId, message) => {
      io.to(toId).emit("signal", socket.id, message);
    });

    socket.on("chat-message", (data, sender) => {
      const [matchingRoom, found] = Object.entries(connections).reduce(
        ([room, isFound], [roomKey, roomValue]) => {
          if (!isFound && roomValue.includes(socket.id)) {
            return [roomKey, true];
          }
          return [room, isFound];
        },
        ["", false]
      );

      if (found === true) {
        if (messages[matchingRoom] === undefined) {
          messages[matchingRoom] = [];
        }

        messages[matchingRoom].push({
          sender: sender,
          data: data,
          "socket-id-sender": socket.id,
        });

        connections[matchingRoom].forEach((elem) => {
          io.to(elem).emit("chat-message", data, sender, socket.id);
        });
      }
    });

    socket.on("disconnect", () => {
      const diffTime = Math.abs(timeOnLine[socket.id] - new Date());

      let key;

      for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
        for (let a = 0; a < v.length; ++a) {
          if (v[a] === socket.id) {
            key = k;

            for (let a = 0; a < connections[key].length; ++a) {
              io.to(connections[key][a]).emit("user-left", socket.id);
            }

            const index = connections[key].indexOf(socket.id);
            connections[key].splice(index, 1);

            if (connections[key].length === 0) {
              delete connections[key];
              delete messages[key];
            }

            delete timeOnLine[socket.id];
            break;
          }
        }
      }
    });
  });

  return io;
};
