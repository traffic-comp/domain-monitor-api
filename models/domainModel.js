import mongoose from "mongoose";
const { Schema } = mongoose;

// История каждой проверки
const CheckSchema = new Schema({
  date: { type: Date, default: Date.now },
  result: { type: String, enum: ["success", "failed"], required: true },
  statsAfter: { type: Number, default: 0 },
  diff: { type: Number, default: 0 },
});

// Статистика по конкретному прокси
const StabilitySchema = new Schema({
  proxyName: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  success: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  stats: { type: Number, default: 0 },
  checks: { type: [CheckSchema], default: [] },
});

// Основная модель домена
const DomainSchema = new Schema({
  domain: { type: String, required: true, unique: true },
  stability: { type: [StabilitySchema], default: [] },
});

export default mongoose.model("Domain", DomainSchema);
