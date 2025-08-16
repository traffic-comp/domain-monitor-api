import express from "express";
import { setDomain } from "../controllers/balanserController.js";

const router = express.Router();

router.post("/setDomain", setDomain);

export default router;
