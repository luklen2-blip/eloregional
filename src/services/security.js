/**
 * Utilitários de Segurança, Sanitização de Inputs e Rate Limiting
 * Em conformidade com OWASP Top 10 e LGPD (Lei 13.709/2018).
 */

/**
 * Sanitiza strings prevenindo injeções de scripts (XSS) e tags maliciosas.
 */
export function sanitizeInput(input, maxLength = 2000) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove caracteres de abertura e fechamento de tags HTML
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

/**
 * Rate Limiter resiliente em memória por IP (sem dependências externas)
 */
export class MemoryRateLimiter {
  constructor(windowMs = 15 * 60 * 1000, maxRequests = 300, errorMessage = 'Muitas requisições deste IP. Tente novamente mais tarde.') {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.errorMessage = errorMessage;
    this.requests = new Map();

    // Limpeza periódica de memória a cada 10 minutos
    setInterval(() => this.cleanup(), 10 * 60 * 1000).unref();
  }

  middleware() {
    return (req, res, next) => {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
      const now = Date.now();

      let clientData = this.requests.get(ip);
      if (!clientData || now - clientData.startTime > this.windowMs) {
        clientData = { startTime: now, count: 1 };
        this.requests.set(ip, clientData);
        return next();
      }

      clientData.count++;
      if (clientData.count > this.maxRequests) {
        res.setHeader('Retry-After', Math.ceil((this.windowMs - (now - clientData.startTime)) / 1000));
        return res.status(429).json({
          success: false,
          error: this.errorMessage,
          retryAfterSeconds: Math.ceil((this.windowMs - (now - clientData.startTime)) / 1000)
        });
      }

      next();
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, data] of this.requests.entries()) {
      if (now - data.startTime > this.windowMs) {
        this.requests.delete(ip);
      }
    }
  }
}
