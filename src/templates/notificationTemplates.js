// A small set of email templates with simple localization (vi / en).
// Export both `templates` (backwards-compatible) and `getTemplate(eventType, payload, locale)`.

const makeLayout = (title, bodyHtml, footerHtml = '') => `
  <div style="font-family: Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width:680px;margin:0 auto;color:#111">
    <div style="background:linear-gradient(90deg,#4f46e5,#06b6d4);padding:20px;border-radius:8px 8px 0 0;color:#fff;text-align:center;">
      <h1 style="margin:0;font-size:20px;">${title}</h1>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #eef2ff;border-top:0;">
      ${bodyHtml}
    </div>
    <div style="background:#f8fafc;padding:14px;border-radius:0 0 8px 8px;color:#6b7280;font-size:13px;text-align:center;">
      ${footerHtml || `Ac ${process.env.APP_NAME || 'FinWise'}`}
    </div>
  </div>
`;

const templates = {
  budgetAlert: (p, locale = 'vi') => {
    if (locale === 'en') {
      const subject = `Budget alert: ${p.category || 'Unknown'}`;
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p><strong>${p.message || 'Your spending is approaching the budget limit.'}</strong></p>
        <ul>
          <li>Budget: ${p.budgeted ?? 'N/A'}</li>
          <li>Spent: ${p.spent ?? 0}</li>
          <li>Remaining: ${p.remaining ?? 0}</li>
        </ul>
        <p style="color:#6b7280;font-size:13px">${new Date(p.timestamp || Date.now()).toLocaleString('en-US')}</p>
      `;
      return { subject, html: makeLayout(subject, body) };
    }

    const subject = `Canh bao ngan sach: ${p.category || 'Khong ro'}`;
    const body = `
      <p>Xin chao ${p.fullName || ''},</p>
      <p><strong>${p.message || 'Chi tieu cua ban sap cham nguong ngan sach.'}</strong></p>
      <ul>
        <li>Ngan sach: ${p.budgeted ?? 'N/A'}</li>
        <li>Da chi: ${p.spent ?? 0}</li>
        <li>Con lai: ${p.remaining ?? 0}</li>
      </ul>
      <p style="color:#6b7280;font-size:13px">${new Date(p.timestamp || Date.now()).toLocaleString('vi-VN')}</p>
    `;
    return { subject, html: makeLayout(subject, body) };
  },

  goalContribution: (p, locale = 'vi') => {
    if (locale === 'en') {
      const subject = 'Saving goal updated';
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p>You contributed <strong>${p.amount ?? 0}</strong> to your saving goal.</p>
        <p>Progress: <strong>${p.newCurrentAmount ?? 0} / ${p.targetAmount ?? 0}</strong></p>
        <p style="color:#6b7280;font-size:13px">${new Date(p.timestamp || Date.now()).toLocaleString('en-US')}</p>
      `;
      return { subject, html: makeLayout(subject, body) };
    }

    const subject = 'Cap nhat muc tieu tiet kiem';
    const body = `
      <p>Xin chao ${p.fullName || ''},</p>
      <p>Ban vua dong gop <strong>${p.amount ?? 0}</strong> vao muc tieu tiet kiem.</p>
      <p>Tien do: <strong>${p.newCurrentAmount ?? 0} / ${p.targetAmount ?? 0}</strong></p>
      <p style="color:#6b7280;font-size:13px">${new Date(p.timestamp || Date.now()).toLocaleString('vi-VN')}</p>
    `;
    return { subject, html: makeLayout(subject, body) };
  },

  paymentVerified: (p, locale = 'vi') => {
    if (locale === 'en') {
      const subject = 'Payment confirmed';
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p>Your payment of <strong>${p.amount ?? ''}</strong> has been confirmed.</p>
        <p style="color:#6b7280;font-size:13px">${new Date(p.processedAt || Date.now()).toLocaleString('en-US')}</p>
      `;
      return { subject, html: makeLayout(subject, body) };
    }

    const subject = 'Thanh toan thanh cong';
    const body = `
      <p>Xin chao ${p.fullName || ''},</p>
      <p>Thanh toan <strong>${p.amount ?? ''}</strong> cua ban da duoc xac nhan.</p>
      <p style="color:#6b7280;font-size:13px">${new Date(p.processedAt || Date.now()).toLocaleString('vi-VN')}</p>
    `;
    return { subject, html: makeLayout(subject, body) };
  },

  paymentFailed: (p, locale = 'vi') => {
    if (locale === 'en') {
      const subject = 'Payment failed';
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p>We could not process your payment. Please check your payment method or try again.</p>
        <p style="color:#6b7280;font-size:13px">${new Date(p.timestamp || Date.now()).toLocaleString('en-US')}</p>
      `;
      return { subject, html: makeLayout(subject, body) };
    }

    const subject = 'Thanh toan that bai';
    const body = `
      <p>Xin chao ${p.fullName || ''},</p>
      <p>Thanh toan khong thanh cong. Vui long kiem tra phuong thuc thanh toan hoac thu lai.</p>
      <p style="color:#6b7280;font-size:13px">${new Date(p.timestamp || Date.now()).toLocaleString('vi-VN')}</p>
    `;
    return { subject, html: makeLayout(subject, body) };
  },

  recommendation: (p, locale = 'vi') => {
    // Rich recommendation email with CTA and actionable bullets
    const frontend = process.env.FRONTEND_URL || 'https://app.example.com';
    const unsubscribeUrl = `${frontend}/unsubscribe?type=recommendation&userId=${p.userId || ''}`;

    if (locale === 'en') {
      const subject = p.title || 'Smart recommendation from your Fin assistant';
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p style="color:#334155">${p.summary || 'We analyzed your recent activity and prepared a personalized recommendation to help you save more.'}</p>
        ${p.recommendations && p.recommendations.length ? `
          <div style="margin-top:12px;">
            <strong>Suggestions</strong>
            <ul style="margin:8px 0 0 18px;color:#0f172a">
              ${p.recommendations.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div style="text-align:center;margin:20px 0;">
          <a href="${frontend}/recommendations/${p.recommendationId || ''}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">View recommendation</a>
        </div>
        <p style="color:#6b7280;font-size:13px;margin-top:10px">If you no longer want to receive recommendation emails, <a href="${unsubscribeUrl}">unsubscribe</a>.</p>
      `;
      return { subject, html: makeLayout(subject, body, `© ${process.env.APP_NAME || 'FinWise'}`) };
    }

    const subject = p.title || 'Gợi ý tiết kiệm mới từ AI';
    const body = `
      <p>Xin chào ${p.fullName || ''},</p>
      <p style="color:#334155">${p.summary || 'Chúng tôi đã phân tích hoạt động gần đây và có một gợi ý cá nhân giúp bạn tiết kiệm hơn.'}</p>
      ${p.recommendations && p.recommendations.length ? `
        <div style="margin-top:12px;">
          <strong>Gợi ý</strong>
          <ul style="margin:8px 0 0 18px;color:#0f172a">
            ${p.recommendations.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div style="text-align:center;margin:20px 0;">
        <a href="${frontend}/recommendations/${p.recommendationId || ''}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Xem gợi ý</a>
      </div>
      <p style="color:#6b7280;font-size:13px;margin-top:10px">Nếu bạn không muốn nhận email gợi ý, <a href="${unsubscribeUrl}">huỷ đăng ký</a>.</p>
    `;
    return { subject, html: makeLayout(subject, body, `© ${process.env.APP_NAME || 'FinWise'}`) };
  },

  chatTransactionCreated: (p, locale = 'vi') => {
    const localeCode = locale === 'en' ? 'en-US' : 'vi-VN';
    const amount = p.amount != null ? Number(p.amount).toLocaleString(localeCode) : '';
    const occurred = new Date(p.occurredAt || Date.now()).toLocaleString(localeCode);
    const readableType =
      locale === 'en'
        ? p.type || 'transaction'
        : p.type === 'expense'
          ? 'chi tieu'
          : p.type === 'income'
            ? 'thu nhap'
            : 'chuyen tien';

    if (locale === 'en') {
      const subject = 'New transaction added from SmartBudget';
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p>Your SmartBudget assistant just added a <strong>${readableType}</strong>.</p>
        <ul>
          <li>Amount: ${amount} ${p.currency || ''}</li>
          <li>When: ${occurred}</li>
          ${p.description ? `<li>Description: ${p.description}</li>` : ''}
        </ul>
        <p>You can review or edit this entry inside the app anytime.</p>
      `;
      return { subject, html: makeLayout(subject, body) };
    }

    const subject = 'Giao dich moi tu SmartBudget';
    const body = `
      <p>Xin chao ${p.fullName || ''},</p>
      <p>Tro ly SmartBudget vua them mot giao dich <strong>${readableType}</strong>.</p>
      <ul>
        <li>So tien: ${amount} ${p.currency || ''}</li>
        <li>Thoi gian: ${occurred}</li>
        ${p.description ? `<li>Ghi chu: ${p.description}</li>` : ''}
      </ul>
      <p>Ban co the kiem tra va chinh sua giao dich trong app bat ky luc nao.</p>
    `;
    return { subject, html: makeLayout(subject, body) };
  },

  // AI-generated insight (e.g. 'Check this transaction', 'Budget insight')
  insight: (p, locale = 'vi') => {
    const frontend = process.env.FRONTEND_URL || 'https://app.example.com';
    const unsubscribeUrl = `${frontend}/unsubscribe?type=insight&userId=${p.userId || ''}`;
    const amountDisplay = p.amount != null ? Number(p.amount).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') : '';

    if (locale === 'en') {
      const subject = p.title || `Account insight: ${p.categoryName || ''}`;
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p style="color:#334155">${p.summary || `We detected a transaction of ${amountDisplay} in category ${p.categoryName || p.categoryId || ''}. Please review to ensure it's correct.`}</p>
        ${p.details ? `<div style="margin-top:12px;color:#0f172a">${p.details}</div>` : ''}
        <div style="text-align:center;margin:18px 0;"><a href="${frontend}/transactions?category=${p.categoryId || ''}" style="background:#06b6d4;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Review transactions</a></div>
        <p style="color:#6b7280;font-size:13px">If you no longer want these emails, <a href="${unsubscribeUrl}">unsubscribe</a>.</p>
      `;
      return { subject, html: makeLayout(subject, body, `© ${process.env.APP_NAME || 'FinWise'}`) };
    }

    const subject = p.title || `Gợi ý phân tích: ${p.categoryName || ''}`;
    const body = `
      <p>Xin chào ${p.fullName || ''},</p>
      <p style="color:#334155">${p.summary || `Chúng tôi phát hiện một giao dịch ${amountDisplay} trong danh mục ${p.categoryName || p.categoryId || ''}. Vui lòng kiểm tra để đảm bảo không có sai sót.`}</p>
      ${p.details ? `<div style="margin-top:12px;color:#0f172a">${p.details}</div>` : ''}
      <div style="text-align:center;margin:18px 0;"><a href="${frontend}/transactions?category=${p.categoryId || ''}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Kiểm tra giao dịch</a></div>
      <p style="color:#6b7280;font-size:13px">Nếu bạn không muốn nhận email này nữa, <a href="${unsubscribeUrl}">hủy đăng ký</a>.</p>
    `;
    return { subject, html: makeLayout(subject, body, `© ${process.env.APP_NAME || 'FinWise'}`) };
  },

  // AI short advice / suggestions (matches the concise style in screenshots)
  aiAdvice: (p, locale = 'vi') => {
    const frontend = process.env.FRONTEND_URL || 'https://app.example.com';
    const unsubscribeUrl = `${frontend}/unsubscribe?type=aiAdvice&userId=${p.userId || ''}`;
    const percent = p.percent != null ? `, hiện đang ở ${Math.round(p.percent)}%` : '';

    if (locale === 'en') {
      const subject = p.title || 'Quick saving advice from AI';
      const body = `
        <p>Hi ${p.fullName || ''},</p>
        <p style="color:#111">${p.summary || 'Here are a few quick suggestions based on your recent transactions.'}${percent}</p>
        ${p.points && p.points.length ? `
          <ul style="margin-top:10px;color:#0f172a">${p.points.map(pt => `<li>${pt}</li>`).join('')}</ul>
        ` : ''}
        <p style="color:#6b7280;font-size:13px;margin-top:12px">If helpful, open the app to act on these suggestions.</p>
        <p style="color:#6b7280;font-size:13px;margin-top:8px">Unsubscribe: <a href="${unsubscribeUrl}">click here</a></p>
      `;
      return { subject, html: makeLayout(subject, body, `© ${process.env.APP_NAME || 'FinWise'}`) };
    }

    const subject = p.title || 'Gợi ý nhanh từ AI';
    const body = `
      <p>Xin chào ${p.fullName || ''},</p>
      <p style="color:#111">${p.summary || 'Một vài gợi ý ngắn dựa trên giao dịch gần đây.'}${percent}</p>
      ${p.points && p.points.length ? `
        <ul style="margin-top:10px;color:#0f172a">${p.points.map(pt => `<li>${pt}</li>`).join('')}</ul>
      ` : ''}
      <p style="color:#6b7280;font-size:13px;margin-top:12px">Nếu hữu ích, mở app để thực hiện các hành động.</p>
      <p style="color:#6b7280;font-size:13px;margin-top:8px">Hủy nhận: <a href="${unsubscribeUrl}">nhấn vào đây</a></p>
    `;
    return { subject, html: makeLayout(subject, body, `© ${process.env.APP_NAME || 'FinWise'}`) };
  },
};

// Backwards-compatible default export
export default templates;

// Helper to pick a template and return {subject, html}
export const getTemplate = (eventType, payload = {}, locale = 'vi') => {
  const factory = templates[eventType];
  if (typeof factory !== 'function') {
    const subj = locale === 'en' ? 'Notification' : 'Thong bao';
    const body = `<p>${payload.message || payload.summary || ''}</p>`;
    return { subject: subj, html: makeLayout(subj, body) };
  }

  try {
    return factory(payload, locale);
  } catch (err) {
    const subj = locale === 'en' ? 'Notification' : 'Thong bao';
    const body = `<p>${payload.message || ''}</p>`;
    return { subject: subj, html: makeLayout(subj, body) };
  }
};

export { templates };