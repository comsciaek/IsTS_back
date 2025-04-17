import express from 'express';
import Notification from '../model/Notification.js';
import { protect } from '../auth/middleware.js';
import mongoose from 'mongoose';

const router = express.Router();

// Route สำหรับดึงการแจ้งเตือนที่ยังไม่ได้อ่าน
router.get('/unread', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({
      userId: userId,
      isRead: false,
    }).sort({ createdAt: -1 });

    const notificationsResponse = notifications.map(notification => ({
      id: notification._id,
      userId: notification.userId,
      issueId: notification.issueId,
      message: notification.message,
      oldStatus: notification.oldStatus,
      newStatus: notification.newStatus,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    }));

    return res.status(200).json({
      message: 'Unread notifications retrieved successfully',
      data: notificationsResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับดึงการแจ้งเตือนทั้งหมด (อ่านแล้วและยังไม่ได้อ่าน)
router.get('/all/', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(100); // จำกัดจำนวนเพื่อป้องกันการดึงข้อมูลมากเกินไป

    const notificationsResponse = notifications.map(notification => ({
      id: notification._id,
      userId: notification.userId,
      issueId: notification.issueId,
      message: notification.message,
      oldStatus: notification.oldStatus,
      newStatus: notification.newStatus,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    }));

    return res.status(200).json({
      message: 'All notifications retrieved successfully',
      data: notificationsResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับทำเครื่องหมายว่าอ่านการแจ้งเตือน
router.put('/:id/mark-read', protect, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.userId.toString() !== userId) {
      return res.status(403).json({ message: 'You are not authorized to mark this notification as read' });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({
      message: 'Notification marked as read successfully',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// Route สำหรับทำเครื่องหมายว่าอ่านทั้งหมด
router.put('/mark-all-read', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      message: 'All notifications marked as read successfully',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

router.post('/test', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const notification = new Notification({
      userId,
      issueId: '67d3c84f2d6cbcd83b1216ba',
      message: 'Test notification',
      isRead: false,
      createdAt: new Date(),
    });
    await notification.save();
    return res.status(200).json({ message: 'Test notification created', notification });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating test notification', error: error.message });
  }
});

// ดึงการแจ้งเตือนของผู้ใช้
router.get('/:userId', protect, async (req, res) => {
  try {
    const userId = req.params.userId;
    const notifications = await Notification.find({ userId })
      .populate('issueId', 'topic')
      .sort({ createdAt: -1 });
    res.status(200).json({
      message: 'Notifications retrieved successfully',
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});


router.put('/read/:notificationId', protect, async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to mark this notification as read' });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({
      message: 'Notification marked as read successfully',
      data: notification,
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// Mark การแจ้งเตือนทั้งหมดของผู้ใช้เป็น "อ่านแล้ว"
router.put('/readAll/:userId', protect, async (req, res) => {
  try {
    const userId = req.params.userId;

    // ตรวจสอบว่า userId ถูกต้อง
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // ตรวจสอบว่าเป็นผู้ใช้คนนั้นเองหรือไม่
    if (userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to mark notifications as read' });
    }

    // อัปเดตการแจ้งเตือนทั้งหมดของผู้ใช้ที่มี isRead: false
    const result = await Notification.updateMany(
      { userId, isRead: false }, // หาการแจ้งเตือนที่ยังไม่ได้อ่าน
      { $set: { isRead: true } } // อัปเดตให้ isRead เป็น true
    );

    // ดึงการแจ้งเตือนทั้งหมดหลังจากอัปเดต (เพื่อส่งกลับไปให้ Frontend)
    const updatedNotifications = await Notification.find({ userId })
      .populate('issueId', 'topic')
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: 'All notifications marked as read successfully',
      modifiedCount: result.modifiedCount, // จำนวนการแจ้งเตือนที่ถูกอัปเดต
      data: updatedNotifications,
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// ลบการแจ้งเตือน
router.delete('/delete/:notificationId', protect, async (req, res) => {
  try {
    const notificationId = req.params.notificationId;

    // ตรวจสอบว่า notificationId ถูกต้อง
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    // ค้นหาการแจ้งเตือน
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // ตรวจสอบว่าเป็นเจ้าของการแจ้งเตือนหรือไม่
    if (notification.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to delete this notification' });
    }

    // ลบการแจ้งเตือน
    await Notification.findByIdAndDelete(notificationId);

    // ส่ง event ผ่าน Socket.IO เพื่อแจ้ง Frontend
    req.app.locals.io.to(req.user.id).emit('notificationDeleted', {
      notificationId,
      message: 'Notification has been deleted',
    });

    res.status(200).json({
      message: 'Notification deleted successfully',
      notificationId,
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// ลบการแจ้งเตือนทั้งหมดตาม userId
router.delete('/deleteAll/:userId', protect, async (req, res) => {
  try {
    const userId = req.params.userId;

    // ตรวจสอบว่า userId ถูกต้อง
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // ตรวจสอบว่าเป็นผู้ใช้คนนั้นเองหรือไม่
    if (userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to delete notifications' });
    }

    // ลบการแจ้งเตือนทั้งหมดของผู้ใช้
    const result = await Notification.deleteMany({ userId });

    // ส่ง event ผ่าน Socket.IO เพื่อแจ้ง Frontend
    req.app.locals.io.to(userId).emit('allNotificationsDeleted', {
      userId,
      message: 'All notifications have been deleted',
    });

    res.status(200).json({
      message: 'All notifications deleted successfully',
      deletedCount: result.deletedCount, // จำนวนการแจ้งเตือนที่ถูกลบ
    });
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

export default router;