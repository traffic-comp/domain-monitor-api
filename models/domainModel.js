import mongoose from 'mongoose';

const { Schema } = mongoose;

const StabilitySchema = new Schema({
  proxyName: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  success: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  stats: { type: Number, default: 0 }, // процент успешных
});

const DomainItemSchema = new Schema({
  domain: { type: String, required: true },
  stability: { type: [StabilitySchema], default: [] },
});

const DomainsSchema = new Schema({
  domains: { type: [DomainItemSchema], default: [] },
  activeDomains: { type: [DomainItemSchema], default: [] },
});

export default mongoose.model('Domains', DomainsSchema);
