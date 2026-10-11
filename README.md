# 🌱 EloRegional - Match de Soluções Regionais

> Aplicativo Mobile-First e PWA focado em colaboração descentralizada no Brasil. Conecta desafios específicos de uma região a especialistas, produtores e comunidades de outras regiões que já superaram o mesmo desafio com sucesso.

---

## 🚀 Arquitetura e Recursos

1. **Onboarding Rápido & Perfil Regional:**
   - Cadastro ágil (< 1 minuto) com Nome/Apelido, Macrorregião (Norte, Nordeste, Centro-Oeste, Sudeste, Sul), UF, Município e Área de Atuação.
2. **Motor Inteligente de Matchmaking Inter-Regional:**
   - Algoritmo que calcula score de afinidade temática e atribui bônus para transferências inter-regionais de tecnologia social.
   - Base curada de tecnologias sociais reais comprovadas (Cisternas ASA, Biodigestores Rurais, Agrofloresta Sintrópica, Revolução dos Baldinhos, Banco Comunitário Palmas, etc.).
3. **Fluxo de Interação e Ajuda:**
   - Chat de colaboração direta entre proponente do desafio e especialista/mentor.
   - Guia prático com passo a passo de replicação, estimativa de custos e cronograma.
   - Pipeline de acompanhamento da resolução em 5 estágios (*Postado ➔ Match ➔ Diálogo ➔ Em Ação ➔ Replicado*).
4. **Modelo de Negócio Freemium & Pagamentos Nacionais:**
   - Acesso público a soluções da comunidade.
   - Assinatura "Conexão Pro" com PIX oficial (EMV Banco Central + CRC16) e confirmação via WhatsApp.
5. **Padrão de Engenharia e Disponibilidade 24/7:**
   - Endpoint de monitoramento: `GET /api/health`
   - Suíte de integridade local: `npm test` (`tests/run_all.js`)
   - Validador remoto em nuvem: `node tests/test_cloud_live.js <URL>`
   - Contêiner Docker universal (`Dockerfile` baseado em `node:20-alpine`)
   - Blueprint de infraestrutura para Render.com (`render.yaml`)
   - Conformidade LGPD com páginas `/termos` e `/privacidade`.

---

## 🛠️ Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Executar testes de integridade
npm test

# 3. Iniciar o servidor
npm start
```
Acesse no navegador: `http://localhost:3000`

---

## 📦 Deploy em Nuvem (Render / Docker)

- **Render.com**: Conecte o repositório Git. O arquivo `render.yaml` já está pré-configurado com autoDeploy, buildCommand e monitoramento em `/api/health`.
- **Docker**: Execute `docker build -t eloregional .` e `docker run -p 3000:3000 eloregional`.
- **Pacote ZIP**: Execute `npm run pack` para gerar o arquivo `.zip` limpo diretamente na sua Área de Trabalho.
