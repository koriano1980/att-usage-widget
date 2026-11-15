// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: signal;

/**
 * Widget de consumo de datos AT&T Estados Unidos para Scriptable (iOS).
 *
 * AT&T US no publica una API de consumidor para el saldo de datos.
 * Este script obtiene datos reales por dos caminos oficiales:
 *   1) El SMS que AT&T envía al marcar *777# (prepago) o *3282# (pospago).
 *   2) El inicio de sesión oficial en att.com/signin, dentro de un WebView,
 *      para leer el consumo visible en myAT&T después de que tú entres
 *      (incluye 2FA si AT&T lo pide). No se evaden captchas ni protecciones.
 *
 * El widget de la pantalla de inicio muestra la última consulta real en caché.
 * iOS no permite un login interactivo en segundo plano, así que para
 * refrescar hay que tocar el widget o ejecutar el script en Scriptable.
 */

const SCRIPT_NAME = "ATT Usage";
const CACHE_FILE = "att_us_usage_cache.json";
const KEY_PLAN = "ATT_US_PLAN";
const SIGNIN_URL = "https://www.att.com/signin";
const PREPAID_HELP = "https://www.att.com/support/article/wireless/KM1048283/";
const POSTPAID_HELP = "https://www.att.com/support/article/my-account/KM1051617/";
const ATT_APP_IOS = "https://apps.apple.com/us/app/at-t/id309172177";

const COLORS = {
  bg: new Color("#111111", 0.9),
  white: Color.white(),
  gray: new Color("#98989F"),
  green: new Color("#32D74B"),
  yellow: new Color("#FFD60A"),
  red: new Color("#FF453A"),
  track: new Color("#3A3A3C"),
  pill: new Color("#242428", 0.45)
};

function isWidget() {
  return typeof config !== "undefined" && config.runsInWidget;
}

function family() {
  return (typeof config !== "undefined" && config.widgetFamily) || "small";
}

function getPlan() {
  if (typeof Keychain !== "undefined" && Keychain.contains(KEY_PLAN)) {
    return Keychain.get(KEY_PLAN);
  }
  const p = String(args.widgetParameter || "").toLowerCase();
  if (p.includes("post") || p.includes("pospago")) return "postpaid";
  if (p.includes("pre")) return "prepaid";
  return "";
}

function setPlan(plan) {
  if (typeof Keychain !== "undefined") Keychain.set(KEY_PLAN, plan);
}

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
}

function loadCache() {
  const fm = FileManager.local();
  const path = cachePath();
  if (!fm.fileExists(path)) return null;
  try {
    return JSON.parse(fm.readString(path));
  } catch (e) {
    return null;
  }
}

function saveCache(data) {
  const fm = FileManager.local();
  const payload = Object.assign({}, data, { updatedAt: new Date().toISOString() });
  fm.writeString(cachePath(), JSON.stringify(payload, null, 2));
  return payload;
}

function toGB(value, unit) {
  if (value == null || !Number.isFinite(value)) return null;
  const u = String(unit || "GB").toUpperCase();
  if (u.startsWith("K")) return value / (1024 * 1024);
  if (u.startsWith("M")) return value / 1024;
  if (u.startsWith("T")) return value * 1024;
  return value;
}

function parseNum(raw) {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function daysUntil(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b - a) / 86400000);
}

function parseDateLoose(text) {
  if (!text) return null;
  const t = String(text).trim();
  let m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[1]) - 1, Number(m[2]));
  }
  m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = t.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const months = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
    noviembre: 10, diciembre: 11,
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9,
    october: 9, nov: 10, november: 10, dec: 11, december: 11
  };
  m = t.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+)?(\d{4})\b/i);
  if (m && months[m[2].toLowerCase()] != null) {
    return new Date(Number(m[3]), months[m[2].toLowerCase()], Number(m[1]));
  }
  return null;
}

/**
 * Parser flexible del SMS oficial de AT&T y del texto visible en myAT&T.
 * No asume un formato fijo no verificado: busca cantidades en GB/MB y
 * fechas de vencimiento o fin de ciclo en inglés o español.
 */
