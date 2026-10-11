/**
 * EloRegional - Controlador Client-side da Aplicação (PWA)
 * Auditado: Segurança OWASP, Conformidade LGPD Art. 14/18, Trial 24H e Toasts Reativos
 */

class EloRegionalApp {
  constructor() {
    this.currentUser = JSON.parse(localStorage.getItem('eloregional_user') || 'null');
    this.config = { kiwifyCheckoutUrl: 'https://pay.kiwify.com.br/KsTiYDG', planoProValor: 19.90, trialDuracaoHoras: 24 };
    this.regions = [];
    this.categories = [];
    this.currentMatches = [];
    this.currentChallenge = null;
    this.activeMatch = null;
    this.activeSolution = null;
    this.currentTx = null;

    this.init();
  }

  async init() {
    this.registrarServiceWorker();
    await this.carregarMetadados();
    await this.carregarConfiguracoes();
    await this.atualizarStatusTrial();
    this.atualizarHeaderUsuario();
    this.carregarMeusDesafios();
    this.carregarBiblioteca();

    // Se o usuário ainda não tiver perfil, abre o onboarding
    if (!this.currentUser) {
      setTimeout(() => this.abrirModalOnboarding(), 400);
    } else {
      this.preencherDadosUsuarioNosForms();
    }
  }

  escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.padding = '12px 18px';
    toast.style.borderRadius = '10px';
    toast.style.fontSize = '0.86rem';
    toast.style.fontWeight = '600';
    toast.style.color = 'white';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.pointerEvents = 'auto';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.transform = 'translateY(10px)';
    toast.style.opacity = '0';

    if (tipo === 'sucesso') {
      toast.style.background = '#047857';
    } else if (tipo === 'erro') {
      toast.style.background = '#dc2626';
    } else if (tipo === 'aviso') {
      toast.style.background = '#d97706';
    } else {
      toast.style.background = '#1e293b';
    }

