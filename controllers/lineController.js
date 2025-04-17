import axios from 'axios';
import { createHmac } from 'crypto';
import UserLink from '../model/UserLink.js';
import User from '../model/User.js';

const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ฟังก์ชันส่งข้อความผ่าน LINE Messaging API
export const sendMessage = async (lineUserId, message) => {
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: lineUserId,
        messages: [{ type: 'text', text: message }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
    console.log('Message sent successfully to:', lineUserId);
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
};

// Webhook เพื่อรับข้อความจาก LINE
export const handleWebhook = async (req, res) => {
  console.log('Webhook received:', JSON.stringify(req.body, null, 2)); // ล็อก request ที่ได้รับ

  const signature = req.headers['x-line-signature'];
  if (!signature) {
    console.error('Missing X-Line-Signature header');
    return res.status(200).json({ message: 'Webhook processed' });
  }

  const body = JSON.stringify(req.body);
  const hash = createHmac('SHA256', CHANNEL_SECRET).update(body).digest('base64');
  if (signature !== hash) {
    console.error('Invalid signature');
    return res.status(200).json({ message: 'Webhook processed' });
  }

  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const lineUserId = event.source.userId;
      const messageText = event.message.text.trim();

      console.log(`Message from ${lineUserId}: ${messageText}`); // ล็อกข้อความที่ได้รับ

      const userLink = await UserLink.findOne({ lineUserId });

      if (messageText.toLowerCase() === 'ลงทะเบียน') {
        if (userLink) {
          await sendMessage(lineUserId, `คุณลงทะเบียนแล้วด้วยรหัสพนักงาน: ${userLink.employeeId}`);
        } else {
          await sendMessage(lineUserId, 'กรุณากรอกรหัสพนักงานของคุณ (เช่น EMP001) เพื่อลงทะเบียน');
        }
      } else if (!userLink) {
        const employeeId = messageText.trim();

        console.log('Searching for employeeId in User table:', employeeId);

        const user = await User.findOne({ employeeId: { $regex: new RegExp(`^${employeeId}$`, 'i') } });
        if (!user) {
          console.log('Employee ID not found in User table');
          await sendMessage(lineUserId, 'รหัสพนักงานไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
          return;
        }

        console.log('Employee ID found in User table:', user);

        const existingLink = await UserLink.findOne({ employeeId });
        if (existingLink) {
          await sendMessage(lineUserId, 'รหัสพนักงานนี้ถูกใช้ลงทะเบียนแล้ว กรุณาติดต่อผู้ดูแลระบบ');
          return;
        }

        await UserLink.create({ lineUserId, employeeId });
        await sendMessage(
          lineUserId,
          `ลงทะเบียนสำเร็จ! รหัสพนักงานของคุณคือ ${employeeId} คุณจะได้รับการแจ้งเตือนผ่าน LINE`
        );
      } else {
        await sendMessage(lineUserId, 'คุณลงทะเบียนแล้ว หากต้องการความช่วยเหลือเพิ่มเติม กรุณาติดต่อผู้ดูแลระบบ');
      }
    }
  }

  res.status(200).json({ message: 'Webhook processed' });
};