import mongoose from 'mongoose';

const { Schema } = mongoose;

const DomainSchema = new Schema({
  domains: Array,
  activeDomains: Array,
});

export default mongoose.model('Domains', DomainSchema);
