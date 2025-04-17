import express from 'express';
import User from '../model/User.js';
import { protect, authorizeAdminOrSuperAdmin } from '../auth/middleware.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// ตั้งค่าโฟลเดอร์สำหรับเก็บไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/profile';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.id}_${uniqueSuffix}${ext}`); // ชื่อไฟล์: user_<userId>_<timestamp>_<random>.<ext>
  },
});

const upload = multer({ storage: storage });

// ตรวจสอบว่าโฟลเดอร์ uploads ถูกสร้าง (ถ้ายังไม่มี)
const uploadDir = './uploads/profile';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Route สำหรับดึงข้อมูลผู้ใช้ปัจจุบัน (ต้องล็อกอินก่อน)
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      department: user.department,
      position: user.position,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profileImage: user.profileImage,
      role: user.role,
      createdAt: user.createdAt,
      rating: user.rating,
    };



    return res.status(200).json({
      message: 'User profile retrieved successfully',
      data: userResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      department: user.department,
      position: user.position,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profileImage: user.profileImage,
      role: user.role,
      createdAt: user.createdAt,
      rating: user.rating,
    };


    return res.status(200).json({
      message: 'User profile retrieved successfully',
      data: userResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับดึงข้อมูลและอัปเดตโปรไฟล์ผู้ใช้ตาม userId (ต้องล็อกอินก่อน)
router.put('/profile/:id', protect, (req, res, next) => {

  // ตรวจสอบว่าเป็น JSON หรือ multipart/form-data
  if (req.is('multipart/form-data')) {
    upload.single('image')(req, res, next); // อัปโหลดไฟล์ก่อน
  } else {
    next(); // ดำเนินการต่อกับข้อมูล JSON
  }
}, async (req, res) => {
 
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    // ตรวจสอบว่าเป็นผู้ใช้เองหรือมีสิทธิ์ SuperAdmin/Admin
    if (targetUserId !== currentUserId && req.user.role !== 'SuperAdmin' && req.user.role !== 'Admin') {
      return res.status(403).json({
        message: 'You are not authorized to update this profile',
      });
    }

    // หาผู้ใช้จาก userId
    const user = await User.findById(targetUserId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let updatedData = {};
    let imageUrl = user.profileImage; // เก็บค่าเดิมไว้ก่อน

    // กรณีอัปโหลดไฟล์รูปภาพ (multipart/form-data)
    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ message: 'Only image files are allowed' });
      }

      // ลบไฟล์เก่าจากโฟลเดอร์ ./uploads ถ้ามี
      if (user.profileImage) {
        const oldFileName = user.profileImage.split('/').pop(); // ดึงชื่อไฟล์เก่าจาก URL
        const oldFilePath = path.join(uploadDir, oldFileName);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath); // ลบไฟล์เก่า
        }
      }

      const newLocal = imageUrl = `${process.env.API_BASE_URL}/uploads/profile/${req.file.filename}`;
      updatedData.profileImage = imageUrl;
    }

    // กรณีอัปเดตข้อมูลโปรไฟล์ (JSON)
    const { firstName, lastName, phoneNumber, profileImage } = req.body;
    if (firstName || lastName || phoneNumber || profileImage) {
      if (!firstName && !lastName && !phoneNumber && !profileImage) {
        return res.status(400).json({
          message: 'At least one field (firstName, lastName, phoneNumber, or profileImage) is required',
        });
      }

      if (firstName && (firstName.length > 50 || !firstName.trim())) {
        return res.status(400).json({ message: 'Invalid first name' });
      }
      if (lastName && (lastName.length > 50 || !lastName.trim())) {
        return res.status(400).json({ message: 'Invalid last name' });
      }
      if (phoneNumber && !/^\d{9,}$/.test(phoneNumber.trim())) {
        return res.status(400).json({ message: 'Invalid phone number (at least 9 digits)' });
      }
      if (profileImage && !/^https?:\/\/.+/.test(profileImage)) {
        return res.status(400).json({ message: 'Invalid profile image URL' });
      }

      updatedData = {
        ...updatedData,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        phoneNumber: phoneNumber || user.phoneNumber,
        profileImage: profileImage || imageUrl, // ใช้ profileImage จาก body ถ้ามี หรือใช้ imageUrl จากการอัปโหลด
      };
    } else if (!req.file) {
      return res.status(400).json({
        message: 'No updates provided (neither profile data nor image)',
      });
    }

    // อัปเดตข้อมูลใน MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      updatedData,
      { new: true, runValidators: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userResponse = {
      id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      employeeId: updatedUser.employeeId,
      department: updatedUser.department,
      position: updatedUser.position,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      profileImage: updatedUser.profileImage,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt,
    };

    return res.status(200).json({
      message: 'User profile updated successfully',
      data: userResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับดึงข้อมูลผู้ใช้ทั้งหมด (เฉพาะ SuperAdmin)
router.get('/all', protect, authorizeAdminOrSuperAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    if (!users.length) {
      return res.status(404).json({ message: 'No users found' });
    }

    const usersResponse = users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      department: user.department,
      position: user.position,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
      status: user.status,
      inactiveAt: user.inactiveAt,
    }));

    return res.status(200).json({
      message: 'Users retrieved successfully',
      data: usersResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับเปลี่ยนบทบาทของผู้ใช้ (เฉพาะ SuperAdmin)
router.put('/:id/role', protect, authorizeAdminOrSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'SuperAdmin') {
      return res.status(403).json({ message: 'Cannot update the role of a SuperAdmin' });
    }

    const { role } = req.body;
    if (!['SuperAdmin', 'Admin', 'User'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Role must be SuperAdmin, Admin, or User' });
    }

    user.role = role;
    await user.save();

    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      department: user.department,
      position: user.position,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
    };

    return res.status(200).json({
      message: 'User role updated successfully',
      data: userResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับลบผู้ใช้ (เฉพาะ SuperAdmin)
router.delete('/:id', protect, authorizeAdminOrSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // หาผู้ใช้เพื่อตรวจสอบก่อนลบ
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ตรวจสอบว่า SuperAdmin ไม่สามารถลบตัวเองหรือ SuperAdmin อื่นได้
    if (user.role === 'SuperAdmin') {
      return res.status(403).json({ message: 'Cannot delete a SuperAdmin' });
    }

    // ลบผู้ใช้จาก MongoDB
    await User.findByIdAndDelete(userId);

    // ลบไฟล์รูปภาพที่เกี่ยวข้อง (ถ้ามี) จากโฟลเดอร์ ./uploads
    if (user.profileImage) {
      const fileName = user.profileImage.split('/').pop(); // ดึงชื่อไฟล์จาก URL (เช่น user_67bc147c3fac5c530cbc79_1740647610878-24811409.jpg)
      const filePath = path.join(uploadDir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // ลบไฟล์จากโฟลเดอร์
      }
    }

    return res.status(200).json({
      message: 'User deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับทำเครื่องหมายผู้ใช้เป็น inactive (เฉพาะ SuperAdmin)
router.put('/resign/:userId', protect, authorizeAdminOrSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // ตรวจสอบว่า userId ถูกต้อง
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // ตรวจสอบว่าส่ง status มาหรือไม่ และเป็นค่าที่ถูกต้อง
    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either "active" or "inactive"' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ตรวจสอบว่าสถานะที่ต้องการเปลี่ยนเหมือนกับสถานะปัจจุบันหรือไม่
    if (user.status === status) {
      return res.status(400).json({
        message: `User is already ${status}`,
      });
    }

    // เปลี่ยนสถานะและจัดการ inactiveAt
    user.status = status;
    if (status === 'inactive') {
      user.inactiveAt = new Date();
    } else if (status === 'active') {
      user.inactiveAt = null; // ลบค่า inactiveAt เมื่อเปลี่ยนกลับเป็น active
    }

    await user.save();

    return res.status(200).json({
      message: `User ${user.firstName} ${user.lastName} status has been updated to ${status}`,
      data: {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        inactiveAt: user.inactiveAt,
      },
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

export default router;