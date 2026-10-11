import https from 'https';
import http from 'http';

const targetUrl = process.argv[2] || 'https://eloregional-app.onrender.com';
const webhookEndpoint = `${targetUrl.replace(/\/$/, '')}/api/webhooks/kiwify`;
const token = process.env.KIWIFY_WEBHOOK_TOKEN || 'eloregional_kiwify_webhook_token_2026';

console.log('=======================================================');
console.log('🥝 EloRegional - Testador do Webhook Kiwify');
console.log(`🎯 Alvo: ${webhookEndpoint}`);
console.log('=======================================================\n');

function sendPost(payload, customToken = token) {
  return new Promise((resolve, reject) => {
    const isHttps = webhookEndpoint.startsWith('https');
    const client = isHttps ? https : http;
    const data = JSON.stringify(payload);
    const parsed = new URL(webhookEndpoint);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-kiwify-token': customToken,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('1️⃣ Testando rejeição com token inválido...');
  const res1 = await sendPost({ order_id: 'TESTE_SEM_TOKEN' }, 'token_invalido_123');
  if (res1.status === 401) {
    console.log('   ✅ PASSOU: HTTP 401 UNAUTHORIZED_WEBHOOK recebido corretamente.');
  } else {
    console.log(`   ❌ FALHOU: Esperado 401, recebido ${res1.status}`);
  }

  const testOrderId = `KW_MANUAL_${Date.now()}`;
  console.log(`\n2️⃣ Testando aprovação de pedido (${testOrderId})...`);
  const res2 = await sendPost({
    order_id: testOrderId,
    order_status: 'paid',
    order_amount: 1990,
    Customer: {
      email: 'comprador.teste@eloregional.org.br',
      full_name: 'Produtor Teste Kiwify'
    }
  });

  if (res2.status === 200 && res2.body && res2.body.success) {
    console.log('   ✅ PASSOU: HTTP 200 OK!');
    console.log('   📦 Resposta:', JSON.stringify(res2.body));
  } else {
    console.log(`   ❌ FALHOU: Status ${res2.status}`, res2.body || res2.raw);
  }

  console.log(`\n3️⃣ Testando idempotência (reenvio de ${testOrderId})...`);
  const res3 = await sendPost({
    order_id: testOrderId,
    order_status: 'paid',
    Customer: {
      email: 'comprador.teste@eloregional.org.br'
    }
  });

  if (res3.status === 200 && res3.body && (res3.body.idempotent || res3.body.claimToken)) {
    console.log('   ✅ PASSOU: Idempotência ativa! Servidor evitou duplicidade.');
  }

  console.log('\n=======================================================');
  console.log('🎉 Todos os testes de integração do webhook finalizados!');
  console.log('=======================================================');
}

runTests().catch(err => console.error('Erro na execução:', err));
