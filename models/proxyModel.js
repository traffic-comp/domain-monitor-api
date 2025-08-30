import mongoose from "mongoose";

const { Schema } = mongoose;

const ProxySchema = new Schema({
  proxyType: String,
  type: String, // http | socks5
  host: String,
  port: Number,
  user: String,
  pass: String,
});

export default mongoose.model("Proxy", ProxySchema);
