import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/conectDB.js';
import viewEngine from './config/viewEngine';
import initWebRoutes from './route/web.js';
import { initBackgroundJobs } from './jobs/index.js'; // 🆕 ADD MISSING IMPORT

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

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 Backend Nodejs is running on port: ${port}`);
});
