import { subscribeDomainEvent } from '../events/domainEvents.js';
import emailService from '../services/emailService.js';
import User from '../models/user.js';
import { getTemplate } from '../templates/notificationTemplates.js';

const findUser = async (userId) => {
  if (!userId) return null;
  const user = await User.findById(userId);
  if (!user || !user.email) return null;
  return user;
};

const handleQuotaWarning = async (event) => {
  try {
    const { payload } = event || {};
    const user = await findUser(payload?.userId);
    if (!user) return;

    const subject = payload.title || 'Thong bao tu FinWise';
    const html = `<p>${payload.message || ''}</p><p><small>Thoi gian: ${new Date(
      payload.timestamp || Date.now(),
    ).toLocaleString('vi-VN')}</small></p>`;

    await emailService.sendNotificationEmail(user, subject, html);
  } catch (error) {
    console.error('handleQuotaWarning error:', error);
  }
};

const initNotificationJobs = () => {
  subscribeDomainEvent('notification.quota_warning', handleQuotaWarning);

  subscribeDomainEvent('notification.sync_result', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const subject = payload.title || 'Ket qua dong bo vi';
      const html = `<p>Trang thai dong bo: ${payload.status || 'unknown'}</p><p>${
        payload.message || ''
      }</p>`;
      await emailService.sendNotificationEmail(user, subject, html);
    } catch (error) {
      console.error('notification.sync_result handler error:', error);
    }
  });

  subscribeDomainEvent('budget.threshold_reached', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const tpl = getTemplate(
        'budgetAlert',
        {
          ...payload,
          fullName: user.fullName || user.username,
        },
        'vi',
      );
      await emailService.sendNotificationEmail(user, tpl.subject, tpl.html);
    } catch (error) {
      console.error('budget.threshold_reached handler error:', error);
    }
  });

  subscribeDomainEvent('goal.contribution_added', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const tpl = getTemplate(
        'goalContribution',
        {
          ...payload,
          fullName: user.fullName || user.username,
        },
        'vi',
      );
      await emailService.sendNotificationEmail(user, tpl.subject, tpl.html);
    } catch (error) {
      console.error('goal.contribution_added handler error:', error);
    }
  });

  subscribeDomainEvent('payment.verified', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const tpl = getTemplate(
        'paymentVerified',
        {
          ...payload,
          fullName: user.fullName || user.username,
        },
        'vi',
      );
      await emailService.sendNotificationEmail(user, tpl.subject, tpl.html);
    } catch (error) {
      console.error('payment.verified handler error:', error);
    }
  });

  subscribeDomainEvent('payment.failed', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const tpl = getTemplate(
        'paymentFailed',
        {
          ...payload,
          fullName: user.fullName || user.username,
        },
        'vi',
      );
      await emailService.sendNotificationEmail(user, tpl.subject, tpl.html);
    } catch (error) {
      console.error('payment.failed handler error:', error);
    }
  });

  subscribeDomainEvent('payment.refunded', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const subject = 'Thanh toan duoc hoan tien';
      const html = `<p>Thanh toan cua ban da duoc hoan tien.</p><p><small>${new Date().toLocaleString(
        'vi-VN',
      )}</small></p>`;
      await emailService.sendNotificationEmail(user, subject, html);
    } catch (error) {
      console.error('payment.refunded handler error:', error);
    }
  });

  subscribeDomainEvent('recommendation.generated', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const subject = payload.title || 'Goi y tiet kiem moi tu AI';
      const html = `<p>${
        payload.summary || (payload.recommendations || []).join('<br />') || 'Ban co goi y moi.'
      }</p>`;
      await emailService.sendNotificationEmail(user, subject, html);
    } catch (error) {
      console.error('recommendation.generated handler error:', error);
    }
  });

  subscribeDomainEvent('subscription.activated', async (event) => {
    try {
      const { payload } = event || {};
      const user = await findUser(payload?.userId);
      if (!user) return;

      const subject = 'Goi dich vu da duoc kich hoat';
      const html = '<p>Goi dich vu cua ban da duoc kich hoat. Cam on ban da su dung dich vu.</p>';
      await emailService.sendNotificationEmail(user, subject, html);
    } catch (error) {
      console.error('subscription.activated handler error:', error);
    }
  });

  subscribeDomainEvent('transaction.created', async (event) => {
    try {
      const { payload } = event || {};
      if (payload?.inputMethod !== 'ai_assisted') return;
      const user = await findUser(payload?.userId);
      if (!user) return;

      const tpl = getTemplate(
        'chatTransactionCreated',
        {
          ...payload,
          amount: Number(payload?.amount),
          fullName: user.fullName || user.username,
        },
        'vi',
      );
      await emailService.sendNotificationEmail(user, tpl.subject, tpl.html);
    } catch (error) {
      console.error('transaction.created handler error:', error);
    }
  });

  console.log('[NotificationJobs] Email subscribers initialized.');
};

export { initNotificationJobs };