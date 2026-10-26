/**
 * STEP FIT with Drei — classes, registration and admin web app.
 * Sheet: https://docs.google.com/spreadsheets/d/1EyY901FlPETvalRF3HXb3BkseQy84E6FTZ46YTCX4Uw/edit
 *
 * One-time deploy:
 * 1. Open the sheet → Extensions → Apps Script. Replace the default code with this file. Save.
 * 2. Project Settings → Script Properties → add ADMIN_SIGNUP_CODE with a secret only
 *    your admins know. Admin sign-up is refused until it is set.
 * 3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 * 4. Copy the /exec URL into src/config.js as scriptUrl, then rebuild the site.
 *
 * Tabs (Classes, Registrations, Admins) are created on first use. The two Nov 4
 * classes are seeded into Classes. To free a spot, set that registration's
 * status cell to Cancelled. To hide a class from the public page, set it to closed.
 */
var SHEET_ID = "1EyY901FlPETvalRF3HXb3BkseQy84E6FTZ46YTCX4Uw";
var TZ = "Asia/Manila";
var SESSION_SECONDS = 21600; // 6 h, the CacheService maximum
var HASH_ROUNDS = 1000;
var MAX_LOGIN_FAILS = 5;
var STATUSES = ["open", "full", "closed"];

var TABS = {
  Classes: ["id", "title", "date", "start", "end", "location", "price", "capacity", "status", "updatedAt"],
  Registrations: ["timestamp", "classId", "name", "mobile", "email", "status"],
  Admins: ["email", "name", "salt", "hash", "createdAt"],
};

var VENUE = "Faith's, Lapu2 Ext, Digos City (near Emcor)";
var SEED_CLASSES = [
  ["nov4-6pm", "Step Fit with Drei · Class 1", "2026-11-04", "18:00", "19:00", VENUE, 170, 40, "open"],
  ["nov4-7pm", "Step Fit with Drei · Class 2", "2026-11-04", "19:00", "20:00", VENUE, 170, 40, "full"],
];

// ---------- entry points ----------

function doGet(e) {
  return json_(handle_((e && e.parameter) || {}));
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "bad-request" });
  }
  return json_(handle_(data));
}

function handle_(d) {
  try {
    switch (String(d.action || "classes")) {
      case "classes":
        return { ok: true, classes: listClasses_(false) };
      case "register":
        return register_(d);
      case "signup":
        return signup_(d);
      case "login":
        return login_(d);
      case "logout":
        CacheService.getScriptCache().remove("s:" + String(d.token || ""));
        return { ok: true };
      case "me":
        return withAdmin_(d, function (admin) {
          return { ok: true, admin: admin };
        });
      case "adminClasses":
        return withAdmin_(d, function () {
          return { ok: true, classes: listClasses_(true) };
        });
      case "saveClass":
        return withAdmin_(d, function () {
          return saveClass_(d.cls || {});
        });
      case "registrations":
        return withAdmin_(d, function () {
          return registrations_(String(d.classId || ""));
        });
      default:
        return err_("unknown-action");
    }
  } catch (e) {
    console.error(e);
    return err_("server");
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function err_(code) {
  return { ok: false, error: code };
}

// ---------- public ----------

function register_(d) {
  var name = cleanName_(d.name);
  var mobile = normalizeMobile_(d.mobile);
  var email = cleanEmail_(d.email);
  var classId = String(d.classId || "");
  if (!name) return err_("name");
  if (!mobile) return err_("mobile");
  if (!email) return err_("email");

  return locked_(function () {
    var cls = findClass_(classId);
    if (!cls || cls.status === "closed") return err_("class");
    if (cls.status === "full") return { ok: false, error: "full", left: 0 };
    var dup = records_("Registrations").some(function (r) {
      return (
        r.classId === classId &&
        r.status !== "Cancelled" &&
        (normalizeMobile_(r.mobile) === mobile || r.email.toLowerCase() === email)
      );
    });
    if (dup) return { ok: false, error: "duplicate", left: cls.left };
    tab_("Registrations").appendRow([now_(), classId, safe_(name), mobile, email, "Reserved"]);
    cls.booked += 1;
    cls.left -= 1;
    if (cls.left === 0) cls.status = "full";
    return { ok: true, left: cls.left, cls: cls };
  });
}

// ---------- admin ----------

function signup_(d) {
  var code = PropertiesService.getScriptProperties().getProperty("ADMIN_SIGNUP_CODE");
  if (!code) return err_("signup-disabled");
  if (String(d.code || "") !== code) return err_("code");
  var name = cleanName_(d.name);
  var email = cleanEmail_(d.email);
  var password = String(d.password || "");
  if (!name) return err_("name");
  if (!email) return err_("email");
  if (password.length < 8 || password.length > 128) return err_("password");

  return locked_(function () {
    if (findAdmin_(email)) return err_("exists");
    var salt = Utilities.getUuid();
    tab_("Admins").appendRow([email, safe_(name), salt, hash_(salt, password), now_()]);
    return session_(email, name);
  });
}

function login_(d) {
  var email = cleanEmail_(d.email);
  var password = String(d.password || "");
  var cache = CacheService.getScriptCache();
  var key = "f:" + email;
  var fails = Number(cache.get(key) || 0);
  if (fails >= MAX_LOGIN_FAILS) return err_("locked");
  var admin = email ? findAdmin_(email) : null;
  if (!admin || hash_(admin.salt, password) !== admin.hash) {
    cache.put(key, String(fails + 1), 600);
    return err_("login");
  }
  cache.remove(key);
  return session_(admin.email, admin.name);
}

function session_(email, name) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  CacheService.getScriptCache().put("s:" + token, email, SESSION_SECONDS);
  return { ok: true, token: token, admin: { email: email, name: name } };
}

function withAdmin_(d, fn) {
  var token = String(d.token || "");
  var email = token ? CacheService.getScriptCache().get("s:" + token) : null;
  var admin = email ? findAdmin_(email) : null;
  if (!admin) return err_("auth");
  return fn({ email: admin.email, name: admin.name });
}

function saveClass_(c) {
  var v = {
    title: cleanText_(c.title, 2, 80),
    date: cleanDate_(c.date),
    start: cleanTime_(c.start),
    end: cleanTime_(c.end),
    location: cleanText_(c.location, 2, 120),
    price: cleanInt_(c.price, 0, 100000),
    capacity: cleanInt_(c.capacity, 1, 500),
    status: STATUSES.indexOf(c.status) >= 0 ? c.status : "",
  };
  var bad = Object.keys(v).filter(function (k) {
    return v[k] === "" || v[k] === null;
  });
  if (bad.indexOf("start") < 0 && bad.indexOf("end") < 0 && v.end <= v.start) bad.push("end");
  if (bad.length) return { ok: false, error: "invalid", fields: bad };

  return locked_(function () {
    var sheet = tab_("Classes");
    var id = String(c.id || "");
    var row = [id, safe_(v.title), v.date, v.start, v.end, safe_(v.location), v.price, v.capacity, v.status, now_()];
    if (id) {
      var existing = records_("Classes").filter(function (r) {
        return r.id === id;
      })[0];
      if (!existing) return err_("not-found");
      sheet.getRange(existing._row, 1, 1, row.length).setValues([row]);
    } else {
      id = "c" + Utilities.getUuid().replace(/-/g, "").slice(0, 10);
      row[0] = id;
      sheet.appendRow(row);
    }
    return { ok: true, cls: findClass_(id) };
  });
}

function registrations_(classId) {
  if (!findClass_(classId)) return err_("not-found");
  var list = records_("Registrations")
    .filter(function (r) {
      return r.classId === classId && r.name;
    })
    .map(function (r) {
      return { timestamp: r.timestamp, name: r.name, mobile: r.mobile, email: r.email, status: r.status };
    });
  return { ok: true, registrations: list };
}

// ---------- sheet access ----------

function tab_(name) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  var head = TABS[name];
  // Plain text keeps dates, times and leading-zero mobiles exactly as written.
  sheet.getRange(1, 1, sheet.getMaxRows(), head.length).setNumberFormat("@");
  sheet.appendRow(head);
  sheet.setFrozenRows(1);
  if (name === "Classes") {
    SEED_CLASSES.forEach(function (r) {
      sheet.appendRow(r.concat([now_()]));
    });
  }
  return sheet;
}

