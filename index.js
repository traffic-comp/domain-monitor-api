import express from "express";
import domainRoutes from "./routes/domainRoutes.js";
import cloudflareRoutes from "./routes/cloudflareRoutes.js";
import balanserRoutes from "./routes/balanserRoutes.js";
import proxyRoutes from "./routes/proxyRoutes.js";
import checkRoutes from "./routes/checkRoutes.js";
import ktRoutes from "./routes/ktRoutes.js";
import cors from "cors";
import mongoose from "mongoose";
import { startCron } from "./corn/cornscripts.js";

const app = express();
const PORT = 3000;

startCron(); // Запуск крона

app.use(express.json());
app.use(cors());

app.use("/domain", domainRoutes);
app.use("/check", checkRoutes);
app.use("/cloudflare", cloudflareRoutes);
app.use("/balanser", balanserRoutes);
app.use("/proxy", proxyRoutes);
app.use("/kt", ktRoutes);

mongoose
  .connect(process.env.MOGO_URI, {})
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
