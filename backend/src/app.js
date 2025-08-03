import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv"
import { ConnectToSocket } from "./controllers/socketManager.js"
import userRoutes from "./routes/userRoutes.js"
dotenv.config();

const app = express();
const PORT = 8000;
const server=createServer(app);
const io=ConnectToSocket(server);
// 
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({limit:"40kb",extended:true}))
app.use("/api/v1/users",userRoutes);


const dbUrl=process.env.MONGO_URL;
async function main() {
  await mongoose.connect(dbUrl);
}

main()
  .then(() => {
    console.log("Connected to db");
  })
  .catch((err) => {
    console.log(err);
  });

app.get("/home", (req, res) => {
  res.send("Hello from Zoom Clone backend!");
});


server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
