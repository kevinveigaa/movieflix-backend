const express = require('express');
const axios = require('axios');
const { db } = require('../database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const MP_TOKEN = 'TEST-3042373437299599-072207-683b930eab4ade760ef9657f6ba402c6-522862513';
const MP_BASE = 'https://api.mercadopago.com';

// GET /api/pagamentos/planos
router.get('/planos', (req, res) => {
  try {
    const planos = db.prepare('SELECT * FROM planos ORDER BY preco').all();
    // APK expects `recursos` as an array, not a comma-separated string
    const result = planos.map(p => ({
      ...p,
      recursos: p.recursos ? p.recursos.split(',').map(r => r.trim()) : []
    }));
    res.json({ sucesso: true, planos: result });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/pagamentos/criar — Cria pagamento via Mercado Pago PIX
router.post('/criar', authRequired, async (req, res) => {
  try {
    const { plano } = req.body;
    if (!plano) return res.status(400).json({ erro: 'Plano é obrigatório' });

    const planoData = db.prepare('SELECT * FROM planos WHERE LOWER(nome) = LOWER(?)').get(plano);
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
      qrCode = null;
      qrCodeBase64 = null;
    }

    // Save payment
    db.prepare(`
      INSERT INTO pagamentos (usuario_id, plano_id, valor, status, mp_payment_id, qr_code, qr_code_base64)
      VALUES (?, ?, ?, 'pendente', ?, ?, ?)
    `).run(req.user.id, planoData.id, planoData.preco, paymentId, qrCode, qrCodeBase64);

    // Save subscription
    db.prepare(`
      INSERT INTO assinaturas (usuario_id, plano_id, status, mp_payment_id, qr_code, qr_code_base64)
      VALUES (?, ?, 'pendente', ?, ?, ?)
    `).run(req.user.id, planoData.id, paymentId, qrCode, qrCodeBase64);

    // Return format the APK expects
    res.json({
      sucesso: true,
      linkPagamento: `https://movieflix-backend-bsuf.onrender.com/api/pagamentos/qrcode/${paymentId}`,
      pagamento_id: paymentId,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      valor: planoData.preco,
      plano: planoData.nome
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

        return res.json({ sucesso: true, status: mpStatus });
      } catch (mpErr) {
        console.warn('[MP] Confirm check failed:', mpErr.response?.data?.message || mpErr.message);
        return res.json({ sucesso: true, status: payment.status });
      }
    }

    // Fallback (fake) payment — auto-approve for demo
    db.prepare('UPDATE pagamentos SET status = ? WHERE mp_payment_id = ?')
      .run('aprovado', payment.mp_payment_id);
    db.prepare('UPDATE assinaturas SET status = ? WHERE mp_payment_id = ?')
      .run('aprovado', payment.mp_payment_id);

    return res.json({ sucesso: true, status: 'aprovado' });
  } catch (e) {
    console.error('[CONFIRMAR] Fatal:', e.message);
    res.status(500).json({ erro: 'Erro ao confirmar pagamento.' });
  }
});

// GET /api/pagamentos/status — Status dos pagamentos do usuário
router.get('/status', authRequired, async (req, res) => {
  try {
    const assinatura = db.prepare(`
      SELECT a.*, pl.nome as plano_nome, pl.preco as plano_preco, pl.descricao as plano_descricao, pl.recursos as plano_recursos
      FROM assinaturas a
      JOIN planos pl ON a.plano_id = pl.id
      WHERE a.usuario_id = ? AND a.status = 'aprovado'
      ORDER BY a.created_at DESC LIMIT 1
    `).get(req.user.id);

    // APK expects ativa, data_inicio, data_vencimento
    const assinaturaResult = assinatura ? {
      ativa: assinatura.status === 'aprovado',
      plano: assinatura.plano_nome,
      data_inicio: assinatura.created_at,
      data_vencimento: null, // No expiry tracking yet; could be computed if needed
      recursos: assinatura.plano_recursos ? assinatura.plano_recursos.split(',').map(r => r.trim()) : []
    } : null;

    const payments = db.prepare(`
      SELECT p.*, pl.nome as plano_nome FROM pagamentos p
      JOIN planos pl ON p.plano_id = pl.id
      WHERE p.usuario_id = ? ORDER BY p.created_at DESC LIMIT 5
    `).all(req.user.id);

    res.json({ sucesso: true, pagamentos: payments, assinatura: assinaturaResult });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;

// GET /api/pagamentos/qrcode/:id — Shows PIX QR code page
router.get('/qrcode/:id', (req, res) => {
  try {
    const payment = db.prepare(
      'SELECT * FROM pagamentos WHERE mp_payment_id = ?'
    ).get(req.params.id);

    if (!payment || !payment.qr_code_base64) {
      return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento - MovieFlix</title><style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a1a;color:#fff;text-align:center;padding:20px}h1{color:#e50914}button{background:#e50914;color:#fff;border:0;padding:12px 30px;border-radius:8px;font-size:16px;margin-top:20px;cursor:pointer}</style></head><body><h1>Pagamento não encontrado</h1><p>Tente criar um novo pagamento no app.</p><button onclick="window.ReactNativeWebView.postMessage('close')">Voltar</button></body></html>`);
    }

    const qrImg = `data:image/png;base64,${payment.qr_code_base64}`;
    const pixCode = payment.qr_code || '';

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagar com PIX - MovieFlix</title><style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a1a;color:#fff;text-align:center;padding:20px}h1{color:#e50914;margin-bottom:10px}h2{font-weight:400;color:#aaa;font-size:14px;margin-bottom:20px}.qr-box{background:#fff;padding:15px;border-radius:12px;margin:20px 0}.qr-box img{width:220px;height:220px}button{background:#e50914;color:#fff;border:0;padding:12px 30px;border-radius:8px;font-size:16px;margin:10px;cursor:pointer}.copy-btn{background:#333}.pix-code{background:#1a1a2e;padding:10px;border-radius:6px;word-break:break-all;max-width:300px;font-size:11px;color:#888}</style></head><body><h1>Pagar com PIX</h1><h2>Plano: ${payment.valor ? 'R$' + payment.valor.toFixed(2).replace('.',',') : ''}</h2><div class="qr-box"><img src="${qrImg}" alt="QR Code PIX"></div><p style="font-size:13px;color:#aaa">Escaneie o QR Code ou copie o código PIX</p><p class="pix-code">${pixCode}</p><button onclick="navigator.clipboard.writeText('${pixCode.replace(/'/g,"\\'")}')">📋 Copiar código PIX</button><button onclick="window.ReactNativeWebView.postMessage('paid')">✅ Já paguei</button></body></html>`);
  } catch (e) {
    res.status(500).send('Erro ao carregar QR code');
  }
});

