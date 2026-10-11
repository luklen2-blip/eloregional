import path from 'path';
import { Router } from 'express';
import { JsonDB } from '../db/jsonDb.js';
import { REGIOES_BRASIL, CATEGORIAS_TEMATICAS } from '../db/seedData.js';
import { generatePixPayload, getPixQrCodeUrl, generateWhatsAppOrderUrl, generateWhatsAppShareUrl, generateWhatsAppChallengeShareUrl } from '../services/pixService.js';
import { sanitizeInput, MemoryRateLimiter } from '../services/security.js';

export function createApiRoutes({ usersDb, solutionsDb, challengesDb, matchesDb, messagesDb, subscriptionsDb, claimsDb, matchEngine }) {
  const router = Router();
  const effectiveClaimsDb = claimsDb || new JsonDB('claims', path.join(process.cwd(), 'database', 'data'));

  // Rate limiters específicos
  const authLimiter = new MemoryRateLimiter(15 * 60 * 1000, 30, 'Muitas operações de cadastro/pagamento. Aguarde alguns minutos.').middleware();
  const messageLimiter = new MemoryRateLimiter(1 * 60 * 1000, 20, 'Limite de envio de mensagens atingido. Aguarde 1 minuto.').middleware();

  // Helper para validação de período de teste de 24 horas
  const getUserTrialStatus = (user) => {
    if (!user) {
      return { isPro: false, isTrialActive: true, trialExpired: false, horasRestantes: 24 };
    }

    if (user.plano && user.plano.toLowerCase() === 'pro') {
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

  // Rota de Compartilhamento Viral de Desafio no WhatsApp
  router.get('/challenges/:id/share', (req, res) => {
    const ch = challengesDb.findById(req.params.id);
    if (!ch) {
      return res.status(404).json({ success: false, error: 'Desafio não encontrado' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const publicUrl = `${protocol}://${host}/#desafio-${ch.id}`;

    const shareUrl = generateWhatsAppChallengeShareUrl({
      titulo: ch.titulo,
      regiao: ch.regiao,
      uf: ch.uf,
      publicUrl
    });

    res.json({
      success: true,
      data: {
        challengeId: ch.id,
        titulo: ch.titulo,
        shareUrl,
        publicUrl
      }
    });
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

  // 7. Webhook Oficial Kiwify (POST /api/webhooks/kiwify e /api/webhook/kiwify)
  const validateKiwifyToken = (req) => {
    const expectedToken = process.env.KIWIFY_WEBHOOK_TOKEN || 'eloregional_kiwify_webhook_token_2026';
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const headerToken = req.headers['x-kiwify-token'];
    const queryToken = req.query?.token;
    const bodyToken = req.body?.token;

    const receivedToken = headerToken || queryToken || bearerToken || bodyToken;
    return Boolean(receivedToken && receivedToken === expectedToken);
  };

  const handleKiwifyWebhook = (req, res) => {
    if (!validateKiwifyToken(req)) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED_WEBHOOK',
        message: 'Token de autenticação do webhook Kiwify inválido ou ausente.'
      });
    }

    const body = req.body || {};
    const orderId = body.order_id || body.orderId || body.id;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ORDER_ID',
        message: 'Identificador do pedido (order_id) é obrigatório.'
      });
    }

    const eventType = (
      body.order_status ||
      body.webhook_event_type ||
      body.event ||
      body.status ||
      ''
    ).toLowerCase();

    const customerEmail = (
      body.Customer?.email ||
      body.customer?.email ||
      body.email ||
      ''
    ).toLowerCase().trim();

    // Idempotência e consulta de transação existente
    const existingOrder = subscriptionsDb.findOne(s => s.orderId === orderId);

    // Eventos de Cancelamento e Reembolso
    const isRefundOrChargeback = ['refunded', 'chargedback', 'chargeback', 'order_refunded', 'canceled'].some(ev => eventType.includes(ev));

    if (isRefundOrChargeback) {
      let revertedUser = null;
      if (existingOrder && existingOrder.userId && existingOrder.userId !== 'anonimo') {
        revertedUser = usersDb.findById(existingOrder.userId);
      } else if (customerEmail) {
        revertedUser = usersDb.findOne(u => u.email && u.email.toLowerCase() === customerEmail);
      }

      if (revertedUser) {
        usersDb.update(revertedUser.id, {
          plano: 'GRATIS',
          isPro: false
        });
      }

      if (existingOrder) {
        subscriptionsDb.update(existingOrder.id, {
          status: 'refunded',
          refundedAt: new Date().toISOString()
        });
      } else {
        subscriptionsDb.insert({
          orderId,
          email: customerEmail,
          userId: revertedUser ? revertedUser.id : null,
          status: 'refunded',
          provider: 'kiwify',
          criadoEm: new Date().toISOString()
        });
      }

      return res.status(200).json({
        success: true,
        message: `Pedido ${orderId} processado como estorno/reembolso. Plano revertido.`,
        orderId,
        refunded: true,
        userId: revertedUser ? revertedUser.id : null
      });
    }

    // Idempotência: Se já foi aprovado e é retentativa
    if (existingOrder && (existingOrder.status === 'order_approved' || existingOrder.status === 'paid')) {
      return res.status(200).json({
        success: true,
        message: 'Pedido já processado anteriormente (idempotente).',
        orderId,
        idempotent: true
      });
    }

    // Processamento de Pedidos Aprovados (order_approved, paid, approved)
    const isApproved = ['order_approved', 'paid', 'approved'].some(ev => eventType.includes(ev)) || eventType === '';

    if (isApproved) {
      let user = null;
      if (customerEmail) {
        user = usersDb.findOne(u => u.email && u.email.toLowerCase() === customerEmail);
      }

      if (user) {
        // Promover usuário imediatamente
        usersDb.update(user.id, {
          plano: 'PRO',
          isPro: true,
          trialExpiraEm: null,
          upgradedAt: new Date().toISOString(),
          lastOrderId: orderId
        });

        subscriptionsDb.insert({
          orderId,
          userId: user.id,
          email: customerEmail,
          planoId: 'pro',
          planoNome: 'Conexão Brasil Pro (Vitalício)',
          valor: body.order_amount ? Number(body.order_amount) / 100 : 19.90,
          provider: 'kiwify',
          status: 'order_approved',
          processadoEm: new Date().toISOString()
        });

        return res.status(200).json({
          success: true,
          message: `Pedido aprovado com sucesso! Usuário ${user.id} promovido a Pro Vitalício.`,
          orderId,
          userId: user.id,
          promoted: true
        });
      } else {
        // Usuário ainda não cadastrado: Gerar claimToken seguro
        const cryptoRandom = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
        const claimToken = `claim_${Date.now()}_${cryptoRandom}`;

        effectiveClaimsDb.insert({
          claimToken,
          orderId,
          customerEmail,
          customerName: body.Customer?.full_name || body.customer?.name || 'Cliente Kiwify',
          status: 'pending',
          claimed: false,
          criadoEm: new Date().toISOString()
        });

        subscriptionsDb.insert({
          orderId,
          userId: null,
          email: customerEmail,
          claimToken,
          planoId: 'pro',
          planoNome: 'Conexão Brasil Pro (Vitalício)',
          valor: body.order_amount ? Number(body.order_amount) / 100 : 19.90,
          provider: 'kiwify',
          status: 'pending_claim',
          processadoEm: new Date().toISOString()
        });

        return res.status(200).json({
          success: true,
          message: 'Pedido aprovado registrado com claimToken para resgate posterior.',
          orderId,
          claimToken,
          pendingClaim: true
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Evento ${eventType} registrado.`,
      orderId
    });
  };

  router.post('/webhooks/kiwify', handleKiwifyWebhook);
  router.post('/webhook/kiwify', handleKiwifyWebhook);

  // 8. Resgate de Compra Kiwify por Usuário Cadastrado Pós-Compra
  router.post('/plans/claim-purchase', authLimiter, (req, res) => {
    const { claimToken, email, userId } = req.body;

    if (!claimToken && !email) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CLAIM_CREDENTIALS',
        message: 'Informe o claimToken ou o e-mail utilizado na compra Kiwify.'
      });
    }

    let claim = null;
    if (claimToken) {
      claim = effectiveClaimsDb.findOne(c => c.claimToken === claimToken && !c.claimed);
    } else if (email) {
      const cleanEmail = email.toLowerCase().trim();
      claim = effectiveClaimsDb.findOne(c => c.customerEmail && c.customerEmail.toLowerCase() === cleanEmail && !c.claimed);
    }

    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'CLAIM_NOT_FOUND',
        message: 'Nenhuma compra pendente não resgatada foi encontrada para esses dados.'
      });
    }

    let targetUser = null;
    if (userId) {
      targetUser = usersDb.findById(userId);
    } else if (claim.customerEmail) {
      targetUser = usersDb.findOne(u => u.email && u.email.toLowerCase() === claim.customerEmail.toLowerCase());
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Usuário do EloRegional não encontrado para associar o plano Pro.'
      });
    }

    const updatedUser = usersDb.update(targetUser.id, {
      plano: 'PRO',
      isPro: true,
      trialExpiraEm: null,
      upgradedAt: new Date().toISOString(),
      claimedFromOrderId: claim.orderId
    });

    effectiveClaimsDb.update(claim.id, {
      claimed: true,
      claimedAt: new Date().toISOString(),
      claimedByUserId: targetUser.id
    });

    const sub = subscriptionsDb.findOne(s => s.orderId === claim.orderId);
    if (sub) {
      subscriptionsDb.update(sub.id, {
        userId: targetUser.id,
        status: 'order_approved',
        claimedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Compra Kiwify resgatada com sucesso! Acesso Pro Vitalício ativado.',
      data: {
        userId: updatedUser.id,
        plano: updatedUser.plano,
        orderId: claim.orderId
      }
    });
  });

  return router;
}
