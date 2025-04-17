import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import models from '../model/index.js'; // ใช้ models/index.js เพื่อรวม models
import axios from 'axios';
import { updateReportStatus } from '../utils/reportUtils.js';
import  dotenv from 'dotenv';

dotenv.config();

const { User, Report, Chat, Notification } = models; // ลบ UserLink ออก

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
if (!CHANNEL_ACCESS_TOKEN) {
  throw new Error('CHANNEL_ACCESS_TOKEN is not defined in the environment variables');
}

// ฟังก์ชันส่งข้อความผ่าน LINE Messaging API
const sendMessage = async (lineUserId, message, type = 'text', flexMessage = null) => {
  try {
    if (!lineUserId) {
      throw new Error('lineUserId is required');
    }

    const truncatedMessage = type === 'text' && message.length > 5000 ? message.substring(0, 4997) + '...' : message;
    let payload = {
      to: lineUserId,
      messages: type === 'flex'
        ? [{ type: 'flex', altText: truncatedMessage, contents: flexMessage }]
        : [{ type: 'text', text: truncatedMessage }],
    };

    const response = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );

    return { success: true, response: response.data };
  } catch (error) {
    // ลบ console.log ที่ไม่จำเป็นออก
    if (type === 'flex') {
      try {
        const fallbackPayload = {
          to: lineUserId,
          messages: [{ type: 'text', text: message }],
        };

        const fallbackResponse = await axios.post(
          'https://api.line.me/v2/bot/message/push',
          fallbackPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
            },
          }
        );

        return { success: true, response: fallbackResponse.data, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: fallbackError.response?.data || fallbackError.message };
      }
    }

    return { success: false, error: error.response?.data || error.message };
  }
};

