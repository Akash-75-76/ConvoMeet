import express from "express";
import { addToHistory, getUserHistory, login, register } from "../controllers/user.controller.js";

const router = express.Router();

router.route("/login").post(login);
router.route("/register").post(register);

// You should also add handlers for these routes
router.route("/add_to_activity").post(addToHistory);

router.route("/get_all_activity").get(getUserHistory);
export default router;
