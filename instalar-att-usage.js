// Variables used by Scriptable.
// icon-color: blue; icon-glyph: download;

const SOURCE = "https://raw.githubusercontent.com/koriano1980/att-usage-widget/main/att-usage-widget.js";
const NAME = "ATT Usage.js";

const req = new Request(SOURCE);
req.timeoutInterval = 20;
const code = await req.loadString();
if (!code || !code.includes("Widget de consumo de datos AT&T")) {
  throw new Error("No pude descargar el script desde GitHub. Revisa la red e inténtalo de nuevo.");
}

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();
const path = fm.joinPath(dir, NAME);
fm.writeString(path, code);
if (typeof fm.isFileStoredIniCloud === "function" && fm.isFileStoredIniCloud(path)) {
  await fm.downloadFileFromiCloud(path);
}

const ok = new Alert();
ok.title = "ATT Usage instalado";
ok.message = "Ya tienes el script ATT Usage. Ábrelo, pulsa Play (▶) y elige prepago o pospago para cargar datos reales. Luego agrégalo como widget de Scriptable en la pantalla de inicio.";
ok.addAction("OK");
await ok.presentAlert();
