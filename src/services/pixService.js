/**
 * Gerador Nativo de PIX EMV Copia-e-Cola (Padrão Oficial Banco Central do Brasil)
 * com cálculo de CRC-16 / CCITT-FALSE e disparos para WhatsApp.
 */

export function generatePixPayload({
  pixKey = 'contato@eloregional.org.br',
  name = 'EloRegional Brasil',
  city = 'Brasilia',
  amount = 19.90,
  txId = 'ELO' + Date.now().toString().slice(-8)
}) {
  const formatField = (id, value) => {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const merchantAccountInfo = [
    formatField('00', 'br.gov.bcb.pix'),
    formatField('01', pixKey)
  ].join('');

  const additionalDataField = formatField('05', txId);

  let payload = [
    formatField('00', '01'), // Payload Format Indicator
    formatField('26', merchantAccountInfo), // Merchant Account Info
    formatField('52', '0000'), // Merchant Category Code
    formatField('53', '986'), // Transaction Currency (BRL)
    amount ? formatField('54', Number(amount).toFixed(2)) : '', // Transaction Amount
    formatField('58', 'BR'), // Country Code
    formatField('59', name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 25)), // Merchant Name
    formatField('60', city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 15)), // Merchant City
    formatField('62', additionalDataField), // Additional Data Field
    '6304' // CRC16 Indicator
  ].join('');

  // Cálculo CRC-16 / CCITT-FALSE
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');

  return payload + crcHex;
}

export function getPixQrCodeUrl(payloadPix) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payloadPix)}`;
}

export function generateWhatsAppOrderUrl({ phone, customerName, planTitle = 'Conexão Pro', amount = 19.90, txId }) {
  const cleanPhone = (phone || '11999998888').replace(/\D/g, '');
  const destination = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  const text =
`🌱 *ELOREGIONAL - PLANO ${planTitle.toUpperCase()}*
👤 *Comunidade / Solicitante:* ${customerName}
🆔 *Código Transação:* ${txId}
💰 *Investimento Social:* R$ ${Number(amount).toFixed(2)} (Taxa Única Vitalícia)
💳 *Status:* Pagamento PIX Gerado

Olá! Gostaria de confirmar a ativação do meu acesso vitalício e suporte a mentorias inter-regionais.`;

  return `https://wa.me/${destination}?text=${encodeURIComponent(text)}`;
}

/**
 * Geração de Link de Compartilhamento Social e Viral no WhatsApp (Soluções Comprovadas)
 */
export function generateWhatsAppShareUrl({ titulo, regiaoOrigem, ufOrigem, publicUrl }) {
  const regiaoFormatada = (regiaoOrigem || 'Brasil').toUpperCase();
  const localizacao = ufOrigem ? `${ufOrigem} - Região ${regiaoFormatada}` : regiaoFormatada;

  const text =
`Encontrei esta solução no EloRegional que pode ajudar nossa comunidade:
💡 ${titulo}
📍 Região de Origem: ${localizacao}
🔗 Veja como replicar aqui: ${publicUrl || 'https://eloregional-app.onrender.com'}`;

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Geração de Link de Compartilhamento de Desafio no WhatsApp (Busca de Mentores e Apoio)
 */
export function generateWhatsAppChallengeShareUrl({ titulo, regiao, uf, publicUrl }) {
  const regiaoFormatada = (regiao || 'Brasil').toUpperCase();
  const localizacao = uf ? `${uf} - Região ${regiaoFormatada}` : regiaoFormatada;

  const text =
`Estamos buscando soluções para este desafio regional no EloRegional:
🎯 ${titulo}
📍 Local: ${localizacao}
💬 Conecte-se conosco para apoiar: ${publicUrl || 'https://eloregional-app.onrender.com/'}`;

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
