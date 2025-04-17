import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Report from './Report.js'; // เพิ่มการ import Report model
import Chat from './Chat.js'; // เพิ่มการ import Chat model
import Notification from './Notification.js'; // เพิ่มการ import Notification model

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Please provide your first name'],
    trim: true,
    maxlength: [50, 'First name cannot be more than 50 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'Please provide your last name'],
    trim: true,
    maxlength: [50, 'Last name cannot be more than 50 characters'],
  },
  employeeId: {
    type: String,
    required: [true, 'Please provide your employee ID'],
    unique: true,
    trim: true,
  },
  department: {
    type: String,
    required: [true, 'Please provide your department'],
    trim: true,
    maxlength: [50, 'Department cannot be more than 50 characters'],
  },
  position: {
    type: String,
    required: [true, 'Please provide your position'],
    trim: true,
    maxlength: [50, 'Position cannot be more than 50 characters'],
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  confirmPassword: {
    type: String,
    validate: {
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords do not match',
    },
  },
  phoneNumber: {
    type: String,
    required: [true, 'Please provide your phone number'],
    trim: true,
  },
  role: {
    type: String,
    enum: ['SuperAdmin', 'Admin', 'User'],
    default: 'User',
  },
  profileImage: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['active', 'inactive'], // เพิ่มสถานะ active และ inactive
    default: 'active', // ค่าเริ่มต้นเป็น active
  },
  inactiveAt: {
    type: Date,
    default: null, // วันที่ลาออก (จะถูกตั้งค่าเมื่อ status เปลี่ยนเป็น inactive)
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lineUserId: { // เพิ่มฟิลด์ lineUserId
    type: String,
    unique: true,
    sparse: true, // อนุญาตให้ค่า null ได้
  },
});

// ลบ profileImage ซ้ำออก (ในโค้ดเดิมมี profileImage ซ้ำกัน 2 ครั้ง)

userSchema.pre('save', async function (next) {
  if (this.isModified('password') || this.isNew) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.confirmPassword = undefined;
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Hook สำหรับลบข้อมูลที่เกี่ยวข้องก่อนลบผู้ใช้
userSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    const userId = this._id;

    // ลบข้อมูลที่เกี่ยวข้อง
    await Report.deleteMany({ userId });
    await Notification.deleteMany({ userId });
    await Chat.deleteMany({ senderId: userId });

    next();
  } catch (error) {
    console.error(`Error in pre-deleteOne hook for user ${this._id}:`, error);
    next(error);
  }
});

const User = mongoose.model('User', userSchema);

export default User;