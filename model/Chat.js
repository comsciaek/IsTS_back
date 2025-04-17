// models/Chat.js
import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  issueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    trim: true,
    default: '', // ทำเป็น optional เพื่อรองรับกรณีส่งแค่ไฟล์
  },
  file: {
    type: String,
    default: '', 
  },
  readBy: [
    { type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      default: [] }
    ],
  createdAt: {
    type: Date,
    default: Date.now,
  },

});

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;