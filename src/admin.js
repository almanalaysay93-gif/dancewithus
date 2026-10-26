// Admin console for the single admin: sign in, create and edit classes,
// and view each class's registrations. All data lives in the Sheet via Code.gs.
import { api, formatDate, formatTimeRange } from "./api.js";

const TOKEN_KEY = "stepfit-admin-token";
const $ = (sel, root = document) => root.querySelector(sel);

const messages = {
  login: "Username or password is wrong.",
  locked: "Too many tries. Wait 10 minutes, then sign in again.",
  "login-disabled": "Admin sign-in is off. Set ADMIN_PASSWORD in the Apps Script project first.",
  auth: "Your session ended. Sign in again.",
  busy: "The sheet is busy. Try again in a moment.",
  "not-found": "That class no longer exists. Reload the list.",
  offline: "The site isn't connected to the Sheet yet. Add the Apps Script URL to src/config.js.",
  network: "Couldn't reach the Sheet. Check your connection and try again.",
};

const fieldMessages = {
  title: "2–80 characters.",
  date: "Pick a date.",
  start: "Pick a start time.",
  end: "Must end after it starts.",
  location: "2–120 characters.",
  price: "Whole pesos, 0 or more.",
  capacity: "Between 1 and 500.",
  status: "Pick a status.",
};

let token = read(TOKEN_KEY);
let classes = [];

function read(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function write(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Private mode: the session lasts until reload.
  }
}

async function call(action, data) {
  try {
    const result = await api(action, { token, ...data });
    if (result.error === "auth") signOut(messages.auth);
    return result;
  } catch {
    return { ok: false, error: "network" };
  }
}

function alertMsg(text) {
  const box = $("#alert");
  box.textContent = text || "";
  box.hidden = !text;
  if (text) box.focus();
}

function setError(form, input, message) {
  const error = $(`#${input.id}-error`, form);
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) error.textContent = message || "";
  if (message) input.setAttribute("aria-describedby", error.id);
  else input.removeAttribute("aria-describedby");
}

function clearErrors(form) {
  $(".form-status", form).textContent = "";
  form.querySelectorAll("input, select").forEach((input) => input.id && setError(form, input, ""));
}

function busy(button, on, label) {
  button.disabled = on;
  button.toggleAttribute("aria-busy", on);
  if (label) button.textContent = label;
}

// ---------- auth ----------

function showAuth() {
  $("#dash").hidden = true;
  $("#who").hidden = true;
  $("#auth").hidden = false;
}

function showDash(admin) {
  $("#auth").hidden = true;
  $("#who").hidden = false;
  $("#who-name").textContent = admin.name;
  $("#dash").hidden = false;
  loadClasses();
}

function signOut(message) {
  if (token) api("logout", { token }).catch(() => {});
  token = "";
  write(TOKEN_KEY, "");
  showAuth();
  alertMsg(message || "");
}

function bindAuth() {
  const form = $("#login");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    alertMsg("");
    const missing = [...form.querySelectorAll("[required]")].filter((input) => !input.value.trim());
    missing.forEach((input) => setError(form, input, "Required."));
    if (missing.length) return missing[0].focus();

    const button = $("[type=submit]", form);
    busy(button, true, "Signing in…");
    const result = await call("login", Object.fromEntries(new FormData(form)));
    busy(button, false, "Sign in");
    if (result.ok) {
      token = result.token;
      write(TOKEN_KEY, token);
      form.reset();
      showDash(result.admin);
      return;
    }
    $(".form-status", form).textContent = messages[result.error] || messages.network;
    form.elements.password.select();
  });
}

// ---------- classes ----------

async function loadClasses() {
  const list = $("#class-list");
  list.setAttribute("aria-busy", "true");
  const result = await call("adminClasses");
  list.removeAttribute("aria-busy");
  if (!result.ok) {
    if (result.error !== "auth") alertMsg(messages[result.error] || messages.network);
    return;
  }
  classes = result.classes;
  renderClasses();
}

function renderClasses() {
  const list = $("#class-list");
  if (!classes.length) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: "No classes yet. Create the first one." }));
    return;
  }
  list.replaceChildren(...classes.map(classCard));
}

