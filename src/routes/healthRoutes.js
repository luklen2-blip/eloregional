import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: process.env.APP_NAME || 'Match de Soluções Regionais (EloRegional)',
    version: '2.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

export default router;
