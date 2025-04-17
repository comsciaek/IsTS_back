import jwt from 'jsonwebtoken';
import User from '../model/User.js'; // เพิ่มการ import User model

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      message: 'Not authorized, no token',
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id || !decoded.role) {
      throw new Error('Invalid token payload');
    }

    // ดึงข้อมูลผู้ใช้จากฐานข้อมูล
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // ตรวจสอบสถานะของผู้ใช้
    if (user.status === 'inactive') {
      return res.status(403).json({ message: 'User account is inactive (inactive)' });
    }

    req.user = user; // เก็บข้อมูลผู้ใช้ทั้งหมดใน req.user
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({
      message: 'Not authorized, invalid token',
      error: error.message,
    });
  }
};

const authorizeAdminOrSuperAdmin = (req, res, next) => {
  const { role } = req.user || {};

  if (!role) {
    return res.status(401).json({
      message: 'User role not found in token',
    });
  }

  if (role !== 'SuperAdmin' && role !== 'Admin') {
    return res.status(403).json({
      message: 'Only SuperAdmin or Admin is authorized to perform this action',
    });
  }
  next();
};

export { protect, authorizeAdminOrSuperAdmin };