function records_(name) {
  var head = TABS[name];
  var values = tab_(name).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var rec = { _row: i + 1 };
    for (var j = 0; j < head.length; j++) rec[head[j]] = cell_(values[i][j], head[j]);
    out.push(rec);
  }
  return out;
}

function cell_(value, key) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    var fmt = key === "start" || key === "end" ? "HH:mm" : key === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm:ss";
    return Utilities.formatDate(value, TZ, fmt);
  }
  return value === null || value === undefined ? "" : String(value);
}

function listClasses_(includeClosed) {
  var booked = {};
  records_("Registrations").forEach(function (r) {
    if (r.status !== "Cancelled" && r.name) booked[r.classId] = (booked[r.classId] || 0) + 1;
  });
  return records_("Classes")
    .filter(function (c) {
      return c.id && (includeClosed || c.status !== "closed");
    })
    .map(function (c) {
      var capacity = Number(c.capacity) || 0;
      var count = booked[c.id] || 0;
      var left = Math.max(0, capacity - count);
      return {
        id: c.id,
        title: c.title,
        date: c.date,
        start: c.start,
        end: c.end,
        location: c.location,
        price: Number(c.price) || 0,
        capacity: capacity,
        booked: count,
        left: left,
        status: c.status === "open" && left === 0 ? "full" : c.status,
        setStatus: c.status, // what an admin chose; status above also reflects bookings
      };
    })
    .sort(function (a, b) {
      return (a.date + a.start).localeCompare(b.date + b.start);
    });
}

function findClass_(id) {
  return listClasses_(true).filter(function (c) {
    return c.id === id;
  })[0];
}

function findAdmin_(email) {
  return records_("Admins").filter(function (a) {
    return a.email.toLowerCase() === email;
  })[0];
}

function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return err_("busy");
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------- helpers ----------

function now_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
}

function hash_(salt, password) {
  var value = salt + ":" + password;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    value = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value + salt, Utilities.Charset.UTF_8));
  }
  return value;
}

// A leading = + - @ would make Sheets treat user text as a formula.
function safe_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function cleanText_(value, min, max) {
  var text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length >= min && text.length <= max ? text : "";
}

function cleanName_(value) {
  var name = cleanText_(value, 2, 80);
  return /[A-Za-zÀ-ÿÑñ]/.test(name) ? name : "";
}

function cleanEmail_(value) {
  var email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
}

function normalizeMobile_(value) {
  var digits = String(value || "").replace(/\D/g, "");
  if (digits.indexOf("63") === 0 && digits.length === 12) digits = "0" + digits.slice(2);
  if (digits.length === 10 && digits.charAt(0) === "9") digits = "0" + digits;
  return /^09\d{9}$/.test(digits) ? digits : "";
}

function cleanDate_(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return "";
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? m[0] : "";
}

function cleanTime_(value) {
  var text = String(value || "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function cleanInt_(value, min, max) {
  var n = Number(value);
  return String(value).trim() !== "" && Math.floor(n) === n && n >= min && n <= max ? n : null;
}
