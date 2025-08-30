import express from "express";
import { report, reportByHours, reportFromStart } from "../controllers/ktController.js";

const router = express.Router();

router.post("/report", report);
router.post("/report-from-start", reportFromStart);
router.post("/reportByHours", reportByHours);

export default router;