const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [`${process.env.API_BASE_URL}`, 'http://localhost:5173', 'http://127.0.0.1:5500'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      socket.userId = decoded.userId || decoded.id;
      next();
    } catch (error) {
      console.error('JWT Verification Error:', error.message);
      return next(new Error(`Authentication error: Invalid token (${error.message})`));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.userId);

    socket.on('userConnected', async ({ userId, role }) => {
      socket.userId = userId;
      socket.role = role;
      socket.join(userId);

      try {
        const notifications = await Notification.find({
          userId: userId,
          isRead: false,
        }).sort({ createdAt: -1 });

        if (notifications.length > 0) {
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
          socket.emit('unreadNotifications', notificationsResponse);
        }
      } catch (error) {
        console.error('Error fetching unread notifications:', error);
        socket.emit('error', { message: 'Error fetching unread notifications', error: error.message });
      }
    });

    socket.on('joinUserRoom', async (roomId) => {
      try {
        const report = await Report.findById(roomId);
        if (!report) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        if (
          report.userId?.toString() !== socket.userId &&
          (!report.assignedAdmin || report.assignedAdmin?.toString() !== socket.userId)
        ) {
          socket.emit('error', { message: 'Unauthorized to join this room' });
          return;
        }

        socket.join(roomId);
        console.log(`User ${socket.userId} joined room: ${roomId}`);

        const chatHistory = await Chat.find({ issueId: roomId })
          .populate('senderId', 'firstName lastName role profileImage')
          .sort({ createdAt: -1 })
          .limit(50);

        const unreadChats = await Chat.find({
          issueId: roomId,
          readBy: { $ne: socket.userId },
        });

        const chatHistoryResponse = chatHistory.reverse().map(chat => ({
          id: chat._id,
          issueId: chat.issueId,
          senderId: {
            id: chat.senderId._id,
            firstName: chat.senderId.firstName,
            lastName: chat.senderId.lastName,
            role: chat.senderId.role,
            profileImage: chat.senderId.profileImage,
          },
          message: chat.message,
          file: chat.file,
          createdAt: chat.createdAt,
          readBy: chat.readBy,
        }));

        socket.emit('chatHistory', {
          history: chatHistoryResponse,
          unreadCount: unreadChats.length,
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Error joining room', error: error.message });
      }
    });

    socket.on('leaveIssueChat', (issueId) => {
      socket.leave(issueId);
      console.log(`User ${socket.id} left issue chat: ${issueId}`);
    });

    socket.on('sendMessage', async ({ issueId, message, fileUrl, receiverId }, callback) => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const userId = socket.userId;

        // ตรวจสอบสิทธิ์และดึงข้อมูลรายงาน
        const report = await Report.findById(issueId).session(session);
        if (
          !report ||
          (report.userId?.toString() !== userId && (!report.assignedAdmin || report.assignedAdmin?.toString() !== userId))
        ) {
          await session.abortTransaction();
          session.endSession();
          socket.emit('error', { message: 'Unauthorized' });
          if (callback) callback({ error: 'Unauthorized' });
          return;
        }

        // สร้างข้อความใหม่
        const newMessage = await Chat.create(
          [
            {
              issueId,
              senderId: userId,
              message: message || '',
              file: fileUrl || '',
            },
          ],
          { session }
        );

        const populatedMessage = await Chat.findById(newMessage[0]._id)
          .populate('senderId', 'firstName lastName role profileImage')
          .session(session);

        const chatData = {
          id: populatedMessage._id,
          issueId: populatedMessage.issueId,
          senderId: {
            id: populatedMessage.senderId._id,
            firstName: populatedMessage.senderId.firstName,
            lastName: populatedMessage.senderId.lastName,
            role: populatedMessage.senderId.role,
            profileImage: populatedMessage.senderId.profileImage,
          },
          message: populatedMessage.message,
          file: populatedMessage.file,
          createdAt: populatedMessage.createdAt,
        };

        // ส่งข้อความผ่าน Socket.IO
        io.to(issueId).emit('messageReceived', {
          ...chatData,
          fileMetadata: {
            name: fileUrl ? fileUrl.split('/').pop() : null,
            type: fileUrl
              ? fileUrl.endsWith('.pdf')
                ? 'application/pdf'
                : fileUrl.endsWith('.png')
                ? 'image/png'
                : fileUrl.endsWith('.jpg') || fileUrl.endsWith('.jpeg')
                ? 'image/jpeg'
                : 'application/octet-stream'
              : null,
          },
        });

        // ส่งการแจ้งเตือนให้ผู้รับข้อความ
        if (receiverId && mongoose.Types.ObjectId.isValid(receiverId) && receiverId !== userId) {
          io.to(receiverId).emit('messageReceived', chatData);

          const receiverNotification = new Notification({
            userId: receiverId,
            issueId,
            message: `New message from ${populatedMessage.senderId.firstName} ${populatedMessage.senderId.lastName} in ${report.topic}`,
            type: 'info',
            isRead: false,
            oldStatus: report.status,
            newStatus: report.status,
            createdAt: new Date(),
          });
          await receiverNotification.save({ session });

          io.to(receiverId).emit('newMessageNotification', {
            id: receiverNotification._id,
            issueId,
            message: receiverNotification.message,
            isRead: receiverNotification.isRead,
            createdAt: receiverNotification.createdAt,
          });
        }

        // ตรวจสอบคำสั่งพิเศษ เช่น /close
        if (message === '/close' && (populatedMessage.senderId.role === 'Admin' || populatedMessage.senderId.role === 'SuperAdmin')) {
          if (report.status === 'rejected') {
            await session.abortTransaction();
            session.endSession();
            socket.emit('error', { message: 'Cannot close a rejected report' });
            if (callback) callback({ error: 'Cannot close a rejected report' });
            return;
          }

          const updateResult = await updateReportStatus({ issueId, status: 'completed', userId, role: populatedMessage.senderId.role, io });
          if (!updateResult.success) {
            console.error('Failed to update report status:', updateResult.error);
            throw new Error(updateResult.error);
          }

          // เพิ่มข้อความในแชทเพื่อยืนยันการปิดเคส
          const closeMessage = await Chat.create(
            [
              {
                issueId,
                senderId: userId,
                message: 'เคสนี้ถูกปิดแล้ว',
              },
            ],
            { session }
          );

          const populatedCloseMessage = await Chat.findById(closeMessage[0]._id)
            .populate('senderId', 'firstName lastName role profileImage')
            .session(session);

          const closeChatData = {
            id: populatedCloseMessage._id,
            issueId: populatedCloseMessage.issueId,
            senderId: {
              id: populatedCloseMessage.senderId._id,
              firstName: populatedCloseMessage.senderId.firstName,
              lastName: populatedCloseMessage.senderId.lastName,
              role: populatedCloseMessage.senderId.role,
              profileImage: populatedCloseMessage.senderId.profileImage,
            },
            message: populatedCloseMessage.message,
            file: populatedCloseMessage.file,
            createdAt: populatedCloseMessage.createdAt,
          };

          io.to(issueId).emit('messageReceived', {
            ...closeChatData,
            fileMetadata: null,
          });
        }

        await session.commitTransaction();
        session.endSession();

        if (callback) callback({ message: 'Message sent successfully' });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Error sending message', error: error.message });
        if (callback) callback({ error: 'Error sending message', details: error.message });
      }
    });

    socket.on('reportStatusUpdate', async ({ issueId, status }, callback) => {
      try {
        // ดึงข้อมูลผู้ใช้ (admin) จากฐานข้อมูล
        const admin = await User.findById(socket.userId);
        if (!admin) {
          throw new Error('Admin not found');
        }

        // ดึงข้อมูลรายงาน
        const report = await Report.findById(issueId);
        if (!report) {
          throw new Error('Report not found');
        }

        // ดึงข้อมูลเจ้าของรายงาน (user)
        const user = await User.findById(report.userId);
        if (!user) {
          throw new Error('User not found');
        }

        // อัปเดตสถานะรายงาน
        const result = await updateReportStatus({ issueId, status, userId: socket.userId, role: socket.role, io });

        // สร้าง Flex Message สำหรับ admin
        const adminFlexMessage = {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: 'การแจ้งเตือนสถานะรายงาน', weight: 'bold', size: 'lg', color: '#1DB446' },
              { type: 'text', text: `รายงาน: ${report.topic}`, size: 'md', margin: 'md', wrap: true },
              { type: 'text', text: `สถานะ: ${status}`, size: 'md', margin: 'md', color: '#FF6B6B', wrap: true },
              { type: 'text', text: `โดย: ${admin.firstName} ${admin.lastName}`, size: 'sm', color: '#666666', margin: 'sm', wrap: true },
            ],
          },
        };

        // ส่ง Flex Message ไปยัง admin
        if (admin.lineUserId) {
          const adminResult = await sendMessage(admin.lineUserId, `รายงานหัวข้อ "${report.topic}" ได้ถูกเปลี่ยนสถานะเป็น ${status}`, 'flex', adminFlexMessage);
          if (!adminResult.success) {
            console.error('Failed to send LINE notification to admin:', adminResult.error);
          }
        }

        // สร้าง Flex Message สำหรับ user
        const userFlexMessage = {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: 'การแจ้งเตือนสถานะรายงาน', weight: 'bold', size: 'lg', color: '#1DB446' },
              { type: 'text', text: `รายงาน: ${report.topic}`, size: 'md', margin: 'md', wrap: true },
              { type: 'text', text: `สถานะ: ${status}`, size: 'md', margin: 'md', color: '#FF6B6B', wrap: true },
              { type: 'text', text: `โดย: ${admin.firstName} ${admin.lastName}`, size: 'sm', color: '#666666', margin: 'sm', wrap: true },
            ],
          },
        };

        // ส่ง Flex Message ไปยัง user
        if (user.lineUserId) {
          const userResult = await sendMessage(user.lineUserId, `สวัสดีคุณ ${user.firstName}, สถานะของรายงานหัวข้อ "${report.topic}" ได้ถูกเปลี่ยนเป็น ${status} โดย ${admin.firstName} ${admin.lastName}`, 'flex', userFlexMessage);
          if (!userResult.success) {
            console.error('Failed to send LINE notification to user:', userResult.error);
          }
        }

        if (callback) callback(result);
      } catch (error) {
        console.error('Error in reportStatusUpdate:', error.message);
        socket.emit('error', { message: error.message });
        if (callback) callback({ error: error.message });
      }
    });

    socket.on('markMessageAsRead', async ({ issueId }) => {
      try {
        const userId = socket.userId;
        await Chat.updateMany(
          { issueId, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );
        io.to(issueId).emit('messageRead', { issueId, userId, message: 'Message marked as read' });
      } catch (error) {
        console.error('Error marking message as read:', error);
        socket.emit('error', { message: 'Error marking message as read', error: error.message });
      }
    });

    socket.on('disconnect', () => {
      // console.log('User disconnected:', socket.id);
    });
  });

  return io;
};

export default initializeSocket;