function classCard(c) {
  const card = document.createElement("article");
  card.className = "class-card";
  card.innerHTML = `
    <div class="class-card__top">
      <h2></h2>
      <span class="pill pill--${c.status}"></span>
    </div>
    <p class="class-card__when"></p>
    <p class="class-card__where"></p>
    <div class="meter" role="img"><span></span></div>
    <p class="class-card__count"></p>
    <div class="class-card__actions">
      <button class="btn btn--small" type="button" data-edit>Edit</button>
      <button class="link-btn" type="button" data-regs aria-expanded="false">Registrations</button>
    </div>
    <div class="regs" hidden></div>`;
  $("h2", card).textContent = c.title;
  $(".pill", card).textContent = c.status;
  $(".class-card__when", card).textContent = `${formatDate(c.date)} · ${formatTimeRange(c.start, c.end)}`;
  $(".class-card__where", card).textContent = `${c.location} · ₱${c.price}`;
  const pct = c.capacity ? Math.min(100, Math.round((c.booked / c.capacity) * 100)) : 0;
  $(".meter span", card).style.width = pct + "%";
  $(".meter", card).setAttribute("aria-label", `${c.booked} of ${c.capacity} spots booked`);
  $(".class-card__count", card).textContent = `${c.booked} / ${c.capacity} booked · ${c.left} left`;
  $("[data-edit]", card).addEventListener("click", () => openEditor(c));
  $("[data-regs]", card).addEventListener("click", (e) => toggleRegs(c, card, e.currentTarget));
  return card;
}

async function toggleRegs(c, card, button) {
  const box = $(".regs", card);
  const open = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!open));
  box.hidden = open;
  if (open) return;
  box.textContent = "Loading…";
  const result = await call("registrations", { classId: c.id });
  if (!result.ok) {
    box.textContent = messages[result.error] || messages.network;
    return;
  }
  if (!result.registrations.length) {
    box.textContent = "No one has registered yet.";
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Status</th><th>When</th></tr></thead><tbody></tbody>";
  for (const r of result.registrations) {
    const row = table.tBodies[0].insertRow();
    [r.name, r.mobile, r.email, r.status, r.timestamp].forEach((v) => (row.insertCell().textContent = v));
  }
  box.replaceChildren(table);
}

// ---------- editor ----------

const editor = () => $("#editor");
const classForm = () => $("#class-form");

function openEditor(c) {
  const form = classForm();
  form.reset();
  clearErrors(form);
  $("#editor-title").textContent = c ? "Edit class" : "New class";
  const values = c || { status: "open", price: 170, capacity: 40, start: "18:00", end: "19:00", location: "Faith's, Lapu2 Ext, Digos City (near Emcor)" };
  for (const [key, value] of Object.entries(values)) {
    if (form.elements[key]) form.elements[key].value = value;
  }
  // A card can show "full" because of bookings; the editor edits the status the admin set.
  if (c) form.elements.status.value = c.setStatus;
  editor().showModal();
  form.elements.title.focus();
}

function bindEditor() {
  $("#new-class").addEventListener("click", () => openEditor(null));
  $("#cancel-edit").addEventListener("click", () => editor().close());

  classForm().addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = classForm();
    clearErrors(form);
    const cls = Object.fromEntries(new FormData(form));
    const button = $("#save-class");
    busy(button, true, "Saving…");
    const result = await call("saveClass", { cls });
    busy(button, false, "Save class");
    if (result.ok) {
      editor().close();
      await loadClasses();
      alertMsg("");
      return;
    }
    if (result.error === "invalid") {
      result.fields.forEach((name) => setError(form, form.elements[name], fieldMessages[name]));
      form.elements[result.fields[0]].focus();
      return;
    }
    $(".form-status", form).textContent = messages[result.error] || messages.network;
  });
}

// ---------- start ----------

async function start() {
  bindAuth();
  bindEditor();
  $("#logout").addEventListener("click", () => signOut());
  if (!token) return showAuth();
  const result = await call("me");
  if (result.ok) showDash(result.admin);
  else if (result.error !== "auth") {
    showAuth();
    alertMsg(messages[result.error] || messages.network);
  }
}

start();