function parseUsageText(text) {
  if (!text) return null;
  const src = String(text).replace(/\u00a0/g, " ");
  const unit = "([KMGT]?B)";
  let usedGB = null;
  let remainingGB = null;
  let totalGB = null;
  let daysLeft = null;
  let expires = null;
  let unlimited = /unlimited|ilimitado/i.test(src);

  const take = (re, gbFrom, unitFrom) => {
    const m = src.match(re);
    if (!m) return null;
    return toGB(parseNum(m[gbFrom]), m[unitFrom]);
  };

  remainingGB = take(new RegExp(`(?:remaining|remain|available|left|disponibles?|restantes?|queda(?:n)?)[^\\d]{0,40}(\\d+(?:[.,]\\d+)?)\\s*${unit}`, "i"), 1, 2)
    || take(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unit}[^\\n]{0,40}(?:remaining|remain|available|left|disponibles?|restantes?)`, "i"), 1, 2);

  usedGB = take(new RegExp(`(?:used|uso|usados?|consumidos?|consumed)[^\\d]{0,40}(\\d+(?:[.,]\\d+)?)\\s*${unit}`, "i"), 1, 2)
    || take(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unit}[^\\n]{0,40}(?:used|uso|usados?|consumidos?)`, "i"), 1, 2);

  const ofMatch = src.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unit}\\s*(?:of|de)\\s*(\\d+(?:[.,]\\d+)?)\\s*${unit}`, "i"));
  if (ofMatch) {
    const a = toGB(parseNum(ofMatch[1]), ofMatch[2]);
    const b = toGB(parseNum(ofMatch[3]), ofMatch[4]);
    if (usedGB == null) usedGB = a;
    if (totalGB == null) totalGB = b;
  }

  const included = src.match(new RegExp(`(?:included|plan|allowance|total|paquete)[^\\d]{0,40}(\\d+(?:[.,]\\d+)?)\\s*${unit}`, "i"));
  if (included && totalGB == null) totalGB = toGB(parseNum(included[1]), included[2]);

  if (totalGB == null && usedGB != null && remainingGB != null) {
    totalGB = usedGB + remainingGB;
  }
  if (remainingGB == null && totalGB != null && usedGB != null) {
    remainingGB = Math.max(0, totalGB - usedGB);
  }
  if (usedGB == null && totalGB != null && remainingGB != null) {
    usedGB = Math.max(0, totalGB - remainingGB);
  }

  const daysMatch = src.match(/(?:days?\s+(?:left|remaining)|d[ií]as?\s+(?:restantes?|de vigencia)|vigencia(?:\s+de)?)\s*[:\s]*(\d+)/i)
    || src.match(/(\d+)\s*(?:days?\s+(?:left|remaining)|d[ií]as?\s+(?:restantes?|de vigencia))/i);
  if (daysMatch) daysLeft = parseInt(daysMatch[1], 10);

  const dateMatch = src.match(/(?:expires?|expiration|renews?|renewal|cycle(?:\s+ends)?|bill(?:ing)?\s+cycle|vigencia|vence|vencimiento|renueva)[^\dA-Za-z]{0,20}([A-Za-zÁÉÍÓÚáéíóú0-9 ,de\/-]{4,30})/i);
  if (dateMatch) expires = parseDateLoose(dateMatch[1]);
  if (daysLeft == null && expires) daysLeft = daysUntil(expires);

  const hasData = remainingGB != null || usedGB != null || totalGB != null;
  if (!hasData && !unlimited) return null;

  if (unlimited && totalGB == null && usedGB == null) {
    usedGB = remainingGB;
  }

  return {
    remainingGB,
    usedGB,
    totalGB,
    daysLeft,
    expiresAt: expires ? expires.toISOString() : null,
    unlimited: Boolean(unlimited),
    source: "parsed",
    rawPreview: src.replace(/\s+/g, " ").trim().slice(0, 280)
  };
}

function usageFromArgs() {
  const parts = [];
  if (args.plainTexts && args.plainTexts.length) parts.push(...args.plainTexts);
  if (args.queryParameters) {
    const q = args.queryParameters;
    for (const k of ["sms", "text", "usage", "data"]) {
      if (q[k]) parts.push(q[k]);
    }
    if (q.remaining || q.used || q.total) {
      const remaining = parseNum(q.remaining);
      const used = parseNum(q.used);
      const total = parseNum(q.total);
      const daysLeft = q.days != null ? parseInt(q.days, 10) : null;
      if (remaining != null || used != null || total != null) {
        return {
          remainingGB: remaining,
          usedGB: used,
          totalGB: total,
          daysLeft: Number.isFinite(daysLeft) ? daysLeft : null,
          expiresAt: null,
          unlimited: String(q.unlimited || "") === "1",
          source: "shortcuts"
        };
      }
    }
  }
  for (const p of parts) {
    const parsed = parseUsageText(p);
    if (parsed) {
      parsed.source = "sms-or-shortcut";
      return parsed;
    }
  }
  return null;
}

function formatGB(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const s = n.toFixed(digits).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return s;
}

function percentUsed(data) {
  if (!data) return 0;
  if (data.totalGB && data.totalGB > 0 && data.usedGB != null) {
    return Math.max(0, Math.min(100, (data.usedGB / data.totalGB) * 100));
  }
  if (data.totalGB && data.totalGB > 0 && data.remainingGB != null) {
    return Math.max(0, Math.min(100, ((data.totalGB - data.remainingGB) / data.totalGB) * 100));
  }
  if (data.unlimited) return 0;
  return 0;
}

function availableGB(data) {
  if (!data) return null;
  if (data.remainingGB != null) return data.remainingGB;
  if (data.totalGB != null && data.usedGB != null) return Math.max(0, data.totalGB - data.usedGB);
  return null;
}

function titleFor(plan) {
  return plan === "postpaid" ? "Mi AT&T" : "Mi AT&T PREPAGO";
}

function codeFor(plan) {
  return plan === "postpaid" ? "*3282#" : "*777#";
}

function freshnessLabel(iso) {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.round(hrs / 24);
  return `${days} d`;
}

function drawDots(percent, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const count = 18;
  const r = Math.max(3, Math.floor(height * 0.28));
  const gap = (width - count * r * 2) / (count - 1);
  const filled = Math.round((percent / 100) * count);
  const y = height / 2;
  for (let i = 0; i < count; i++) {
    const x = r + i * (r * 2 + gap);
    ctx.setFillColor(i < filled ? COLORS.green : COLORS.track);
    ctx.fillEllipse(new Rect(x - r, y - r, r * 2, r * 2));
  }
  return ctx.getImage();
}

function emptyState() {
  return {
    remainingGB: null,
    usedGB: null,
    totalGB: null,
    daysLeft: null,
    expiresAt: null,
    unlimited: false,
    source: "empty",
    updatedAt: null,
    needsUpdate: true
  };
}

function createWidget(data, plan) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(12, 14, 12, 14);
  const med = family() === "medium" || family() === "large";

  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  const title = top.addText(titleFor(plan || "prepaid"));
  title.font = Font.semiboldSystemFont(11);
  title.textColor = COLORS.white;
  title.lineLimit = 1;
  top.addSpacer();
  const stamp = freshnessLabel(data && data.updatedAt);
  if (stamp) {
    const s = top.addText(stamp);
    s.font = Font.regularSystemFont(10);
    s.textColor = COLORS.gray;
  }

  w.addSpacer(8);

  const needs = !data || data.needsUpdate || (availableGB(data) == null && data.usedGB == null && !data.unlimited);
  if (needs) {
    const msg = w.addText("Toca para actualizar con datos reales de AT&T");
    msg.font = Font.semiboldSystemFont(13);
    msg.textColor = COLORS.yellow;
    msg.lineLimit = 3;
    w.addSpacer(6);
    const hint = w.addText(plan === "postpaid" ? "Marca *3282# (*DATA#) o entra a myAT&T" : "Marca *777# o entra a myAT&T");
    hint.font = Font.regularSystemFont(11);
    hint.textColor = COLORS.gray;
    hint.lineLimit = 3;
    w.url = `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}`;
    return w;
  }

  const avail = availableGB(data);
  const pct = percentUsed(data);
  const big = w.addText(data.unlimited && avail == null ? "Ilimitado" : `${formatGB(avail)} GB`);
  big.font = Font.boldSystemFont(med ? 34 : 28);
  big.textColor = COLORS.white;
  big.minimumScaleFactor = 0.6;
  big.lineLimit = 1;

  const sub = w.addText(data.unlimited && avail != null ? "consumidos" : "internet disponible");
  sub.font = Font.regularSystemFont(11);
  sub.textColor = COLORS.gray;

  w.addSpacer(8);
  const bar = w.addImage(drawDots(pct, med ? 320 : 200, 16));
  bar.imageSize = new Size(med ? 280 : 155, 10);
  bar.centerAlignImage();
  w.addSpacer(6);

  const row = w.addStack();
  row.layoutHorizontally();
  const left = row.addText(`${Math.round(pct)}% usado`);
  left.font = Font.mediumSystemFont(11);
  left.textColor = pct >= 90 ? COLORS.red : pct >= 70 ? COLORS.yellow : COLORS.white;
  row.addSpacer();
  if (data.totalGB != null) {
    const mid = row.addText(`${formatGB(data.totalGB)} GB total`);
    mid.font = Font.mediumSystemFont(11);
    mid.textColor = COLORS.white;
  } else if (data.usedGB != null) {
    const mid = row.addText(`${formatGB(data.usedGB)} GB usados`);
    mid.font = Font.mediumSystemFont(11);
    mid.textColor = COLORS.white;
  }
  if (data.daysLeft != null) {
    row.addSpacer();
    const dlabel = data.daysLeft === 1 ? "1 día" : `${data.daysLeft} días`;
    const right = row.addText(`${dlabel} de vigencia`);
    right.font = Font.mediumSystemFont(11);
    right.textColor = COLORS.white;
    right.rightAlignText();
  }

  w.url = `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}`;
  return w;
}

async function pasteSms() {
  const alert = new Alert();
  alert.title = "Pegar SMS de AT&T";
  alert.message = getPlan() === "postpaid"
    ? "Marca *3282# (*DATA#) desde este iPhone. Cuando llegue el SMS de AT&T, cópialo y pégalo aquí."
    : "Marca *777# desde este iPhone. Cuando llegue el SMS de AT&T, cópialo y pégalo aquí.";
  alert.addTextField("Pega aquí el mensaje de AT&T", "");
  alert.addAction("Guardar datos reales");
  alert.addCancelAction("Cancelar");
  if ((await alert.presentAlert()) !== 0) return null;
  const text = alert.textFieldValue(0);
  const parsed = parseUsageText(text);
  if (!parsed) {
    const err = new Alert();
    err.title = "No pude leer el consumo";
    err.message = "No encontré GB usados o disponibles en ese texto. Copia el SMS completo de AT&T e inténtalo de nuevo.";
    err.addAction("OK");
    await err.presentAlert();
    return null;
  }
  parsed.source = "sms";
  return saveCache(parsed);
}

async function loginMyAtt() {
  const info = new Alert();
  info.title = "Entrar a myAT&T";
  info.message = "Se abrirá la página oficial de AT&T (att.com/signin). Inicia sesión tú mismo, con 2FA si te lo pide. Cuando veas tu consumo en pantalla, cierra la ventana para que el widget intente leerlo. No se evaden captchas ni protecciones.";
  info.addAction("Abrir myAT&T");
  info.addCancelAction("Cancelar");
  if ((await info.presentAlert()) !== 0) return null;

  const wv = new WebView();
  await wv.loadURL(SIGNIN_URL);
  await wv.present(true);
  let text = "";
  try {
    text = await wv.evaluateJavaScript("document.body ? document.body.innerText : ''");
  } catch (e) {
    text = "";
  }
  const parsed = parseUsageText(text);
  if (!parsed) {
    const err = new Alert();
    err.title = "No vi el consumo en la página";
    err.message = "El login oficial de AT&T a menudo pide 2FA y no deja leer la cuenta en segundo plano. El camino más fiable es marcar el código oficial y pegar el SMS, o consultar la app AT&T. ¿Quieres pegar el SMS ahora?";
    err.addAction("Pegar SMS");
    err.addCancelAction("Cerrar");
    if ((await err.presentAlert()) === 0) return pasteSms();
    return null;
  }
  parsed.source = "myatt-webview";
  return saveCache(parsed);
}

async function choosePlanIfNeeded() {
  let plan = getPlan();
  if (plan) return plan;
  const alert = new Alert();
  alert.title = "Tu plan de AT&T (Estados Unidos)";
  alert.message = "Esto solo elige el código oficial de consulta. Los números del widget salen del SMS de AT&T o de myAT&T, no de un ejemplo fijo.";
  alert.addAction("Prepago  (*777#)");
  alert.addAction("Pospago  (*3282# / *DATA#)");
  const i = await alert.presentAlert();
  plan = i === 1 ? "postpaid" : "prepaid";
  setPlan(plan);
  return plan;
}

async function interactiveUpdate(plan) {
  const alert = new Alert();
  alert.title = "Actualizar consumo AT&T";
  alert.message = `Camino oficial y en vivo:\n\n• Prepago: marca *777# y pega el SMS.\n• Pospago: marca *3282# (*DATA#) y pega el SMS.\n• O entra a myAT&T en la página oficial.\n\nNo hay una API pública de AT&T US que el widget pueda consultar solo, como sí existe en algunos operadores de México. El código de tu plan es ${codeFor(plan)}.`;
  alert.addAction("Pegar SMS oficial");
  alert.addAction("Abrir myAT&T (login oficial)");
  alert.addAction("Cambiar prepago/pospago");
  alert.addCancelAction("Cerrar");
  const i = await alert.presentAlert();
  if (i === 0) return pasteSms();
  if (i === 1) return loginMyAtt();
  if (i === 2) {
    if (typeof Keychain !== "undefined" && Keychain.contains(KEY_PLAN)) {
      Keychain.remove(KEY_PLAN);
    }
    const next = await choosePlanIfNeeded();
    return interactiveUpdate(next);
  }
  return loadCache();
}

async function main() {
  const fromArgs = usageFromArgs();
  if (fromArgs) saveCache(fromArgs);

  let plan = getPlan();
  let data = fromArgs || loadCache();

  if (isWidget()) {
    const w = createWidget(data || emptyState(), plan || "prepaid");
    Script.setWidget(w);
    Script.complete();
    return;
  }

  plan = await choosePlanIfNeeded();
  data = await interactiveUpdate(plan) || loadCache();
  const w = createWidget(data || emptyState(), plan);
  await w.presentSmall();
  Script.setWidget(w);
  Script.complete();
}

await main();
