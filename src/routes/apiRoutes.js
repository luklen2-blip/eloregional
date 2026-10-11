import { Router } from 'express';
import { REGIOES_BRASIL, CATEGORIAS_TEMATICAS } from '../db/seedData.js';
import { generatePixPayload, getPixQrCodeUrl, generateWhatsAppOrderUrl, generateWhatsAppShareUrl } from '../services/pixService.js';
import { sanitizeInput, MemoryRateLimiter } from '../services/security.js';

export function createApiRoutes({ usersDb, solutionsDb, challengesDb, matchesDb, messagesDb, subscriptionsDb, matchEngine }) {
  const router = Router();

  // Rate limiters específicos
  const authLimiter = new MemoryRateLimiter(15 * 60 * 1000, 30, 'Muitas operações de cadastro/pagamento. Aguarde alguns minutos.').middleware();
  const messageLimiter = new MemoryRateLimiter(1 * 60 * 1000, 20, 'Limite de envio de mensagens atingido. Aguarde 1 minuto.').middleware();

  // Helper para validação de período de teste de 24 horas
  const getUserTrialStatus = (user) => {
    if (!user) {
      return { isPro: false, isTrialActive: true, trialExpired: false, horasRestantes: 24 };
    }

    if (user.plano === 'pro') {
      return { isPro: true, hasAccess: true, isTrialActive: false, trialExpired: false, horasRestantes: null };
    }

    const agora = Date.now();
    const expiraMs = user.trialExpiraEm ? new Date(user.trialExpiraEm).getTime() : (new Date(user.createdAt || user.dataCadastro).getTime() + 24 * 60 * 60 * 1000);
    const diferencaMs = expiraMs - agora;
    const isTrialActive = diferencaMs > 0;
    const horasRestantes = Math.max(0, Math.ceil(diferencaMs / (1000 * 60 * 60)));

    return {
      isPro: false,
      hasAccess: isTrialActive,
      isTrialActive,
      trialExpired: !isTrialActive,
      horasRestantes,
      trialIniciadoEm: user.trialIniciadoEm,
      trialExpiraEm: user.trialExpiraEm
    };
  };

  // 0. Configurações Públicas do Sistema
  router.get('/config', (req, res) => {
    res.json({
      success: true,
      data: {
        kiwifyCheckoutUrl: process.env.KIWIFY_CHECKOUT_URL || 'https://pay.kiwify.com.br/KsTiYDG',
        planoProValor: 19.90,
        trialDuracaoHoras: 24,
        dpoContato: 'privacidade@eloregional.org.br'
      }
    });
  });

  // 1. Metadata e Taxonomia
  router.get('/regions', (req, res) => {
    res.json({ success: true, data: REGIOES_BRASIL });
  });

  router.get('/categories', (req, res) => {
    res.json({ success: true, data: CATEGORIAS_TEMATICAS });
  });

  // 2. Catálogo de Soluções
  router.get('/solutions', (req, res) => {
    const { categoria, regiao } = req.query;
    let solutions = solutionsDb.findAll();
    if (categoria) {
      solutions = solutions.filter(s => s.categoria === categoria);
    }
    if (regiao) {
      solutions = solutions.filter(s => s.regiaoOrigem === regiao.toLowerCase());
    }
    res.json({ success: true, total: solutions.length, data: solutions });
  });

  router.get('/solutions/:id', (req, res) => {
    const sol = solutionsDb.findById(req.params.id);
    if (!sol) {
      return res.status(404).json({ success: false, error: 'Solução não encontrada' });
    }

    const { userId } = req.query;
    let trialStatus = { hasAccess: true, isTrialActive: true, trialExpired: false };
    let responseSol = { ...sol };

    if (userId && userId !== 'anonimo') {
      const user = usersDb.findById(userId);
      trialStatus = getUserTrialStatus(user);

      // Bloqueio pós-trial para contas gratuitas
      if (trialStatus.trialExpired && !trialStatus.isPro) {
        responseSol.contatoWhatsapp = 'PROTEGIDO_POS_TRIAL';
        responseSol.contatoBloqueado = true;
      }
    }

    res.json({
      success: true,
      data: responseSol,
      trialStatus: {
        status: trialStatus.trialExpired ? 'TRIAL_EXPIRED' : 'ACTIVE',
        upgradeRequired: trialStatus.trialExpired,
        horasRestantes: trialStatus.horasRestantes
      }
    });
  });

  // Rota de Compartilhamento Viral no WhatsApp
  router.get('/solutions/:id/share', (req, res) => {
    const sol = solutionsDb.findById(req.params.id);
    if (!sol) {
      return res.status(404).json({ success: false, error: 'Solução não encontrada' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const publicUrl = `${protocol}://${host}/#solucao-${sol.id}`;

    const shareUrl = generateWhatsAppShareUrl({
      titulo: sol.titulo,
      regiaoOrigem: sol.regiaoOrigem,
      ufOrigem: sol.ufOrigem,
      publicUrl
    });

    res.json({
      success: true,
      data: {
        solucaoId: sol.id,
        titulo: sol.titulo,
        shareUrl,
        publicUrl
      }
    });
  });

  // 3. Usuários / Onboarding com Registro de Trial 24H e Consentimento LGPD
  router.post('/users', authLimiter, (req, res) => {
    const { nome, regiao, uf, municipio, areaInteresse, whatsapp, consentimentoLgpd } = req.body;
    
    if (!nome || !regiao || !areaInteresse) {
      return res.status(400).json({
        success: false,
        error: 'Nome, Região e Área de Interesse são obrigatórios para o onboarding.'
      });
    }

    if (consentimentoLgpd === false) {
      return res.status(400).json({
        success: false,
        error: 'O consentimento com os Termos de Uso e Política de Privacidade é obrigatório conforme a LGPD.'
      });
    }

    const agora = Date.now();
    const trialDuracaoMs = 24 * 60 * 60 * 1000;

    const cleanNome = sanitizeInput(nome, 80);
    const cleanMunicipio = sanitizeInput(municipio, 100);
    const cleanWhatsapp = (whatsapp || '').replace(/\D/g, '').slice(0, 15);

    const newUser = usersDb.insert({
      nome: cleanNome,
      regiao: regiao.toLowerCase(),
      uf: (uf || '').toUpperCase().slice(0, 2),
      municipio: cleanMunicipio,
      areaInteresse,
      whatsapp: cleanWhatsapp,
      plano: 'gratuito',
      consentimentoLgpd: true,
      consentimentoData: new Date(agora).toISOString(),
      trialIniciadoEm: new Date(agora).toISOString(),
      trialExpiraEm: new Date(agora + trialDuracaoMs).toISOString(),
      dataCadastro: new Date(agora).toISOString()
    });

    res.status(201).json({
      success: true,
      data: newUser,
      trialStatus: {
        isTrialActive: true,
        horasRestantes: 24,
        trialExpiraEm: newUser.trialExpiraEm
      }
    });
  });

  router.get('/users/:id', (req, res) => {
    const user = usersDb.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    const trialStatus = getUserTrialStatus(user);
    res.json({ success: true, data: user, trialStatus });
  });

  router.get('/users/:id/trial', (req, res) => {
    const user = usersDb.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    const trialStatus = getUserTrialStatus(user);
    res.json({ success: true, data: trialStatus });
  });

  // Exclusão de Dados Pessoais (Direito do Titular - Art. 18 LGPD)
  router.delete('/users/:id', authLimiter, (req, res) => {
    const user = usersDb.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    // Anonimizar desafios associados
    const userChallenges = challengesDb.findAll(c => c.userId === user.id);
    userChallenges.forEach(ch => {
      challengesDb.update(ch.id, {
        userId: 'anonimo_lgpd',
        autorAnonimizado: true
      });
    });

    // Excluir registro do usuário
    usersDb.delete(user.id);

    res.json({
      success: true,
      message: 'Dados pessoais eliminados com sucesso em conformidade com o Artigo 18 da Lei Geral de Proteção de Dados (LGPD).'
    });
  });

  // 4. Desafios Regionais e Motor de Match
  router.post('/challenges', (req, res) => {
    const { userId, titulo, descricao, categoria, regiao, uf, municipio, bioma } = req.body;

    if (!titulo || !descricao || !categoria || !regiao) {
      return res.status(400).json({
        success: false,
        error: 'Título, descrição, categoria e região são campos obrigatórios.'
      });
    }

    const cleanTitulo = sanitizeInput(titulo, 150);
    const cleanDescricao = sanitizeInput(descricao, 2000);
    const cleanMunicipio = sanitizeInput(municipio, 100);

    const challenge = challengesDb.insert({
      userId: userId || 'anonimo',
      titulo: cleanTitulo,
      descricao: cleanDescricao,
      categoria,
      regiao: regiao.toLowerCase(),
      uf: (uf || '').toUpperCase().slice(0, 2),
      municipio: cleanMunicipio,
      bioma: bioma || '',
      status: 'desafio_cadastrado',
      historicoStatus: [
        { status: 'desafio_cadastrado', data: new Date().toISOString(), nota: 'Desafio publicado na rede nacional' }
      ]
    });

    const matches = matchEngine.findMatchesForChallenge(challenge);

    matches.slice(0, 5).forEach(m => {
      matchesDb.insert({
        challengeId: challenge.id,
        solutionId: m.solutionId,
        matchScore: m.matchScore,
        reasons: m.reasons,
        interRegional: m.interRegional,
        createdAt: new Date().toISOString()
      });
    });

    res.status(201).json({
      success: true,
      data: {
        challenge,
        matches: matches.slice(0, 5)
      }
    });
  });

  router.get('/challenges', (req, res) => {
    const { userId } = req.query;
    let list = challengesDb.findAll();
    if (userId) {
      list = list.filter(c => c.userId === userId);
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, total: list.length, data: list });
  });

  router.get('/challenges/:id', (req, res) => {
    const challenge = challengesDb.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Desafio não encontrado' });
    }

    const matches = matchEngine.findMatchesForChallenge(challenge);

    res.json({
      success: true,
      data: {
        challenge,
        matches: matches.slice(0, 6)
      }
    });
  });

  router.post('/challenges/:id/status', (req, res) => {
    const { status, nota } = req.body;
    const challenge = challengesDb.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Desafio não encontrado' });
    }

    const historico = challenge.historicoStatus || [];
    historico.push({
      status,
      data: new Date().toISOString(),
      nota: sanitizeInput(nota || `Status atualizado para ${status}`, 300)
    });

    const updated = challengesDb.update(challenge.id, {
      status,
      historicoStatus: historico
    });

    res.json({ success: true, data: updated });
  });

  // 5. Interação & Mensagens com Bloqueio Pós-Trial e Sanitização
  router.get('/messages/:matchId', (req, res) => {
    const messages = messagesDb.findAll(m => m.matchId === req.params.matchId);
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    res.json({ success: true, total: messages.length, data: messages });
  });

  router.post('/messages', messageLimiter, (req, res) => {
    const { matchId, challengeId, userId, autorNome, autorTipo, texto } = req.body;
    if (!matchId || !autorNome || !texto) {
      return res.status(400).json({ success: false, error: 'matchId, autorNome e texto são obrigatórios.' });
    }

    // Enforcement do Trial de 24h para envio de mensagens
    if (userId && userId !== 'anonimo') {
      const user = usersDb.findById(userId);
      const trialStatus = getUserTrialStatus(user);

      if (trialStatus.trialExpired && !trialStatus.isPro) {
        return res.status(403).json({
          success: false,
          status: 'TRIAL_EXPIRED',
          upgradeRequired: true,
          error: 'Seu período de teste gratuito de 24 horas encerrou. Faça upgrade para o plano Conexão Pro para continuar interagindo com os mentores.'
        });
      }
    }

    const cleanTexto = sanitizeInput(texto, 1000);
    const cleanNome = sanitizeInput(autorNome, 60);

    const msg = messagesDb.insert({
      matchId,
      challengeId: challengeId || '',
      userId: userId || '',
      autorNome: cleanNome,
      autorTipo: autorTipo || 'comunidade',
      texto: cleanTexto,
      lida: false
    });

    if (challengeId) {
      const ch = challengesDb.findById(challengeId);
      if (ch && (ch.status === 'desafio_cadastrado' || ch.status === 'match_conectado')) {
        challengesDb.update(ch.id, {
          status: 'em_dialogo',
          historicoStatus: [
            ...(ch.historicoStatus || []),
            { status: 'em_dialogo', data: new Date().toISOString(), nota: 'Diálogo iniciado com especialista da solução' }
          ]
        });
      }
    }

    res.status(201).json({ success: true, data: msg });
  });

  // 6. Modelo de Negócio / Checkout PIX Nativo e Kiwify com Rate Limiting
  router.post('/checkout/pix', authLimiter, (req, res) => {
    const { userId, planoId = 'pro', customerName = 'Produtor Parceiro', customerPhone = '' } = req.body;

    const planos = {
      pro: { nome: 'Conexão Brasil Pro (Vitalício)', valor: 19.90, duracao: 'vitalicio' },
      avulso: { nome: 'Mentoria Técnica Avulsa', valor: 14.90, duracao: 'sessao' }
    };

    const selecionado = planos[planoId] || planos.pro;
    const txId = 'ELO' + Math.floor(10000000 + Math.random() * 90000000);

    const cleanCustomerName = sanitizeInput(customerName, 50);

    const pixPayload = generatePixPayload({
      pixKey: 'pix@eloregional.org.br',
      name: 'EloRegional Brasil',
      city: 'Brasilia',
      amount: selecionado.valor,
      txId
    });

    const qrCodeUrl = getPixQrCodeUrl(pixPayload);
    const whatsappUrl = generateWhatsAppOrderUrl({
      phone: customerPhone,
      customerName: cleanCustomerName,
      planTitle: selecionado.nome,
      amount: selecionado.valor,
      txId
    });

    const sub = subscriptionsDb.insert({
      userId: userId || 'anonimo',
      planoId,
      planoNome: selecionado.nome,
      valor: selecionado.valor,
      txId,
      pixPayload,
      status: 'pendente',
      criadoEm: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        subscriptionId: sub.id,
        txId,
        plano: selecionado,
        pixPayload,
        qrCodeUrl,
        whatsappUrl,
        kiwifyCheckoutUrl: process.env.KIWIFY_CHECKOUT_URL || 'https://pay.kiwify.com.br/KsTiYDG'
      }
    });
  });

  router.post('/checkout/verify', authLimiter, (req, res) => {
    const { subscriptionId, txId, userId } = req.body;
    let sub = null;

    if (subscriptionId) {
      sub = subscriptionsDb.findById(subscriptionId);
    } else if (txId) {
      sub = subscriptionsDb.findOne(s => s.txId === txId);
    }

    if (!sub) {
      return res.status(404).json({ success: false, error: 'Transação PIX não encontrada' });
    }

    const updated = subscriptionsDb.update(sub.id, {
      status: 'pago',
      pagoEm: new Date().toISOString()
    });

    if (userId || sub.userId) {
      const uid = userId || sub.userId;
      usersDb.update(uid, { plano: 'pro' });
    }

    res.json({
      success: true,
      message: 'Pagamento PIX confirmado com sucesso! Acesso Pro vitalício ativado.',
      data: updated
    });
  });

  return router;
}
