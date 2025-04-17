import axios from 'axios';

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ฟังก์ชันช่วยคำนวณขนาดของ JSON
const getJsonSizeInKB = (obj) => {
  const jsonString = JSON.stringify(obj);
  const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
  return sizeInBytes / 1024; // แปลงเป็น KB
};

export const sendMessage = async (lineUserId, message, type = 'text', flexMessage = null) => {
  try {
    if (!lineUserId) {
      throw new Error('lineUserId is required');
    }

    if (!CHANNEL_ACCESS_TOKEN) {
      throw new Error('CHANNEL_ACCESS_TOKEN is not defined');
    }

    const truncatedMessage = type === 'text' && message.length > 5000 ? message.substring(0, 4997) + '...' : message;
    let payload = {
      to: lineUserId,
      messages: [],
    };

    if (type === 'flex') {
      // ตรวจสอบขนาดของ Flex Message
      const flexMessageSize = getJsonSizeInKB(flexMessage);
      console.log(`Flex Message size: ${flexMessageSize} KB`);
      if (flexMessageSize > 30) {
        console.error('Flex Message size exceeds 30 KB limit, falling back to text message');
        payload.messages = [{ type: 'text', text: truncatedMessage }];
      } else {
        payload.messages = [{ type: 'flex', altText: truncatedMessage, contents: flexMessage }];
      }
    } else {
      payload.messages = [{ type: 'text', text: truncatedMessage }];
    }

    // console.log('Sending LINE message with payload:', JSON.stringify(payload, null, 2));

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

    // console.log('LINE message sent successfully to:', lineUserId, 'Response:', response.data);
    return { success: true, response: response.data };
  } catch (error) {
    console.error('Error sending LINE message to', lineUserId, ':', error.response?.data || error.message);

    // Fallback: ถ้า Flex Message ล้มเหลว ให้ส่งข้อความธรรมดา
    if (type === 'flex') {
      console.log('Falling back to text message due to Flex Message failure');
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

        console.log('Fallback text message sent successfully to:', lineUserId, 'Response:', fallbackResponse.data);
        return { success: true, response: fallbackResponse.data, fallback: true };
      } catch (fallbackError) {
        console.error('Error sending fallback text message to', lineUserId, ':', fallbackError.response?.data || fallbackError.message);
        return { success: false, error: fallbackError.response?.data || fallbackError.message };
      }
    }

    return { success: false, error: error.response?.data || error.message };
  }
};

export const sendLineNotification = async (lineUserId, altText, flexMessage) => {
  try {
    const result = await sendMessage(lineUserId, altText, 'flex', flexMessage);
    if (!result.success) {
      console.error(`Failed to send LINE notification to userId: ${lineUserId}`, result.error);
    }
    return result.success;
  } catch (error) {
    console.error(`Error sending LINE notification to userId: ${lineUserId}`, error.message);
    return false;
  }
};