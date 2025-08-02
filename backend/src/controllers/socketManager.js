import { Server } from "socket.io";

export const ConnectToSocket=(server)=>{
    const io=new Server(server);
    return io;
}