/**
 * Motor Inteligente de Matchmaking Inter-Regional
 * Conecta desafios de uma região a soluções comprovadas de outras regiões do Brasil.
 */

export class MatchEngine {
  constructor(solutionsDb) {
    this.solutionsDb = solutionsDb;
  }

  /**
   * Calcula a pontuação e encontra os melhores matches para um desafio.
   * @param {Object} challenge - Dados do desafio regional
   * @returns {Array} Lista de matches ordenados por score decrescente
   */
  findMatchesForChallenge(challenge) {
    const solutions = this.solutionsDb.findAll();
    const scoredMatches = [];

    const challengeText = `${challenge.titulo || ''} ${challenge.descricao || ''}`.toLowerCase();
    const challengeRegion = (challenge.regiao || '').toLowerCase();
    const challengeCategory = challenge.categoria;

    for (const sol of solutions) {
      let score = 0;
      const reasons = [];

      // 1. Compatibilidade Temática Principal (Até 40 pontos)
      if (challengeCategory && sol.categoria === challengeCategory) {
        score += 40;
        reasons.push('Mesma área de atuação temática');
      }

      // 2. Análise Semântica de Palavras-Chave e Tags (Até 25 pontos)
      let matchedKeywordsCount = 0;
      if (Array.isArray(sol.tags)) {
        for (const tag of sol.tags) {
          if (challengeText.includes(tag.toLowerCase())) {
            matchedKeywordsCount++;
          }
        }
      }

      // Procura termos essenciais nos títulos e resumos
      const solKeywords = `${sol.titulo} ${sol.resumo}`.toLowerCase().split(/\W+/).filter(w => w.length > 4);
      for (const kw of solKeywords) {
        if (challengeText.includes(kw)) {
          matchedKeywordsCount++;
        }
      }

      const keywordPoints = Math.min(25, matchedKeywordsCount * 5);
      if (keywordPoints > 0) {
        score += keywordPoints;
        reasons.push(`Palavras-chave e contexto compatíveis (+${keywordPoints}%)`);
      }

      // 3. Fator de Transferência Inter-Regional (Até 25 pontos)
      const solRegion = (sol.regiaoOrigem || '').toLowerCase();
      if (challengeRegion && solRegion) {
        if (challengeRegion !== solRegion) {
          // Bônus máximo: transferência entre regiões distintas
          score += 25;
          reasons.push(`Transferência Inter-Regional comprovada (${this._formatRegion(solRegion)} ➔ ${this._formatRegion(challengeRegion)})`);
        } else if (challenge.uf && sol.ufOrigem && challenge.uf.toUpperCase() !== sol.ufOrigem.toUpperCase()) {
          // Mesma macrorregião, estados diferentes
          score += 15;
          reasons.push(`Cooperação entre estados vizinhos (${sol.ufOrigem} ➔ ${challenge.uf})`);
        } else {
          score += 10;
          reasons.push('Solução validada no mesmo estado');
        }
      }

      // 4. Maturidade e Volume de Replicações (Até 10 pontos)
      if (sol.maturidade === 'comprovada') {
        score += 10;
        reasons.push(`Metodologia madura com ${sol.replicacoesConfirmadas.toLocaleString('pt-BR')} replicações no Brasil`);
      } else {
        score += 5;
      }

      // Garantir teto de 99% (ou 100%) e piso condicional
      const finalScore = Math.min(99, Math.max(15, score));

      scoredMatches.push({
        solutionId: sol.id,
        solution: sol,
        matchScore: finalScore,
        reasons,
        interRegional: challengeRegion !== solRegion,
        regiaoOrigem: sol.regiaoOrigem,
        regiaoDestino: challengeRegion,
        ufOrigem: sol.ufOrigem,
        ufDestino: challenge.uf
      });
    }

    // Ordenar por score decrescente
    return scoredMatches.sort((a, b) => b.matchScore - a.matchScore);
  }

  _formatRegion(reg) {
    const map = {
      norte: 'Norte',
      nordeste: 'Nordeste',
      centro_oeste: 'Centro-Oeste',
      sudeste: 'Sudeste',
      sul: 'Sul'
    };
    return map[reg] || reg;
  }
}
