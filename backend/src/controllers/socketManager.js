import { Server } from "socket.io";

let connections = {};
let messages = {};
let timeOnLine = {};

export const ConnectToSocket = (server) => {
  const io = new Server(server);

  io.on("connection", (socket) => {
    socket.on("join-call", (path) => {
      if(connections[path]===undefined){
        connections[path] = [];
      }
        connections[path].push(socket.id);
  timeOnLine[socket.id] = Date.now();

  for (let a = 0; a < connections[path].length; a++) {
    io.to(connections[path][a]).emit(
      "chat-message",
      messages[path][a]?.["data"],
      messages[path][a]?.["sender"],
      messages[path][a]?.["socket-id-sender"]
    );
  }
});

    socket.on("signal",(toId,messsage)=>{
        io.to(toId).emit("signal",socket.id,message);
    })

    socket.on("chat-message",(data,sender)=>{

    })

    socket.on("disconnect", () => {
      // Your logic here
    });
  });

  return io;
};
