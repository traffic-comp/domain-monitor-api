import mongoose from 'mongoose';

const { Schema } = mongoose;

const stabilityModel = new Schema({
  domains: String,
  isActive: {
    type: Boolean,
    default: false,
  },
  attempts: Number,
  failed: Number,
  success: Number,
});

export default mongoose.model('Stability', stabilityModel);
