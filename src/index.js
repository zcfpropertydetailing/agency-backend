require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const agentRoutes = require('./routes/agents');
const metricsRoutes = require('./routes/metrics');
const webflowRoutes = require('./routes/webflow');
const deployRoutes = require('./routes/deploy');
const { runWeeklyPerformanceReview } = require('./agents/performance');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.set('trust proxy', 1);
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-service-key'],
  credentials: false
}));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/webflow', webflowRoutes);
app.use('/api/deploy', deployRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Weekly performance review - runs every Monday at 9am
cron.schedule('0 9 * * 1', async () => {
  console.log('Running weekly performance review...');
  await runWeeklyPerformanceReview();
});

app.listen(PORT, () => {
  console.log(`Agency Backend running on port ${PORT}`);
});

module.exports = app;