    toast.textContent = mensagem;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(() => console.log('✅ ServiceWorker registrado com sucesso!'))
          .catch(err => console.log('SW registration note:', err.message));
      });
    }
  }

  async carregarConfiguracoes() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success) {
        this.config = data.data;
        if (this.config.kiwifyCheckoutUrl) {
          const kiwifyBtn = document.getElementById('btnKiwifyLink');
          if (kiwifyBtn) {
            kiwifyBtn.href = this.config.kiwifyCheckoutUrl;
            kiwifyBtn.style.display = 'block';
          }
        }
      }
    } catch (err) {
      console.log('Nota config:', err.message);
    }
  }

  async carregarMetadados() {
    try {
      const [resReg, resCat] = await Promise.all([
        fetch('/api/regions').then(r => r.json()),
        fetch('/api/categories').then(r => r.json())
      ]);

      if (resReg.success) this.regions = resReg.data;
      if (resCat.success) this.categories = resCat.data;
    } catch (err) {
      console.error('Erro ao carregar metadados:', err);
    }
  }

  async atualizarStatusTrial() {
    if (!this.currentUser || !this.currentUser.id) return;
    try {
      const res = await fetch(`/api/users/${this.currentUser.id}/trial`);
      const data = await res.json();
      if (data.success) {
        this.currentUser.trialStatus = data.data;
        if (data.data.isPro) this.currentUser.plano = 'pro';
        localStorage.setItem('eloregional_user', JSON.stringify(this.currentUser));
      }
    } catch (err) {
      console.log('Trial check note:', err.message);
    }
  }

  trocarAba(abaId) {
    document.querySelectorAll('.tab-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const view = document.getElementById(`view-${abaId}`);
    const btn = document.getElementById(`tab-${abaId}`);

    if (view) view.style.display = 'block';
    if (btn) btn.classList.add('active');

    if (abaId === 'meus-desafios') {
      this.carregarMeusDesafios();
    } else if (abaId === 'biblioteca') {
      this.carregarBiblioteca();
    }
  }

  // --- Onboarding & Perfil LGPD ---
  abrirModalOnboarding() {
    document.getElementById('modalOnboarding').classList.add('active');
  }

  fecharModalOnboarding() {
    document.getElementById('modalOnboarding').classList.remove('active');
  }

  abrirModalPerfil() {
    if (!this.currentUser) {
      this.abrirModalOnboarding();
      return;
    }

    const modal = document.getElementById('modalPerfilUsuario');
    const nomeDisp = document.getElementById('perfilNomeDisplay');
    const badge = document.getElementById('perfilStatusBadge');
    const box = document.getElementById('perfilDetalhesBox');

    nomeDisp.textContent = this.escapeHtml(this.currentUser.nome);
    const isPro = this.currentUser.plano === 'pro';

    badge.textContent = isPro ? '⭐ Membro Pro Vitalício' : 'Plano Gratuito (Trial)';
    badge.style.background = isPro ? '#dcfce7' : '#fef3c7';
    badge.style.color = isPro ? '#15803d' : '#92400e';

    const ts = this.currentUser.trialStatus;
    const infoTrial = isPro
      ? 'Acesso irrestrito vitalício ativo'
      : (ts && ts.trialExpired ? '⚠️ Período de 24h expirado' : `⏳ ${ts ? ts.horasRestantes : 24} horas restantes no Trial`);

    box.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>Região/UF:</strong> ${(this.escapeHtml(this.currentUser.uf || this.currentUser.regiao)).toUpperCase()} ${this.currentUser.municipio ? `- ${this.escapeHtml(this.currentUser.municipio)}` : ''}</div>
      <div style="margin-bottom: 8px;"><strong>Área Prioritária:</strong> ${this.escapeHtml(this.currentUser.areaInteresse || 'Não informada')}</div>
      <div style="margin-bottom: 8px;"><strong>Status do Acesso:</strong> ${infoTrial}</div>
      <div style="font-size: 0.74rem; color: #64748b; margin-top: 10px; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
        🔒 Seus dados estão protegidos de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Você pode editar ou solicitar a exclusão integral a qualquer momento.
      </div>
    `;

    modal.classList.add('active');
  }

  fecharModalPerfil() {
    const modal = document.getElementById('modalPerfilUsuario');
    if (modal) modal.classList.remove('active');
  }

  async solicitarExclusaoDadosLgpd() {
    if (!this.currentUser || !this.currentUser.id) return;

    const confirma = confirm('ATENÇÃO (Art. 18 LGPD):\n\nTem certeza de que deseja eliminar permanentemente todos os seus dados cadastrais e de contato da rede EloRegional?\n\nEsta ação é irreversível.');
    if (!confirma) return;

    try {
      const res = await fetch(`/api/users/${this.currentUser.id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        localStorage.removeItem('eloregional_user');
        this.currentUser = null;
        this.fecharModalPerfil();
        this.atualizarHeaderUsuario();
        this.mostrarToast('Dados pessoais eliminados com sucesso conforme o Art. 18 da LGPD.', 'sucesso');
        setTimeout(() => this.abrirModalOnboarding(), 1000);
      } else {
        this.mostrarToast(data.error || 'Erro ao excluir dados.', 'erro');
      }
    } catch (err) {
      this.mostrarToast('Erro de conexão ao solicitar exclusão de dados.', 'erro');
    }
  }

  atualizarUfsOnboarding() {
    const regId = document.getElementById('onboardingRegiao').value;
    const selectUf = document.getElementById('onboardingUf');
    this._popularUfs(regId, selectUf);
  }

  atualizarUfsDesafio() {
    const regId = document.getElementById('desafioRegiao').value;
    const selectUf = document.getElementById('desafioUf');
    this._popularUfs(regId, selectUf);
  }

  _popularUfs(regId, selectElem) {
    selectElem.innerHTML = '<option value="">Selecione...</option>';
    const reg = this.regions.find(r => r.id === regId);
    if (reg && reg.ufs) {
      reg.ufs.forEach(uf => {
        const opt = document.createElement('option');
        opt.value = uf;
        opt.textContent = uf;
        selectElem.appendChild(opt);
      });
    }
  }

  async salvarOnboarding(e) {
    e.preventDefault();
    const consentimento = document.getElementById('onboardingConsentimentoLgpd');
    if (!consentimento || !consentimento.checked) {
      this.mostrarToast('É obrigatório concordar com os Termos de Uso e LGPD para prosseguir.', 'aviso');
      return;
    }

    const nome = document.getElementById('onboardingNome').value;
    const regiao = document.getElementById('onboardingRegiao').value;
    const uf = document.getElementById('onboardingUf').value;
    const municipio = document.getElementById('onboardingMunicipio').value;
    const areaInteresse = document.getElementById('onboardingArea').value;
    const whatsapp = document.getElementById('onboardingWhatsapp').value;

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, regiao, uf, municipio, areaInteresse, whatsapp, consentimentoLgpd: true })
      });
      const data = await res.json();
      if (data.success) {
        this.currentUser = data.data;
        this.currentUser.trialStatus = data.trialStatus;
        localStorage.setItem('eloregional_user', JSON.stringify(this.currentUser));
        this.fecharModalOnboarding();
        this.atualizarHeaderUsuario();
        this.preencherDadosUsuarioNosForms();
        this.mostrarToast(`Bem-vindo(a), ${this.currentUser.nome}! Trial de 24h ativado.`, 'sucesso');
      } else {
        this.mostrarToast(data.error || 'Erro ao salvar cadastro', 'erro');
      }
    } catch (err) {
      this.mostrarToast('Erro de conexão ao salvar perfil.', 'erro');
    }
  }

  atualizarHeaderUsuario() {
    const pillName = document.getElementById('userPillName');
    const btnPro = document.getElementById('btnProHeader');
    const trialBadge = document.getElementById('trialCountdownBadge');

    if (this.currentUser) {
      pillName.textContent = `${this.escapeHtml(this.currentUser.nome)} (${this.escapeHtml((this.currentUser.uf || this.currentUser.regiao).toUpperCase())})`;

      if (this.currentUser.plano === 'pro') {
        btnPro.textContent = '🌟 Membro Pro';
        btnPro.style.background = '#10b981';
        btnPro.style.color = '#ffffff';
        if (trialBadge) trialBadge.style.display = 'none';
      } else {
        const ts = this.currentUser.trialStatus;
        if (trialBadge) {
          trialBadge.style.display = 'inline-block';
          if (ts && ts.trialExpired) {
            trialBadge.textContent = '⚠️ Trial Expirado';
            trialBadge.style.background = '#fee2e2';
            trialBadge.style.color = '#991b1b';
            trialBadge.style.borderColor = '#fca5a5';
            trialBadge.style.cursor = 'pointer';
            trialBadge.onclick = () => this.abrirModalPro();
          } else {
            const h = ts ? ts.horasRestantes : 24;
            trialBadge.textContent = `⏳ Trial: ${h}h restantes`;
            trialBadge.style.background = '#ecfdf5';
            trialBadge.style.color = '#047857';
            trialBadge.style.borderColor = '#a7f3d0';
          }
        }
      }
    } else {
      pillName.textContent = 'Identificar-se';
      if (trialBadge) trialBadge.style.display = 'none';
    }
  }

  preencherDadosUsuarioNosForms() {
    if (!this.currentUser) return;
    const regSelect = document.getElementById('desafioRegiao');
    if (regSelect && this.currentUser.regiao) {
      regSelect.value = this.currentUser.regiao;
      this.atualizarUfsDesafio();
      const ufSelect = document.getElementById('desafioUf');
      if (ufSelect && this.currentUser.uf) {
        ufSelect.value = this.currentUser.uf;
      }
    }
    const catSelect = document.getElementById('desafioCategoria');
    if (catSelect && this.currentUser.areaInteresse) {
      catSelect.value = this.currentUser.areaInteresse;
    }
    const munInput = document.getElementById('desafioMunicipio');
    if (munInput && this.currentUser.municipio) {
      munInput.value = this.currentUser.municipio;
    }
  }

  // --- Submissão de Desafio & Motor de Match ---
  async submeterDesafio(e) {
    e.preventDefault();
    const btn = document.getElementById('btnCalcularMatch');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Calculando Afinidade Inter-Regional...</span>';

    const payload = {
      userId: this.currentUser ? this.currentUser.id : 'anonimo',
      titulo: document.getElementById('desafioTitulo').value,
      descricao: document.getElementById('desafioDescricao').value,
      categoria: document.getElementById('desafioCategoria').value,
      regiao: document.getElementById('desafioRegiao').value,
      uf: document.getElementById('desafioUf').value,
      municipio: document.getElementById('desafioMunicipio').value
    };

    try {
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        this.currentChallenge = data.data.challenge;
        this.currentMatches = data.data.matches;
        this.renderizarCardsMatches(this.currentMatches, this.currentChallenge);
        this.carregarMeusDesafios();
        this.mostrarToast('Desafio registrado e matches inter-regionais encontrados!', 'sucesso');
        document.getElementById('resultadoMatchesContainer').scrollIntoView({ behavior: 'smooth' });
      } else {
        this.mostrarToast(data.error || 'Erro ao processar desafio', 'erro');
      }
    } catch (err) {
      this.mostrarToast('Falha ao conectar com o motor de match.', 'erro');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>⚡ Rodar Match Inteligente Inter-Regional</span>';
    }
  }

  renderizarCardsMatches(matches, challenge) {
    const container = document.getElementById('resultadoMatchesContainer');
    const list = document.getElementById('listaCardsMatches');
    const infoSub = document.getElementById('matchInfoSub');

    container.style.display = 'block';
    infoSub.textContent = `${matches.length} tecnologias sociais conectadas para "${this.escapeHtml(challenge.titulo)}"`;
    list.innerHTML = '';

    if (!matches || matches.length === 0) {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b;">Nenhuma solução compatível no momento. Nossa rede foi notificada.</div>';
      return;
    }

    matches.forEach((item) => {
      const sol = item.solution || item;
      const score = item.matchScore || 85;
      const isInter = item.interRegional !== false;
      const origemUf = this.escapeHtml(sol.ufOrigem || 'BR');
      const destinoUf = this.escapeHtml(challenge.uf || 'Sua Região');

      const card = document.createElement('div');
      card.className = `match-card ${score >= 80 ? 'high-match' : ''}`;
      card.innerHTML = `
        <div class="match-badge-top">
          <div class="score-badge">
            ⚡ ${score}% Match de Solução
          </div>
          <div class="route-pill">
            ${isInter ? '🌉 Ponte Inter-Regional:' : '📍 Regional:'} ${origemUf} ➔ ${destinoUf}
          </div>
        </div>

        <h4 class="match-title">${this.escapeHtml(sol.titulo)}</h4>
        <p class="match-summary">${this.escapeHtml(sol.resumo)}</p>

        <div class="match-reasons-list">
          <strong style="display:block; font-size: 0.78rem; color: #047857; margin-bottom: 4px;">Por que deu match:</strong>
          ${(item.reasons || ['Compatibilidade com seu desafio regional']).map(r => `<span>• ${this.escapeHtml(r)}</span>`).join('')}
        </div>

        <div class="match-meta-grid">
          <div class="meta-box">
            <span>Comunidade / Autor:</span>
            <strong>${this.escapeHtml(sol.autorComunidade || sol.especialista)}</strong>
          </div>
          <div class="meta-box">
            <span>Investimento Estimado:</span>
            <strong>R$ ${(sol.custoEstimadoReais || 0).toLocaleString('pt-BR')}</strong>
          </div>
          <div class="meta-box">
            <span>Prazo de Replicação:</span>
            <strong>${sol.tempoImplementacaoDias || 5} dias</strong>
          </div>
        </div>

        <div class="match-actions">
          <button class="btn-open-guide" onclick="app.abrirGuiaPorId('${sol.id}')">
            📖 Ver Guia Passo a Passo
          </button>
          <button class="btn-start-dialog" onclick="app.iniciarDialogoMatch('${sol.id}', '${challenge.id}')">
            💬 Abrir Diálogo
          </button>
          <button class="btn-open-guide" style="background: #25d366; color: white; border: none;" onclick="app.compartilharSolucaoWhatsApp('${sol.id}')">
            📲 WhatsApp
          </button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  // --- Linha do Tempo / Meus Desafios ---
  async carregarMeusDesafios() {
    try {
      const url = this.currentUser ? `/api/challenges?userId=${this.currentUser.id}` : '/api/challenges';
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        const countSpan = document.getElementById('countMeusDesafios');
        if (countSpan) countSpan.textContent = data.total;
        this.renderizarMeusDesafios(data.data);
      }
    } catch (err) {
      console.error('Erro ao carregar desafios:', err);
    }
  }

  renderizarMeusDesafios(challenges) {
    const container = document.getElementById('listaMeusDesafiosContainer');
    if (!container) return;

    if (!challenges || challenges.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          Nenhum desafio registrado ainda. Clique na aba <strong>Novo Desafio & Match</strong> para começar!
        </div>
      `;
      return;
    }

    const stages = [
      { key: 'desafio_cadastrado', label: '1. Postado' },
      { key: 'match_conectado', label: '2. Match' },
      { key: 'em_dialogo', label: '3. Diálogo' },
      { key: 'plano_execucao', label: '4. Em Ação' },
      { key: 'resolvido', label: '5. Replicado' }
    ];

    container.innerHTML = challenges.map(c => {
      const currentIdx = stages.findIndex(s => s.key === c.status);
      const activeIdx = currentIdx >= 0 ? currentIdx : 0;

      return `
        <div class="card-box" style="margin-bottom: 20px; border-left: 4px solid var(--primary);">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <h4 style="font-size: 1.05rem; color: #0f172a;">${this.escapeHtml(c.titulo)}</h4>
            <span class="route-pill">${this.escapeHtml(c.uf || c.regiao.toUpperCase())}</span>
          </div>
          <p style="font-size: 0.85rem; color: #475569; margin-bottom: 16px;">${this.escapeHtml(c.descricao)}</p>

          <div class="pipeline-stepper">
            ${stages.map((st, idx) => {
              let cls = 'step-node';
              if (idx < activeIdx) cls += ' completed';
              else if (idx === activeIdx) cls += ' current';
              return `
                <div class="${cls}">
                  <div class="step-circle">${idx < activeIdx ? '✓' : idx + 1}</div>
                  <span class="step-label">${st.label}</span>
                </div>
              `;
            }).join('')}
          </div>

          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap;">
            <button class="btn-profile-pill" style="color: #0f172a; border-color: #cbd5e1;" onclick="app.verMatchesDesafio('${c.id}')">
              🔍 Ver Matches (${c.status})
            </button>
            ${activeIdx < 4 ? `
              <button class="btn-pro-gold" style="font-size: 0.76rem; padding: 6px 12px;" onclick="app.avancarStatusDesafio('${c.id}', '${stages[activeIdx + 1].key}')">
                ➔ Avançar para ${stages[activeIdx + 1].label}
              </button>
            ` : '<span style="color: #059669; font-weight: 700; font-size: 0.85rem;">🎉 Solução Replicada com Sucesso!</span>'}
          </div>
        </div>
      `;
    }).join('');
  }

  async avancarStatusDesafio(challengeId, novoStatus) {
    try {
      const res = await fetch(`/api/challenges/${challengeId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus, nota: `Progresso avançado na plataforma EloRegional` })
      });
      const data = await res.json();
      if (data.success) {
        this.carregarMeusDesafios();
        this.mostrarToast('Status do desafio avançado no pipeline!', 'sucesso');
      }
    } catch (err) {
      this.mostrarToast('Erro ao atualizar status', 'erro');
    }
  }

  async verMatchesDesafio(challengeId) {
    try {
      const res = await fetch(`/api/challenges/${challengeId}`);
      const data = await res.json();
      if (data.success) {
        this.currentChallenge = data.data.challenge;
        this.trocarAba('novo-desafio');
        this.renderizarCardsMatches(data.data.matches, data.data.challenge);
        document.getElementById('resultadoMatchesContainer').scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      this.mostrarToast('Erro ao carregar matches do desafio', 'erro');
    }
  }

  // --- Biblioteca de Soluções ---
  async carregarBiblioteca() {
    try {
      const cat = document.getElementById('filtroCategoriaBib') ? document.getElementById('filtroCategoriaBib').value : '';
      const reg = document.getElementById('filtroRegiaoBib') ? document.getElementById('filtroRegiaoBib').value : '';

      let query = '';
      if (cat) query += `categoria=${cat}&`;
      if (reg) query += `regiao=${reg}&`;

      const res = await fetch(`/api/solutions?${query}`);
      const data = await res.json();
      if (data.success) {
        this.renderizarCatalogo(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  filtrarBiblioteca() {
    this.carregarBiblioteca();
  }

  renderizarCatalogo(solutions) {
    const container = document.getElementById('catalogoSolucoesContainer');
    if (!container) return;

    container.innerHTML = solutions.map(sol => `
      <div class="match-card" style="margin-bottom: 14px;">
        <div class="match-badge-top">
          <span class="route-pill">Origem: ${this.escapeHtml(sol.ufOrigem)} (${this.escapeHtml(sol.regiaoOrigem.toUpperCase())})</span>
          <span style="font-size: 0.78rem; color: #059669; font-weight: 700;">${sol.replicacoesConfirmadas.toLocaleString('pt-BR')} réplicas</span>
        </div>
        <h4 class="match-title">${this.escapeHtml(sol.titulo)}</h4>
        <p class="match-summary">${this.escapeHtml(sol.resumo)}</p>
        <div style="font-size: 0.78rem; color: #64748b; margin-bottom: 10px;">
          👤 <strong>${this.escapeHtml(sol.autorComunidade)}</strong> | Prazo médio: ${sol.tempoImplementacaoDias} dias | Custo: R$ ${sol.custoEstimadoReais.toLocaleString('pt-BR')}
        </div>
        <div class="match-actions">
          <button class="btn-open-guide" onclick="app.abrirGuiaPorId('${sol.id}')">
            📖 Ler Ficha Técnica Completa
          </button>
          <button class="btn-open-guide" style="background: #25d366; color: white; border: none;" onclick="app.compartilharSolucaoWhatsApp('${sol.id}')">
            📲 Compartilhar WhatsApp
          </button>
        </div>
      </div>
    `).join('');
  }

  // --- Compartilhamento Viral no WhatsApp ---
  async compartilharSolucaoWhatsApp(solutionId) {
    try {
      const res = await fetch(`/api/solutions/${solutionId}/share`);
      const data = await res.json();
      if (data.success && data.data.shareUrl) {
        window.open(data.data.shareUrl, '_blank');
      } else {
        this.mostrarToast('Erro ao gerar link de compartilhamento.', 'erro');
      }
    } catch (err) {
      this.mostrarToast('Erro ao conectar com servidor para compartilhamento.', 'erro');
    }
  }

  // --- Modal de Guia Passo a Passo ---
  async abrirGuiaPorId(solutionId) {
    try {
      const userIdParam = this.currentUser ? `?userId=${this.currentUser.id}` : '';
      const res = await fetch(`/api/solutions/${solutionId}${userIdParam}`);
      const data = await res.json();
      if (data.success) {
        this.activeSolution = data.data;
        this.renderizarModalGuia(data.data, data.trialStatus);
        document.getElementById('modalGuiaSolucao').classList.add('active');
      }
    } catch (err) {
      this.mostrarToast('Erro ao carregar detalhes da solução', 'erro');
    }
  }

  abrirGuiaAtual() {
    if (this.activeSolution) {
      this.abrirGuiaPorId(this.activeSolution.id);
    } else {
      this.mostrarToast('Nenhum guia associado ao diálogo ativo.', 'aviso');
    }
  }

  fecharModalGuia() {
    document.getElementById('modalGuiaSolucao').classList.remove('active');
  }

  renderizarModalGuia(sol, trialStatus) {
    const box = document.getElementById('modalGuiaConteudo');
    const isBloqueado = sol.contatoBloqueado || (trialStatus && trialStatus.status === 'TRIAL_EXPIRED');

    box.innerHTML = `
      <div style="margin-bottom: 14px;">
        <span class="route-pill">${this.escapeHtml(sol.ufOrigem)} - Região ${this.escapeHtml(sol.regiaoOrigem.toUpperCase())}</span>
        <h3 style="font-size: 1.3rem; color: var(--primary-dark); margin-top: 6px;">${this.escapeHtml(sol.titulo)}</h3>
        <p style="font-size: 0.9rem; color: #475569; margin-top: 4px;">${this.escapeHtml(sol.resumo)}</p>
      </div>

      <div class="match-meta-grid" style="margin-bottom: 18px;">
        <div class="meta-box">
          <span>Comunidade Detentora:</span>
          <strong>${this.escapeHtml(sol.autorComunidade)}</strong>
        </div>
        <div class="meta-box">
          <span>Especialista de Referência:</span>
          <strong>${this.escapeHtml(sol.especialista)}</strong>
        </div>
        <div class="meta-box">
          <span>Custo Estimado:</span>
          <strong>R$ ${sol.custoEstimadoReais.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      ${isBloqueado ? `
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 14px; border-radius: 10px; margin-bottom: 16px;">
          <strong style="color: #991b1b; font-size: 0.9rem;">🔒 Período de Teste de 24h Encerrado</strong>
          <p style="color: #7f1d1d; font-size: 0.84rem; margin: 6px 0;">
            O contato direto de WhatsApp deste mentor está protegido para assinantes. Desbloqueie acesso vitalício com o plano Conexão Pro por apenas R$ 19,90 taxa única.
          </p>
          <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
            <a href="${this.config.kiwifyCheckoutUrl || 'https://pay.kiwify.com.br/KsTiYDG'}" target="_blank" class="btn-submit-match" style="flex: 1; min-width: 180px; padding: 10px; text-decoration: none; background: linear-gradient(135deg, #10b981 0%, #047857 100%);">
              💳 Pagar na Kiwify (R$ 19,90)
            </a>
            <button class="btn-pro-gold" style="flex: 1; min-width: 140px; padding: 10px;" onclick="app.fecharModalGuia(); app.abrirModalPro();">
              ⚡ Pagar via PIX
            </button>
          </div>
        </div>
      ` : `
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px; border-radius: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 0.78rem; color: #065f46;">Contato Direto do Mentor (Liberado no Trial):</span>
            <strong style="display: block; color: #047857;">${this.escapeHtml(sol.especialista)}</strong>
          </div>
          <a href="https://wa.me/55${sol.contatoWhatsapp}?text=Ol%C3%A1!%20Encontrei%20sua%20solu%C3%A7%C3%A3o%20no%20EloRegional" target="_blank" class="btn-profile-pill" style="background: #25d366; color: white; border: none; font-weight: 700;">
            💬 Conversar no WhatsApp
          </a>
        </div>
      `}

      <h4 style="font-size: 1rem; color: #1e293b; margin-bottom: 10px;">📋 Guia Prático de Implementação:</h4>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
        ${(sol.guiaPassoAPasso || []).map(g => `
          <div style="background: #f8fafc; border-left: 3px solid var(--primary); padding: 10px 14px; border-radius: 6px;">
            <strong style="color: var(--primary-dark); font-size: 0.88rem;">Passo ${g.passo}: ${this.escapeHtml(g.titulo)}</strong>
            <p style="font-size: 0.82rem; color: #334155; margin-top: 2px;">${this.escapeHtml(g.descricao)}</p>
          </div>
        `).join('')}
      </div>

      <div style="display: flex; gap: 10px; margin-top: 10px;">
        <button class="btn-submit-match" style="background: #25d366; flex: 1;" onclick="app.compartilharSolucaoWhatsApp('${sol.id}')">
          📲 Compartilhar Solução no WhatsApp
        </button>
      </div>
    `;
  }

  // --- Diálogo / Chat de Ajuda ---
  async iniciarDialogoMatch(solutionId, challengeId) {
    try {
      const userIdParam = this.currentUser ? `?userId=${this.currentUser.id}` : '';
      const res = await fetch(`/api/solutions/${solutionId}${userIdParam}`);
      const data = await res.json();
      if (data.success) {
        this.activeSolution = data.data;
        this.activeMatch = { matchId: `dialogo_${solutionId}_${challengeId}`, solutionId, challengeId };
        
        document.getElementById('chatInterlocutorNome').textContent = `${this.escapeHtml(data.data.especialista)} (${this.escapeHtml(data.data.ufOrigem)})`;
        document.getElementById('chatInterlocutorSub').textContent = this.escapeHtml(data.data.autorComunidade);

        this.trocarAba('dialogo');
        await this.carregarMensagensChat();
      }
    } catch (err) {
      this.mostrarToast('Erro ao inicializar diálogo', 'erro');
    }
  }

  async carregarMensagensChat() {
    if (!this.activeMatch) return;
    const box = document.getElementById('chatMessagesBox');
    try {
      const res = await fetch(`/api/messages/${this.activeMatch.matchId}`);
      const data = await res.json();

      if (data.success && data.data.length > 0) {
        box.innerHTML = data.data.map(m => `
          <div class="msg-bubble ${m.autorTipo === 'comunidade' ? 'me' : 'other'}">
            <strong>${this.escapeHtml(m.autorNome)}</strong>
            <p>${this.escapeHtml(m.texto)}</p>
            <span class="msg-meta">${new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        `).join('');
      } else {
        box.innerHTML = `
          <div class="msg-bubble other">
            <strong>${this.activeSolution ? this.escapeHtml(this.activeSolution.especialista) : 'Especialista Regional'}</strong>
            <p>Olá! Vimos que seu desafio tem alta sinergia com a nossa experiência aqui em ${this.activeSolution ? this.escapeHtml(this.activeSolution.ufOrigem) : 'nossa região'}. Como podemos ajudar você e sua comunidade a replicar essa tecnologia?</p>
            <span class="msg-meta">Agora</span>
          </div>
        `;
      }
      box.scrollTop = box.scrollHeight;
    } catch (err) {
      console.error(err);
    }
  }

  async enviarMensagemChat(e) {
    e.preventDefault();
    const input = document.getElementById('chatInputText');
    const texto = input.value.trim();
    if (!texto || !this.activeMatch) return;

    const payload = {
      matchId: this.activeMatch.matchId,
      challengeId: this.activeMatch.challengeId,
      userId: this.currentUser ? this.currentUser.id : 'anonimo',
      autorNome: this.currentUser ? this.currentUser.nome : 'Produtor Parceiro',
      autorTipo: 'comunidade',
      texto
    };

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status === 'TRIAL_EXPIRED' || data.upgradeRequired) {
        this.mostrarToast('Seu período de teste encerrou. Faça upgrade para continuar conversando.', 'aviso');
        this.abrirModalPro();
        return;
      }

      if (data.success) {
        input.value = '';
        await this.carregarMensagensChat();

        setTimeout(async () => {
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matchId: this.activeMatch.matchId,
              challengeId: this.activeMatch.challengeId,
              userId: 'mentor',
              autorNome: this.activeSolution ? this.activeSolution.especialista : 'Mentor Regional',
              autorTipo: 'especialista',
              texto: 'Entendido! Analisando seu caso, o primeiro passo essencial é checar a declividade e os materiais locais disponíveis. Abra a ficha técnica para checar os 5 passos prioritários!'
            })
          });
          this.carregarMensagensChat();
        }, 1200);
      } else {
        this.mostrarToast(data.error || 'Erro ao enviar mensagem', 'erro');
      }
    } catch (err) {
      this.mostrarToast('Erro ao enviar mensagem', 'erro');
    }
  }

  // --- Monetização Freemium & PIX Oficial ---
  abrirModalPro() {
    document.getElementById('modalPlanoPro').classList.add('active');
  }

  fecharModalPro() {
    document.getElementById('modalPlanoPro').classList.remove('active');
  }

  async gerarCheckoutPix() {
    const triggerBox = document.getElementById('pixTriggerBox');
    const checkoutBox = document.getElementById('pixCheckoutBox');

    try {
      const res = await fetch('/api/checkout/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser ? this.currentUser.id : 'anonimo',
          customerName: this.currentUser ? this.currentUser.nome : 'Comunidade Parceira',
          customerPhone: this.currentUser ? this.currentUser.whatsapp : '',
          planoId: 'pro'
        })
      });
      const data = await res.json();

      if (data.success) {
        this.currentTx = data.data;
        document.getElementById('pixQrImg').src = data.data.qrCodeUrl;
        document.getElementById('pixCodeText').textContent = data.data.pixPayload;
        document.getElementById('btnWhatsappFollowup').href = data.data.whatsappUrl;

        triggerBox.style.display = 'none';
        checkoutBox.style.display = 'block';
      }
    } catch (err) {
      this.mostrarToast('Erro ao gerar cobrança PIX', 'erro');
    }
  }

  copiarCodigoPix() {
    if (!this.currentTx) return;
    navigator.clipboard.writeText(this.currentTx.pixPayload).then(() => {
      this.mostrarToast('Código PIX Copia-e-Cola copiado com sucesso!', 'sucesso');
    }).catch(() => {
      this.mostrarToast('Selecione o código acima para copiar.', 'aviso');
    });
  }

  async verificarPixSimulado() {
    if (!this.currentTx) return;
    try {
      const res = await fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txId: this.currentTx.txId,
          userId: this.currentUser ? this.currentUser.id : null
        })
      });
      const data = await res.json();
      if (data.success) {
        this.mostrarToast(data.message, 'sucesso');
        if (this.currentUser) {
          this.currentUser.plano = 'pro';
          localStorage.setItem('eloregional_user', JSON.stringify(this.currentUser));
          this.atualizarHeaderUsuario();
        }
        this.fecharModalPro();
      }
    } catch (err) {
      this.mostrarToast('Erro ao confirmar transação', 'erro');
    }
  }
}

// Instanciar aplicação global
const app = new EloRegionalApp();
window.app = app;
