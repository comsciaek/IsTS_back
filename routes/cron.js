import express from 'express';
import mongoose from 'mongoose';
import { promises as fsPromises } from 'fs';
import path from 'path';
import User from '../model/User.js';
import Report from '../model/Report.js';
import Notification from '../model/Notification.js';
import Chat from '../model/Chat.js';

// Middleware สำหรับตรวจสอบสิทธิ์ (ตัวอย่าง)
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }
  // ตัวอย่าง: ตรวจสอบ token (ในโปรเจคจริงควรใช้ JWT หรือวิธีอื่น)
  const token = authHeader.split(' ')[1];
  if (token !== 'your-secret-token') { // แทนที่ด้วยการตรวจสอบจริง
    return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึง' });
  }
  next();
};

const router = express.Router();

// ฟังก์ชันสำหรับลบผู้ใช้ที่ไม่ active
const deleteInactiveUsers = async () => {
  console.log('กำลังรันงานเพื่อลบผู้ใช้ที่ไม่ active...');
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const inactiveUsers = await User.find({
      status: 'inactive',
      inactiveAt: { $lte: ninetyDaysAgo },
    });

    for (const user of inactiveUsers) {
      const userId = user._id;
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        // ลบไฟล์โปรไฟล์ (ถ้ามี)
        if (user.profileImage) {
          const fileName = user.profileImage.split('/').pop();
          const filePath = path.join(path.resolve(), 'uploads', 'profiles', fileName);
          try {
            if (await fsPromises.stat(filePath).then(() => true).catch(() => false)) {
              await fsPromises.unlink(filePath);
              console.log(`ลบไฟล์โปรไฟล์ของผู้ใช้ ${userId} แล้ว: ${filePath}`);
            }
          } catch (fileError) {
            console.error(`เกิดข้อผิดพลาดขณะลบไฟล์โปรไฟล์ของผู้ใช้ ${userId}:`, fileError.stack);
          }
        }

        // ลบไฟล์ในแชท (ถ้ามี)
        const chats = await Chat.find({ senderId: userId });
        for (const chat of chats) {
          if (chat.file) {
            const fileName = chat.file.split('/').pop();
            const filePath = path.join(path.resolve(), 'uploads', 'chat', fileName);
            try {
              if (await fsPromises.stat(filePath).then(() => true).catch(() => false)) {
                await fsPromises.unlink(filePath);
                console.log(`ลบไฟล์แชทของผู้ใช้ ${userId} แล้ว: ${filePath}`);
              }
            } catch (fileError) {
              console.error(`เกิดข้อผิดพลาดขณะลบไฟล์แชทของผู้ใช้ ${userId}:`, fileError.stack);
            }
          }
        }

        // ลบข้อมูลที่เกี่ยวข้อง
        await Report.deleteMany({ userId }, { session });
        await Notification.deleteMany({ userId }, { session });
        await Chat.deleteMany({ senderId: userId }, { session });
        await User.deleteOne({ _id: userId }, { session });

        await session.commitTransaction();
        console.log(`ลบผู้ใช้ที่ไม่ active แล้ว: ${user.firstName} ${user.lastName} (${userId})`);
      } catch (error) {
        await session.abortTransaction();
        console.error(`เกิดข้อผิดพลาดขณะลบผู้ใช้ที่ไม่ active ${userId}:`, error.stack);
        throw error;
      } finally {
        session.endSession();
      }
    }

    return { 
      message: `งานเสร็จสิ้น ลบผู้ใช้ที่ไม่ active ไป ${inactiveUsers.length} คน`,
      deletedCount: inactiveUsers.length // เพิ่มข้อมูลจำนวนที่ถูกลบ
    };
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในงาน:', error.stack);
    throw error;
  }
};

// Endpoint สำหรับทดสอบผ่าน Postman (เพิ่ม middleware protect)
router.get('/test-delete-inactive-users', protect, async (req, res) => {
  try {
    const result = await deleteInactiveUsers();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาดขณะรันงานลบผู้ใช้ที่ไม่ active', error: error.message });
  }
});

// ตัวอย่าง API สำหรับ cron job
router.get('/test-cron', (req, res) => {
  res.status(200).json({ message: 'Cron route is working!' });
});

export default router; // เปลี่ยนเป็น export default