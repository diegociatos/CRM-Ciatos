import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './database';
import authRoutes from './routes/auth';
import leadsRoutes from './routes/leads';
import configRoutes from './routes/config';
import scriptsRoutes from './routes/scripts';
import templatesRoutes from './routes/templates';
import goalsRoutes from './routes/goals';
import agendaRoutes from './routes/agenda';
import miningRoutes from './routes/mining';
import automationRoutes from './routes/automation';
import campaignsRoutes from './routes/campaigns';
import chatRoutes from './routes/chat';
import qualificationsRoutes from './routes/qualifications';
import auditRoutes from './routes/audit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

// CORS
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'https://crm.grupociatos.com.br',
  'https://crm.diegociatos.com.br',
  'https://app.planejarpatrimonio.com.br',
  'http://localhost:5173',
  'http://localhost:5174',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/scripts', scriptsRoutes);
app.use('/api/onboarding-templates', templatesRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/automation-flows', automationRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/qualifications', qualificationsRoutes);
app.use('/api/audit', auditRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'crm-ciatos-api', timestamp: new Date().toISOString() });
});

// Start
async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 CRM Ciatos API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
