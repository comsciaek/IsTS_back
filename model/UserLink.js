// filepath: c:\DEV TEST YOK\Project\IsTS-Project\backend\model\UserLink.js
import mongoose from 'mongoose';

const UserLinkSchema = new mongoose.Schema({
  lineUserId: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true, unique: true },
  linkedAt: { type: Date, default: Date.now },
});

const UserLink = mongoose.models.UserLink || mongoose.model('UserLink', UserLinkSchema);

export default UserLink;