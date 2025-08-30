import express from "express";
import { updateDNSRecord } from "../controllers/cloudflareController.js";

const router = express.Router();

router.post("/changeDNS", updateDNSRecord);

export default router;
