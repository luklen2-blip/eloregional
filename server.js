import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { JsonDB } from './src/db/jsonDb.js';
import { seedDatabase } from './src/db/seedData.js';
import { MatchEngine } from './src/services/matchEngine.js';
import { MemoryRateLimiter } from './src/services/security.js';
import healthRoutes from './src/routes/healthRoutes.js';
import { createApiRoutes } from './src/routes/apiRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração para compatibilidade total com Render e proxies reversos
app.set('trust proxy', 1);

// 1. Bancos de Dados Atômicos
const dataDir = path.join(process.cwd(), 'database', 'data');
const usersDb = new JsonDB('users', dataDir);
const solutionsDb = new JsonDB('solutions', dataDir);
const challengesDb = new JsonDB('challenges', dataDir);
const matchesDb = new JsonDB('matches', dataDir);
const messagesDb = new JsonDB('messages', dataDir);
const subscriptionsDb = new JsonDB('subscriptions', dataDir);
const claimsDb = new JsonDB('claims', dataDir);

// Inicializar semente de soluções comprovadas brasileiras
seedDatabase(solutionsDb);

// Motor de Matchmaking
const matchEngine = new MatchEngine(solutionsDb);

// 2. Middlewares de Segurança Básica e Configuração (OWASP Standard)
app.use(cors());
app.use(express.json({ limit: '500kb' }));

// Limitador de requisições global para mitigar ataques de força bruta e DoS (300 req/15min)
const globalLimiter = new MemoryRateLimiter(15 * 60 * 1000, 300, 'Muitas requisições deste IP. Tente novamente mais tarde.').middleware();
app.use(globalLimiter);

// Cabeçalhos de Segurança (OWASP Standard)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// 3. Rota Mandatória de Monitoramento de Saúde (/api/health)
app.use('/api', healthRoutes);

// 4. Rotas de Negócio da API REST
app.use('/api', createApiRoutes({
  usersDb,
  solutionsDb,
  challengesDb,
  matchesDb,
  messagesDb,
  subscriptionsDb,
  claimsDb,
  matchEngine
}));

// 5. Rotas Específicas de Páginas Legais e SPA
app.get('/termos', (req, res) => {
  const fileCandidates = [
    path.join(__dirname, 'public', 'termos.html'),
    path.join(process.cwd(), 'public', 'termos.html')
  ];
  const found = fileCandidates.find(p => fs.existsSync(p));
  if (found) return res.sendFile(found);
  res.status(404).send('Página de Termos de Uso em manutenção.');
});

app.get('/privacidade', (req, res) => {
  const fileCandidates = [
    path.join(__dirname, 'public', 'privacidade.html'),
    path.join(process.cwd(), 'public', 'privacidade.html')
  ];
  const found = fileCandidates.find(p => fs.existsSync(p));
  if (found) return res.sendFile(found);
  res.status(404).send('Página de Privacidade em manutenção.');
});

// 6. Resolução Universal e Resiliente de Arquivos Estáticos (Raiz + public/)
const staticMiddleware = (req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const cleanPath = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
  const candidatePaths = [
    path.join(__dirname, 'public', cleanPath),
    path.join(__dirname, cleanPath),
    path.join(process.cwd(), 'public', cleanPath),
    path.join(process.cwd(), cleanPath)
  ];

  const filePath = candidatePaths.find(p => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });

  if (filePath) {
    return res.sendFile(filePath);
  }

  // Fallback para SPA (index.html)
  const indexCandidates = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(process.cwd(), 'public', 'index.html'),
    path.join(__dirname, 'index.html')
  ];
  const indexPath = indexCandidates.find(p => fs.existsSync(p));
  if (indexPath) {
    return res.sendFile(indexPath);
  }

  next();
};

app.use(staticMiddleware);

// Middleware Global de Tratamento de Erros (Prevenção de vazamento de dados)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'JSON inválido ou malformatado no corpo da requisição.'
    });
  }
  console.error('⚠️ Erro interno interceptado:', err.message);
  res.status(500).json({
    success: false,
    error: 'Ocorreu um erro interno ao processar a solicitação. Tente novamente mais tarde.'
  });
});

// Exportar para testes ou inicializar diretamente
if (process.env.NODE_ENV !== 'test_env') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🌾 EloRegional - Match de Soluções Regionais rodando!`);
    console.log(`🚀 Porta de Produção: http://0.0.0.0:${PORT}`);
    console.log(`🩺 Health check: http://0.0.0.0:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

export default app;
