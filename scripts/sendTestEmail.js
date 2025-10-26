import dotenv from 'dotenv';
dotenv.config();

import { sendTestNotification } from '../src/services/emailService.js';

(async () => {
    try {
        const res = await sendTestNotification({
            to: 'vuduc870@gmail.com',
            eventType: 'goalContribution',
            payload: {
                fullName: 'Vũ Đức',
                amount: 50000,
                newCurrentAmount: 200000,
                targetAmount: 500000,
                timestamp: Date.now(),
            },
            locale: 'vi',
        });
        console.log('sendTestNotification result:', res);
    } catch (err) {
        console.error('sendTestEmail script error:', err);
    }
})();
