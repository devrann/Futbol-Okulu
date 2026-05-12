/**
 * WhatsApp gönderim yardımcı modülü.
 * .env içinde WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID varsa
 * Meta WhatsApp Cloud API ile mesaj gönderir; yoksa sessizce no-op.
 *
 * Not: Meta, 24 saatlik "müşteri servis" penceresi dışında yalnızca ONAYLI
 * "template" mesajlarına izin verir. Bu yüzden production için template
 * adlarını Meta panelinde tanımlayıp onaylatın.
 *
 * Şablonlar (örnek gövde değişkenleri dokümanda):
 * - Hatırlatma: WHATSAPP_TEMPLATE_NAME veya WHATSAPP_TEMPLATE_NAME_REMINDER → {{1}}..{{4}}
 * - Ödeme alındı: WHATSAPP_TEMPLATE_NAME_PAYMENT → {{1}}..{{4}}
 *
 * Ayrıca "wa.me" click-to-chat bağlantısı için buildClickToChatUrl() yardımcı.
 */
const logger = require('./logger');

const API_VERSION = (process.env.WHATSAPP_API_VERSION || 'v20.0').trim();
const TOKEN = (process.env.WHATSAPP_API_TOKEN || '').trim();
const PHONE_NUMBER_ID = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const TEMPLATE_NAME = (process.env.WHATSAPP_TEMPLATE_NAME || '').trim();
const LANGUAGE_CODE = (process.env.WHATSAPP_LANGUAGE_CODE || 'tr').trim();
const USE_PLAIN = /^(1|true|yes)$/i.test(process.env.WHATSAPP_USE_PLAIN || '');

function isEnabled() {
  return !!(TOKEN && PHONE_NUMBER_ID);
}

/** Telefonu E.164'e yakın temizler. TR için başında 0 varsa 90 ekler. */
function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('90') && d.length >= 12) return d;
  if (d.startsWith('0') && d.length === 11) return '9' + d;
  if (d.length === 10) return '90' + d;
  if (d.length >= 10) return d;
  return null;
}

/** wa.me click-to-chat bağlantısı üretir — ücretsiz, tarayıcı/telefondan manuel gönderim içindir. */
function buildClickToChatUrl(phone, message) {
  const num = normalizePhone(phone);
  if (!num) return null;
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(message || '');
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  let payload = null;
  try { payload = await res.json(); } catch (_) { /* sessiz */ }
  if (!res.ok) {
    const errMsg = payload?.error?.message || res.statusText || 'WhatsApp hatası';
    const err = new Error(errMsg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

/**
 * Belirli template adı ile gönder (Meta'da aynı isimde onaylı şablon olmalı).
 * parameters: body {{1}}, {{2}}, ... için string dizisi.
 */
async function sendTemplateWithName(phone, templateName, parameters = []) {
  const name = (templateName || '').trim();
  if (!isEnabled() || !name) return { skipped: true };
  const num = normalizePhone(phone);
  if (!num) return { error: 'invalid-phone' };
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const components = parameters.length
    ? [{
        type: 'body',
        parameters: parameters.map(p => ({ type: 'text', text: String(p ?? '') }))
      }]
    : [];
  try {
    const payload = await postJson(url, {
      messaging_product: 'whatsapp',
      to: num,
      type: 'template',
      template: {
        name,
        language: { code: LANGUAGE_CODE },
        ...(components.length ? { components } : {})
      }
    });
    return { ok: true, id: payload?.messages?.[0]?.id || null };
  } catch (err) {
    logger.warn('WhatsApp template hatası (' + name + '): ' + err.message);
    return { error: err.message };
  }
}

async function sendTemplate(phone, parameters = []) {
  return sendTemplateWithName(phone, TEMPLATE_NAME, parameters);
}

/**
 * Düz metin: varsayılan davranış — tanımlı genel şablon varken ve USE_PLAIN kapalıysa
 * gönderilmez (Meta policy ile uyum için bulk'ta kullanılır).
 */
async function sendText(phone, text) {
  if (!isEnabled()) return { skipped: true };
  if (!USE_PLAIN && TEMPLATE_NAME) {
    return { skipped: true, reason: 'plain-disabled' };
  }
  return sendTextDirect(phone, text);
}

/** Düz metin her zaman dener (şablon yokken veya ödeme teyidi gibi). Meta 24h dışında reddedebilir. */
async function sendTextDirect(phone, text) {
  if (!isEnabled()) return { skipped: true };
  const num = normalizePhone(phone);
  if (!num) return { error: 'invalid-phone' };
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  try {
    const payload = await postJson(url, {
      messaging_product: 'whatsapp',
      to: num,
      type: 'text',
      text: { body: text || '' }
    });
    return { ok: true, id: payload?.messages?.[0]?.id || null };
  } catch (err) {
    logger.warn('WhatsApp text hatası: ' + err.message);
    return { error: err.message };
  }
}

/**
 * recipients: [{ phone, params?, text? }]
 * templateNameOverride: doluysa tüm alıcılar için bu şablon; boşsa TEMPLATE_NAME sonra düz metin.
 */
async function sendBulk(recipients, templateNameOverride = null) {
  const tmpl = (templateNameOverride != null && String(templateNameOverride).trim() !== '')
    ? String(templateNameOverride).trim()
    : (TEMPLATE_NAME || '').trim();

  const result = { sent: 0, skipped: 0, failed: 0, enabled: isEnabled() };
  if (!isEnabled()) { result.skipped = recipients.length; return result; }
  for (const r of recipients) {
    let res;
    if (tmpl) {
      res = await sendTemplateWithName(r.phone, tmpl, r.params || []);
    } else {
      res = await sendText(r.phone, r.text || '');
    }
    if (res?.ok) result.sent++;
    else if (res?.skipped) result.skipped++;
    else result.failed++;
  }
  return result;
}

const PAYMENT_TEMPLATE = (process.env.WHATSAPP_TEMPLATE_NAME_PAYMENT || '').trim();

/** Ödeme kaydı sonrası veliye WhatsApp (şablon veya düz metin). */
async function notifyPaymentReceived(payment) {
  const phone = payment.veliTelefon1 || payment.veliTelefon2 || '';
  if (!isEnabled() || !phone) return { skipped: true };

  const veliAd = payment.veliAdi || 'Veli';
  const ogrenci = `${payment.ad || ''} ${payment.soyad || ''}`.trim();
  const donem = payment.donemAdi || '';
  const tutarStr = Number(payment.tutar || 0).toFixed(2) + ' TL';

  if (PAYMENT_TEMPLATE) {
    return sendTemplateWithName(phone, PAYMENT_TEMPLATE, [veliAd, ogrenci, donem, tutarStr]);
  }
  const text = `Beşiktaş Futbol Okulu: ${ogrenci} - ${donem} dönemi ödemeniz alındı. Tutar: ${tutarStr}.`;
  return sendTextDirect(phone, text);
}

module.exports = {
  isEnabled,
  normalizePhone,
  buildClickToChatUrl,
  sendTemplate,
  sendTemplateWithName,
  sendText,
  sendTextDirect,
  sendBulk,
  notifyPaymentReceived
};
