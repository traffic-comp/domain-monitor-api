import mongoose from 'mongoose';

const { Schema } = mongoose;

const BalanserSchema = new Schema({
  /**
   * balansers &&  activeBalansers:{
   *  ip: string
   *  isUsage:boolean
   *  isUsed:boolean
   * }
   */
  balansers: Array,
  activeBalansers: Array,
});

export default mongoose.model('Balanser', BalanserSchema);
