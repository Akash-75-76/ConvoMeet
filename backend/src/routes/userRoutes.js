import express from "express";
import { login, register } from "../controllers/user.controller.js";

const router = express.Router();

router.route("/login").post(login);
router.route("/register").post(register);

// You should also add handlers for these routes
router.route("/add_to_activity").post((req, res) => {
    // handle add_to_activity logic here
});

router.route("/get_all_activity").get((req, res) => {
    // handle get_all_activity logic here
});

export default router;
