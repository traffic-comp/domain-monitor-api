import mongoose from 'mongoose';

const { Schema } = mongoose;

const BalanserSchema = new Schema({
  balansers: Array,
  activeBalansers: Array,
});

export default mongoose.model('Domains', BalanserSchema);
