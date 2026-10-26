// Runs apps-script/Code.gs in Node for local development and tests.
// Implements only the Apps Script services Code.gs uses; sheets persist to a JSON file.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export function createGas({ codePath, dataPath, props = {} }) {
  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch {
      return {};
    }
  };
  const save = (db) => {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify(db, null, 1));
  };
  const cache = new Map();

  function services() {
    const db = load();
    // Sheets stores a leading apostrophe as "this is text" and doesn't return it.
    const unquote = (v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v);
    const sheet = (name) => {
      const rows = db[name];
      return {
        getMaxRows: () => 1000,
        setFrozenRows() {},
        getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
        appendRow(row) {
          rows.push(row.map(unquote));
          save(db);
        },
        getRange: (row, col) => ({
          setNumberFormat() {
            return this;
          },
          setValues(values) {
            values.forEach((vals, i) => {
              rows[row - 1 + i] ??= [];
              vals.forEach((v, j) => (rows[row - 1 + i][col - 1 + j] = unquote(v)));
            });
            save(db);
          },
        }),
      };
    };
    const spreadsheet = {
      getSpreadsheetTimeZone: () => "Asia/Manila",
      getSheetByName: (name) => (db[name] ? sheet(name) : null),
      insertSheet(name) {
        db[name] = [];
        save(db);
        return sheet(name);
      },
    };

    return {
      SpreadsheetApp: { openById: () => spreadsheet },
      Utilities: {
        DigestAlgorithm: { SHA_256: "sha256" },
        Charset: { UTF_8: "utf8" },
        getUuid: () => crypto.randomUUID(),
        computeDigest: (alg, value) => [...crypto.createHash(alg).update(String(value), "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
        base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString("base64"),
        formatDate(date, tz, fmt) {
          const parts = Object.fromEntries(
            new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
              .formatToParts(date)
              .map((p) => [p.type, p.value]),
          );
          return fmt.replace("yyyy", parts.year).replace("MM", parts.month).replace("dd", parts.day).replace("HH", parts.hour).replace("mm", parts.minute).replace("ss", parts.second);
        },
      },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
      CacheService: {
        getScriptCache: () => ({
          get: (k) => {
            const e = cache.get(k);
            return e && e.exp > Date.now() ? e.v : null;
          },
          put: (k, v, seconds) => cache.set(k, { v: String(v), exp: Date.now() + seconds * 1000 }),
          remove: (k) => cache.delete(k),
        }),
      },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
      ContentService: {
        MimeType: { JSON: "json" },
        createTextOutput: (text) => ({ setMimeType() { return this; }, getContent: () => text }),
      },
      console,
    };
  }

  // Fresh context per call so edits to Code.gs apply without restarting Vite.
  function run(fn, arg) {
    const ctx = vm.createContext(services());
    vm.runInContext(fs.readFileSync(codePath, "utf8"), ctx, { filename: "Code.gs" });
    return JSON.parse(ctx[fn](arg).getContent());
  }

  return {
    post: (body) => run("doPost", { postData: { contents: body } }),
    get: (params) => run("doGet", { parameter: params }),
  };
}
