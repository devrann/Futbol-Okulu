/**
 * Yapılandırılmış loglama
 * Seviyeler: error, warn, info, debug
 * Hassas alanlar otomatik [REDACTED] ile değiştirilir (KVKK uyumu).
 */
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const minLevel = levels[process.env.LOG_LEVEL] ?? levels.info;

// Loglara yazılmaması gereken hassas alan adları (case-insensitive substring match)
const SENSITIVE_KEYS = [
  'sifre', 'password', 'pass', 'pwd',
  'tcno', 'tc_no', 'tckn', 'kimlik',
  'token', 'jwt', 'authorization', 'cookie',
  'secret', 'apikey', 'api_key',
  'cvv', 'cvc', 'kartno', 'kredikarti'
];

function isSensitiveKey(key) {
  const lower = String(key).toLowerCase();
  return SENSITIVE_KEYS.some(s => lower.includes(s));
}

/** Meta nesnesindeki hassas alanları [REDACTED] ile değiştir (derin kopya). */
function redact(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveKey(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function log(level, msg, meta = {}) {
  if (levels[level] > minLevel) return;
  const safeMeta = redact(meta);
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(Object.keys(safeMeta).length ? safeMeta : {})
  };
  const out = level === 'error' ? console.error : console.log;
  if (process.env.LOG_JSON === 'true') {
    out(JSON.stringify(entry));
  } else {
    const suffix = Object.keys(safeMeta).length ? ' ' + JSON.stringify(safeMeta) : '';
    out(`[${entry.time}] [${level.toUpperCase()}] ${msg}${suffix}`);
  }
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta)
};
