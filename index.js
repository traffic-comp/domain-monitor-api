import express from "express";
import domainRoutes from "./routes/domainRoutes.js";
import cloudflareRoutes from "./routes/cloudflareRoutes.js";
import balanserRoutes from "./routes/balanserRoutes.js";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

app.use("/domains", domainRoutes);
app.use("/cloudflare", cloudflareRoutes);
app.use("/balanser", balanserRoutes);


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
