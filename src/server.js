import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/conectDB.js';
import viewEngine from './config/viewEngine';
import initWebRoutes from './route/web.js';
import { initBackgroundJobs } from './jobs/index.js'; // 🆕 ADD MISSING IMPORT
import { publishDomainEvents } from './events/domainEvents.js';

dotenv.config(); // Load biến môi trường từ .env

let app = express();
app.use(cors({ origin: true }));
app.use(
  bodyParser.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);
app.use(
  bodyParser.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);

viewEngine(app);
initWebRoutes(app);

connectDB(); // Kết nối MongoDB thay vì MySQL

// 🆕 Initialize background jobs after database connection
initBackgroundJobs();

// Dev-only endpoint to publish test events (protected by DEV_TEST_SECRET)
app.post('/__dev/publish-test-events', async (req, res) => {
  try {
    const secret = req.headers['x-dev-secret'] || req.query.secret;
    if (!process.env.DEV_TEST_SECRET || secret !== process.env.DEV_TEST_SECRET) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const events = req.body.events || [];
    await publishDomainEvents(events);
    return res.json({ success: true, published: events.length });
  } catch (e) {
    console.error('__dev publish error', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 Backend Nodejs is running on port: ${port}`);
});
