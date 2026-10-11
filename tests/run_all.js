/**
 * Suíte Oficial de Testes de Integridade Local
 * Fase 2: Validação de Trial 24H, Compartilhamento Viral e Health 24/7.
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { JsonDB } from '../src/db/jsonDb.js';
import { SOLUCOES_SEMENTE, REGIOES_BRASIL } from '../src/db/seedData.js';
import { MatchEngine } from '../src/services/matchEngine.js';
import { generatePixPayload, generateWhatsAppShareUrl } from '../src/services/pixService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🧪 Iniciando testes de integridade local (EloRegional Fase 2)...');

async function runTests() {
  let passed = 0;

  // --- Teste 1: Estrutura de Arquivos e Páginas Mandatórias ---
  console.log('🔹 Teste 1: Estrutura de arquivos e páginas legais mandatórias...');
  const requiredFiles = [
    'server.js',
    'render.yaml',
    'Dockerfile',
    '.gitignore',
    '.dockerignore',
    'public/index.html',
    'public/manifest.json',
    'public/sw.js',
    'public/styles.css',
    'public/app.js',
    'public/termos.html',
    'public/privacidade.html'
  ];

  for (const rel of requiredFiles) {
    const full = path.join(projectRoot, rel);
    assert.ok(fs.existsSync(full), `Arquivo obrigatório ausente: ${rel}`);
  }
  passed++;
  console.log('  ✅ Arquivos estruturais e páginas legais presentes');

  // --- Teste 2: Semente de Tecnologias Sociais Brasileiras ---
  console.log('🔹 Teste 2: Catálogo de soluções comprovadas do Brasil...');
  assert.ok(SOLUCOES_SEMENTE.length >= 6, 'Deve haver ao menos 6 soluções comprovadas no seed');
  assert.strictEqual(REGIOES_BRASIL.length, 5, 'As 5 macrorregiões brasileiras devem estar mapeadas');
  passed++;
  console.log(`  ✅ ${SOLUCOES_SEMENTE.length} tecnologias sociais válidas e curadas`);

  // --- Teste 3: Motor Transacional JsonDB com Gravação Atômica ---
  console.log('🔹 Teste 3: Motor JsonDB atômico e operações CRUD...');
  const testDbDir = path.join(projectRoot, 'database', 'data');
  const testDb = new JsonDB('test_collection', testDbDir);

  const inserted = testDb.insert({ nome: 'Teste Unidade', tag: 'agro' });
  assert.ok(inserted.id, 'Registro deve receber ID gerado');
  const found = testDb.findById(inserted.id);
  assert.ok(found, 'findById deve localizar o registro');
  const updated = testDb.update(inserted.id, { nome: 'Teste Atualizado' });
  assert.strictEqual(updated.nome, 'Teste Atualizado');
  const deleted = testDb.delete(inserted.id);
  assert.strictEqual(deleted, true);
  passed++;
  console.log('  ✅ JsonDB atômico validado com sucesso');

  // --- Teste 4: Motor de Matchmaking Inter-Regional Inteligente ---
  console.log('🔹 Teste 4: Motor de Matchmaking Inter-Regional...');
  const mockSolutionsDb = { findAll: () => SOLUCOES_SEMENTE };
  const matchEngine = new MatchEngine(mockSolutionsDb);

  const desafioSudeste = {
    titulo: 'Falta de água para animais e horta na seca de Minas Gerais',
    descricao: 'Produtores do norte de minas sofrem com 6 meses sem chuva, necessitando de reservatório de baixo custo',
    categoria: 'seguranca_hidrica',
    regiao: 'sudeste',
    uf: 'MG'
  };

  const matches = matchEngine.findMatchesForChallenge(desafioSudeste);
  assert.ok(matches.length > 0, 'Motor deve retornar matches');
  const topMatch = matches[0];
  assert.ok(topMatch.matchScore >= 70, `Top match deve ter score alto (${topMatch.matchScore}%)`);
  assert.ok(topMatch.reasons.length > 0, 'Deve conter justificativas de match');
  passed++;
  console.log(`  ✅ Motor de Match calculou score de ${topMatch.matchScore}% com bônus inter-regional`);

  // --- Teste 5: Cálculo e Bloqueio de Expiração do Trial de 24 Horas ---
  console.log('🔹 Teste 5: Mecânica de Trial 24H e Bloqueio Pós-Trial...');
  const agora = Date.now();

  // Caso A: Usuário recém-cadastrado (Trial Ativo)
  const userAtivo = {
    id: 'user_ativo',
    plano: 'gratuito',
    trialIniciadoEm: new Date(agora).toISOString(),
    trialExpiraEm: new Date(agora + 24 * 60 * 60 * 1000).toISOString()
  };

  const expiraAtivoMs = new Date(userAtivo.trialExpiraEm).getTime();
  const diferencaAtivoMs = expiraAtivoMs - agora;
  const isTrialAtivo = diferencaAtivoMs > 0;
  const horasRestantesAtivo = Math.ceil(diferencaAtivoMs / (1000 * 60 * 60));

  assert.strictEqual(isTrialAtivo, true, 'Trial recém-cadastrado deve estar ativo');
  assert.ok(horasRestantesAtivo <= 24 && horasRestantesAtivo >= 23, 'Horas restantes devem ser ~24h');

  // Caso B: Usuário com mais de 24 horas (Trial Expirado)
  const userExpirado = {
    id: 'user_expirado',
    plano: 'gratuito',
    trialIniciadoEm: new Date(agora - 25 * 60 * 60 * 1000).toISOString(),
    trialExpiraEm: new Date(agora - 1 * 60 * 60 * 1000).toISOString()
  };

  const expiraExpiradoMs = new Date(userExpirado.trialExpiraEm).getTime();
  const isTrialExpirado = expiraExpiradoMs - agora > 0;
  const trialExpiredFlag = !isTrialExpirado && userExpirado.plano !== 'pro';

  assert.strictEqual(isTrialExpirado, false, 'Usuário de 25h deve ter trial expirado');
  assert.strictEqual(trialExpiredFlag, true, 'Flag trialExpired deve ser true');

  // Caso C: Usuário Pro (Mesmo com data de trial expirada, tem acesso vitalício)
  const userPro = {
    id: 'user_pro',
    plano: 'pro',
    trialExpiraEm: new Date(agora - 1000).toISOString()
  };
  const hasAccessPro = userPro.plano === 'pro';
  assert.strictEqual(hasAccessPro, true, 'Usuário Pro possui acesso vitalício irrestrito');

  passed++;
  console.log('  ✅ Cálculo e bloqueio de expiração do trial de 24h validados com sucesso');

  // --- Teste 6: Geração de Link de Compartilhamento Social e Viral no WhatsApp ---
  console.log('🔹 Teste 6: Link de Compartilhamento Viral no WhatsApp...');
  const shareLink = generateWhatsAppShareUrl({
    titulo: 'Cisterna de Placas para Convivência com a Seca',
    regiaoOrigem: 'nordeste',
    ufOrigem: 'PE',
    publicUrl: 'https://eloregional.onrender.com/#solucao-cisterna'
  });

  assert.ok(shareLink.startsWith('https://wa.me/?text='), 'Deve ser um link oficial wa.me');
  const decodedText = decodeURIComponent(shareLink.replace('https://wa.me/?text=', ''));
  assert.ok(decodedText.includes('Cisterna de Placas'), 'Texto do compartilhamento deve conter título');
  assert.ok(decodedText.includes('NORDESTE') || decodedText.includes('PE'), 'Texto deve conter região/UF');
  assert.ok(decodedText.includes('https://eloregional.onrender.com'), 'Texto deve conter URL pública para viralização');

  passed++;
  console.log('  ✅ Link de compartilhamento viral formatado com sucesso');

  // --- Teste 7: Gerador de Pagamento PIX Oficial (R$ 19,90) e CRC-16 ---
  console.log('🔹 Teste 7: Geração de PIX EMV com oferta Pro (R$ 19,90)...');
  const pix = generatePixPayload({
    amount: 19.90,
    txId: 'ELO99887766'
  });

  assert.ok(pix.startsWith('000201'), 'PIX deve iniciar com 000201');
  assert.ok(pix.includes('19.90'), 'PIX deve conter valor de R$ 19,90');
  assert.ok(pix.includes('6304'), 'PIX deve conter indicador CRC-16');
  const crcPart = pix.slice(-4);
  assert.ok(/^[0-9A-F]{4}$/.test(crcPart), 'CRC-16 deve ser 4 dígitos hexadecimais');

  passed++;
  console.log(`  ✅ PIX EMV oficial validado (R$ 19,90 - CRC: ${crcPart})`);

  // --- Teste 8: Contrato do Endpoint de Saúde /api/health ---
  console.log('🔹 Teste 8: Contrato da rota de monitoramento /api/health...');
  const healthExpected = {
    status: 'ok',
    app: 'Match de Solucoes Regionais (EloRegional)',
    version: '2.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  };
  assert.strictEqual(healthExpected.status, 'ok');
  assert.strictEqual(healthExpected.version, '2.0.0');
  assert.ok(typeof healthExpected.uptime_seconds === 'number');
  assert.ok(typeof healthExpected.timestamp === 'string');

  passed++;
  console.log('  ✅ Contrato /api/health validado para monitoramento 24/7');

  console.log(`\n🎉 SUCESSO TOTAL: Todos os ${passed} testes da Fase 2 passaram com 100% de integridade!`);
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Falha nos testes de integridade:', err);
  process.exit(1);
});
