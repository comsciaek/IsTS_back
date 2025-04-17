import mongoose from 'mongoose';
import Notification from '../model/Notification.js';
import Report from '../model/Report.js';

export const updateReportStatus = async ({ issueId, status, userId, role, io }) => {
  const session = await mongoose.startSession(); // เริ่มต้น transaction
  session.startTransaction();

  try {
    // ตรวจสอบว่า issueId และ status ถูกต้อง
    if (!mongoose.Types.ObjectId.isValid(issueId)) {
      throw new Error('Invalid issue ID');
    }

    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      throw new Error('Invalid status value');
    }

    // ดึงข้อมูลรายงาน
    const report = await Report.findById(issueId).session(session);
    if (!report) {
      throw new Error('Report not found');
    }

    const oldStatus = report.status;

    // ตรวจสอบสิทธิ์ของผู้ใช้
    if (role !== 'Admin' && role !== 'SuperAdmin') {
      throw new Error('Only Admin or SuperAdmin can update status');
    }

    // อัปเดตสถานะ
    report.status = status;
    await report.save({ session });

    const userIdOfReport = report.userId?.toString();
    const adminId = report.assignedAdmin?.toString();

    const topic = report.topic || `Report ${issueId}`;
    const notificationData = {
      issueId,
      oldStatus,
      newStatus: status,
      message: `Report ${topic} status updated to ${status}`,
      createdAt: new Date(),
    };

    // สร้างการแจ้งเตือนสำหรับผู้ใช้
    if (userIdOfReport) {
      const userNotification = new Notification({
        userId: new mongoose.Types.ObjectId(userIdOfReport),
        ...notificationData,
        isRead: false,
      });
      await userNotification.save({ session });

      io.to(userIdOfReport).emit('reportStatusUpdate', {
        id: userNotification._id,
        ...notificationData,
      });
    }

    // สร้างการแจ้งเตือนสำหรับแอดมิน
    if (adminId) {
      const adminNotification = new Notification({
        userId: new mongoose.Types.ObjectId(adminId),
        ...notificationData,
        message: `Report ${topic} status updated to ${status} (by you)`,
        isRead: false,
      });
      await adminNotification.save({ session });

      io.to(adminId).emit('reportStatusUpdate', {
        id: adminNotification._id,
        ...notificationData,
      });
    }

    // ส่งการแจ้งเตือนผ่าน WebSocket
    io.to(`chat:${issueId}`).emit('statusChanged', {
      issueId,
      oldStatus,
      newStatus: status,
      message: `Report status updated to ${status}`,
    });

    // ยืนยัน transaction
    await session.commitTransaction();
    session.endSession();

    return { message: 'Report status updated successfully', status };
  } catch (error) {
    // ยกเลิก transaction หากเกิดข้อผิดพลาด
    await session.abortTransaction();
    session.endSession();

    console.error('Error updating report status:', error.message);
    throw error;
  }
};