import mongoose from 'mongoose';

const { Schema } = mongoose;

const BalanserSchema = new Schema({
  ip: String,
});

export default mongoose.model('Balanser', BalanserSchema);
