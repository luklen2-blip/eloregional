FROM node:20-alpine

WORKDIR /usr/src/app

# Instalação isolada de dependências
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Cópia do código-fonte
COPY . .

# Variáveis de ambiente padrão para nuvem
ENV NODE_ENV=production
ENV PORT=3000

# Execução obrigatória dos testes de integridade antes de autorizar o build da imagem
RUN node tests/run_all.js

EXPOSE 3000

CMD ["node", "server.js"]
