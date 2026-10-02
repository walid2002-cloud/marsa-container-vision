const { listNotifications } = require('../services/notificationService');

async function getNotifications(req, res, next) {
  try {
    const limit = req.query.limit || 50;
    const data = await listNotifications(limit);
    return res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

module.exports = { getNotifications };
