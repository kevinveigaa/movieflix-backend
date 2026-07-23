const express = require('express');
const axios = require('axios');
const db = require('../database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const MP_TOKEN = 'TEST-3042373437299599-072207-683b930eab4ade760ef9657f6ba402c6-522862513';
const MP_BASE = 'https://api.mercadopago.com';

// GET /api/pagamentos/planos
router.get('/planos', (req, res) => {
  try {
    const planos = db.prepare('SELECT * FROM planos ORDER BY preco').all();
    res.json(planos);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Generate a fake PIX QR code string (for demo/testing fallback)
function gerarPixFake(planoData, paymentId) {
  const valor = planoData.preco.toFixed(2).replace('.', '');
  // Standard BR Code (PIX) structure — emulation for demo
  const pix = [
    '000201',                            // Payload format indicator
    '010212',                            // Static QR
    `26360014BR.GOV.BCB.PIX0114${paymentId}`,  // Merchant account (PIX key = paymentId)
    '52040000',                          // Merchant category code
    '5303986',                           // Transaction currency (BRL)
    `54${String(valor).padStart(2, '0').length.toString().padStart(2, '0')}${valor}`, // Value
    '5802BR',                            // Country code
    '5913MOVIEFLIX APP',                 // Merchant name
    '6009SAOPAULO',                      // City
    '62070503***',                       // Additional data
    '6304'                               // CRC16 trailer (placeholder)
  ].join('');
  // Simple CRC16-CCITT checksum placeholder
  const crc = '0000';
  return pix + crc.toUpperCase();
}

// POST /api/pagamentos/criar — Cria pagamento via Mercado Pago PIX
router.post('/criar', authRequired, async (req, res) => {
  try {
    const { plano } = req.body;
    if (!plano) return res.status(400).json({ erro: 'Plano é obrigatório' });

    const planoData = db.prepare('SELECT * FROM planos WHERE nome = ?').get(plano);
    if (!planoData) return res.status(400).json({ erro: 'Plano não encontrado' });

    const user = db.prepare('SELECT email, nome, id FROM usuarios WHERE id = ?').get(req.user.id);

    let paymentId, qrCode, qrCodeBase64, mpOk = false;

    // Try Mercado Pago PIX
    try {
      const pixBody = {
        transaction_amount: planoData.preco,
        description: `Plano ${planoData.nome} - MovieFlix`,
        payment_method_id: 'pix',
        payer: {
          email: user.email,
          first_name: user.nome?.split(' ')[0] || user.nome,
          last_name: user.nome?.split(' ').slice(1).join(' ') || 'User'
        },
        date_of_expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h
      };

      const pixRes = await axios.post(`${MP_BASE}/v1/payments`, pixBody, {
        headers: {
          Authorization: `Bearer ${MP_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${req.user.id}-${planoData.id}-${Math.floor(Date.now() / 1000)}`
        }
      });

      paymentId = String(pixRes.data.id);
      qrCode = pixRes.data.point_of_interaction?.transaction_data?.qr_code || '';
      qrCodeBase64 = pixRes.data.point_of_interaction?.transaction_data?.qr_code_base64 || '';
      mpOk = true;

      console.log('[MP] PIX created:', paymentId, 'status:', pixRes.data.status);
    } catch (mpErr) {
      const mpDetail = mpErr.response?.data;
      console.warn('[MP] API error, using fallback:', mpDetail?.message || mpErr.message);
      // Fallback: generate local PIX data for demo/testing
      paymentId = `PAYID${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      qrCode = gerarPixFake(planoData, paymentId);
      qrCodeBase64 = null;
    }

    // Save payment
    const payResult = db.prepare(`
      INSERT INTO pagamentos (usuario_id, plano_id, valor, status, mp_payment_id, qr_code, qr_code_base64)
      VALUES (?, ?, ?, 'pendente', ?, ?, ?)
    `).run(req.user.id, planoData.id, planoData.preco, paymentId, qrCode, qrCodeBase64);

    // Save subscription
    db.prepare(`
      INSERT INTO assinaturas (usuario_id, plano_id, status, mp_payment_id, qr_code, qr_code_base64)
      VALUES (?, ?, 'pendente', ?, ?, ?)
    `).run(req.user.id, planoData.id, paymentId, qrCode, qrCodeBase64);

    res.json({
      pagamento_id: paymentId,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      valor: planoData.preco,
      plano: planoData.nome,
      via_mp: mpOk
    });
  } catch (e) {
    console.error('[CRIAR] Fatal:', e.message);
    res.status(500).json({ erro: 'Erro ao criar pagamento. Tente novamente.' });
  }
});

// POST /api/pagamentos/confirmar — Verifica status com MP e aprova
router.post('/confirmar', authRequired, async (req, res) => {
  try {
    const { pagamento_id } = req.body;
    if (!pagamento_id) return res.status(400).json({ erro: 'ID do pagamento é obrigatório' });

    const payment = db.prepare(
      'SELECT * FROM pagamentos WHERE mp_payment_id = ? AND usuario_id = ?'
    ).get(String(pagamento_id), req.user.id);

    if (!payment) return res.status(404).json({ erro: 'Pagamento não encontrado' });

    // If it's a real Mercado Pago payment, check status
    if (!payment.mp_payment_id?.startsWith('PAYID')) {
      try {
        const mpRes = await axios.get(`${MP_BASE}/v1/payments/${pagamento_id}`, {
          headers: { Authorization: `Bearer ${MP_TOKEN}` }
        });

        const mpStatus = mpRes.data.status === 'approved' ? 'aprovado'
          : mpRes.data.status === 'pending' ? 'pendente'
          : 'rejeitado';

        db.prepare('UPDATE pagamentos SET status = ? WHERE mp_payment_id = ?')
          .run(mpStatus, payment.mp_payment_id);
        db.prepare('UPDATE assinaturas SET status = ? WHERE mp_payment_id = ?')
          .run(mpStatus, payment.mp_payment_id);

        return res.json({ status: mpStatus });
      } catch (mpErr) {
        console.warn('[MP] Confirm check failed:', mpErr.response?.data?.message || mpErr.message);
        return res.json({ status: payment.status });
      }
    }

    // Fallback (fake) payment — auto-approve for demo
    db.prepare('UPDATE pagamentos SET status = ? WHERE mp_payment_id = ?')
      .run('aprovado', payment.mp_payment_id);
    db.prepare('UPDATE assinaturas SET status = ? WHERE mp_payment_id = ?')
      .run('aprovado', payment.mp_payment_id);

    return res.json({ status: 'aprovado' });
  } catch (e) {
    console.error('[CONFIRMAR] Fatal:', e.message);
    res.status(500).json({ erro: 'Erro ao confirmar pagamento.' });
  }
});

// GET /api/pagamentos/status — Status dos pagamentos do usuário
router.get('/status', authRequired, async (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT p.*, pl.nome as plano_nome FROM pagamentos p
      JOIN planos pl ON p.plano_id = pl.id
      WHERE p.usuario_id = ? ORDER BY p.created_at DESC LIMIT 5
    `).all(req.user.id);

    const assinatura = db.prepare(`
      SELECT a.*, pl.nome as plano_nome, pl.preco as plano_preco, pl.descricao as plano_descricao, pl.recursos as plano_recursos
      FROM assinaturas a
      JOIN planos pl ON a.plano_id = pl.id
      WHERE a.usuario_id = ? AND a.status = 'aprovado'
      ORDER BY a.created_at DESC LIMIT 1
    `).get(req.user.id);

    res.json({ pagamentos: payments, assinatura: assinatura || null });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
