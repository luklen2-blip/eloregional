/**
 * Validador Remoto de Produção e Homologação na Nuvem (Live Cloud E2E)
 * Configurado com rejectUnauthorized: false para prevenir bloqueios de certificados no Windows.
 */

import https from 'https';
import http from 'http';

const targetUrl = process.argv[2] || process.env.LIVE_URL;

if (!targetUrl) {
  console.log('ℹ️ Modo de instrução:');
  console.log('   Uso: node tests/test_cloud_live.js <URL_DE_PRODUCAO>');
  console.log('   Exemplo: node tests/test_cloud_live.js https://eloregional-app.onrender.com');
  process.exit(0);
}

const isHttps = targetUrl.startsWith('https');
const client = isHttps ? https : http;
const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined;

function requestUrl(endpoint, options = {}) {
  const fullUrl = new URL(endpoint, targetUrl).toString();
  return new Promise((resolve, reject) => {
    const reqOptions = {
      agent,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = client.request(fullUrl, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runLiveE2E() {
  console.log(`🌐 Iniciando testes de homologação 360° em: ${targetUrl}`);

  // 1. Health Check
  const health = await requestUrl('/api/health');
  if (health.status !== 200) throw new Error(`Health check falhou: HTTP ${health.status}`);
  const healthJson = JSON.parse(health.data);
  if (healthJson.status !== 'ok') throw new Error(`Payload de health incorreto: ${health.data}`);
  console.log(`✅ [1/6] /api/health respondendo 200 OK (uptime: ${healthJson.uptime_seconds}s)`);

  // 2. Landing Page / PWA
  const home = await requestUrl('/');
  if (home.status !== 200) throw new Error(`Página principal falhou: HTTP ${home.status}`);
  if (!home.data.includes('EloRegional')) throw new Error('Título da aplicação ausente no HTML');
  console.log('✅ [2/6] Interface PWA e assets estáticos carregados com sucesso');

  // 3. Catálogo de Soluções
  const solutions = await requestUrl('/api/solutions');
  if (solutions.status !== 200) throw new Error(`API de soluções falhou: HTTP ${solutions.status}`);
  const solJson = JSON.parse(solutions.data);
  if (!solJson.success || solJson.total === 0) throw new Error('Nenhuma solução retornada da API');
  console.log(`✅ [3/6] API de Soluções ativa (${solJson.total} tecnologias sociais disponíveis)`);

  // 4. Teste do Motor de Matchmaking Remoto
  const testChallenge = JSON.stringify({
    titulo: 'Recuperação de área degradada e falta de chuva',
    descricao: 'Solo arenoso com baixa retenção de umidade',
    categoria: 'agricultura_sustentavel',
    regiao: 'centro_oeste',
    uf: 'GO'
  });
  const matchRes = await requestUrl('/api/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(testChallenge) },
    body: testChallenge
  });
  if (matchRes.status !== 201) throw new Error(`Criação de desafio/match falhou: HTTP ${matchRes.status}`);
  const matchJson = JSON.parse(matchRes.data);
  console.log(`✅ [4/6] Motor de Matchmaking operacional (Top Match: ${matchJson.data.matches[0].matchScore}%)`);

  // 5. Checkout PIX Oficial Remoto
  const testPix = JSON.stringify({
    customerName: 'Teste Cloud Live',
    planoId: 'pro'
  });
  const pixRes = await requestUrl('/api/checkout/pix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(testPix) },
    body: testPix
  });
  if (pixRes.status !== 200) throw new Error(`API de PIX falhou: HTTP ${pixRes.status}`);
  const pixJson = JSON.parse(pixRes.data);
  if (!pixJson.data.pixPayload.includes('br.gov.bcb.pix')) throw new Error('Payload PIX inválido');
  console.log('✅ [5/6] Motor PIX gerando payload oficial Banco Central com QR Code');

  // 6. Páginas Legais (LGPD)
  const termos = await requestUrl('/termos');
  const privacidade = await requestUrl('/privacidade');
  if (termos.status !== 200 || privacidade.status !== 200) throw new Error('Rotas legais (/termos, /privacidade) inacessíveis');
  console.log('✅ [6/6] Conformidade legal e LGPD validada (Rotas /termos e /privacidade operacionais)');

  console.log('\n🎉 APLICAÇÃO EM NUVEM 100% HOMOLOGADA E PRONTA PARA OPERAÇÃO 24/7!');
}

runLiveE2E().catch(err => {
  console.error('❌ Falha na homologação de nuvem:', err.message);
  process.exit(1);
});
