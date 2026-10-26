// Public registration: loads the live classes from the Sheet, validates locally,
// then saves through the Apps Script web app (apps-script/Code.gs).
import { api, formatDate, formatTimeRange } from "./api.js";
import { cleanEmail, cleanName, formatMobile, normalizeMobile } from "./validate.js";

const messages = {
  name: "Enter the name you want on the list.",
  mobile: "Use a Philippine mobile number, like 0917 123 4567.",
  email: "Enter an email we can reach you at, like you@example.com.",
  attend: "Confirm you can come and pay at the venue.",
  class: "Pick a class that's still open.",
  full: "That class just filled up. Pick another one.",
  duplicate: "That mobile number or email is already on this class's list.",
  busy: "The list is busy. Wait a moment and try again.",
  offline: "The list isn't connected yet. Try this page again after it's linked.",
  network: "Couldn't reach the list. Check your connection and try again.",
};

let classes = [];

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

function spotsText(c) {
  if (c.status === "full") return "Fully booked. See you next session!";
  return `₱${c.price} · ${c.left === 1 ? "1 spot" : c.left + " spots"} left · first come, first serve`;
}

function renderSlots() {
  const slots = document.querySelector("#slots");
  slots.replaceChildren(
    ...classes.map((c) => {
      const full = c.status !== "open";
      const action = full
        ? el("span", { className: "btn btn--off", textContent: "Full" })
        : el("a", { className: "btn", href: "#register", textContent: "Pick this class" });
      if (!full) action.addEventListener("click", () => selectClass(c.id));
      action.toggleAttribute("aria-disabled", full);
      return el("article", { className: "slot" + (full ? " slot--full" : "") }, [
        el("h3", { textContent: c.title }),
        el("p", { className: "slot__date", textContent: formatDate(c.date) }),
        el("p", { className: "slot__time", textContent: formatTimeRange(c.start, c.end) }),
        el("p", { textContent: spotsText(c) }),
        el("p", { className: "slot__where", textContent: c.location }),
        action,
      ]);
    }),
  );
}

function renderOptions() {
  const box = document.querySelector("#class-options");
  const firstOpen = classes.find((c) => c.status === "open");
  box.replaceChildren(
    ...classes.map((c) => {
      const full = c.status !== "open";
      const input = el("input", { type: "radio", name: "classId", value: c.id, disabled: full, checked: c === firstOpen });
      const when = `${formatDate(c.date).replace(/^(\w{3})\w*/, "$1").replace(/, \d{4}$/, "")}`;
      return el("label", { className: "choice" + (full ? " is-full" : "") }, [
        input,
        el("span", {}, [el("strong", { textContent: formatTimeRange(c.start, c.end) }), ` ${c.title} · ${when} · ${full ? "full" : c.left + " left"}`]),
      ]);
    }),
  );
  if (!firstOpen) closeForm();
}

function selectClass(id) {
  const input = document.querySelector(`#class-options input[value="${CSS.escape(id)}"]`);
  if (input && !input.disabled) input.checked = true;
}

function applyClasses(list) {
  if (!Array.isArray(list) || !list.length) return;
  classes = list;
  renderSlots();
  renderOptions();
}

async function loadClasses() {
  try {
    const result = await api("classes");
    if (result.ok) applyClasses(result.classes);
  } catch {
    // The static Nov 4 cards stay if the list can't load.
  }
}

function closeForm() {
  document.querySelector("#signup").hidden = true;
  document.querySelector("#closed").hidden = false;
}

function showSuccess(name, cls) {
  const done = document.querySelector("#done");
  document.querySelector("#signup").hidden = true;
  done.querySelector("#done-detail").textContent = cls
    ? `${name} is saved for ${cls.title}, ${formatTimeRange(cls.start, cls.end)}, ${formatDate(cls.date)}.`
    : `${name} is on the list.`;
  done.querySelector("#done-pay").textContent = cls
    ? `Pay ₱${cls.price} at ${cls.location}. Your stepper is included.`
    : "Your stepper is included.";
  done.hidden = false;
  done.closest(".panel").classList.add("is-done");
  done.querySelector("#done-title").focus();
}

function setFieldError(input, message) {
  const field = input.closest(".field") || input.closest(".choices");
  const error = field ? field.querySelector(".field-error") : null;
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) error.textContent = message || "";
  if (message && error) input.setAttribute("aria-describedby", error.id);
  else input.removeAttribute("aria-describedby");
}

function bindForm() {
  const form = document.querySelector("#signup");
  if (!form) return;
  const nameInput = form.querySelector("#name");
  const mobileInput = form.querySelector("#mobile");
  const emailInput = form.querySelector("#email");
  const attendInput = form.querySelector("#attend");
  const status = document.querySelector("#form-status");
  const submit = form.querySelector("[type=submit]");

  mobileInput.addEventListener("blur", () => {
    const digits = normalizeMobile(mobileInput.value);
    if (digits) mobileInput.value = formatMobile(digits);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    if (form.querySelector("#company").value) {
      status.textContent = "Leave the extra field empty and try again.";
      status.focus();
      return;
    }

    const name = cleanName(nameInput.value);
    const mobile = normalizeMobile(mobileInput.value);
    const email = cleanEmail(emailInput.value);
    const classInput = form.querySelector("input[name=classId]:checked");
    const classId = classInput && !classInput.disabled ? classInput.value : "";

    const checks = [
      [nameInput, name ? "" : messages.name],
      [mobileInput, mobile ? "" : messages.mobile],
      [emailInput, email ? "" : messages.email],
      [classInput || form.querySelector("input[name=classId]"), classId ? "" : messages.class],
      [attendInput, attendInput.checked ? "" : messages.attend],
    ];
    checks.forEach(([input, message]) => input && setFieldError(input, message));
    const invalid = checks.find(([input, message]) => input && message);
    if (invalid) {
      invalid[0].focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "Saving…";
    submit.setAttribute("aria-busy", "true");
    try {
      const result = await api("register", { classId, name, mobile, email });
      if (result.ok) {
        showSuccess(name, result.cls);
        loadClasses();
        return;
      }
      const key = result.error || "network";
      status.textContent = messages[key] || messages.network;
      if (key === "full") loadClasses();
      status.focus();
    } catch {
      status.textContent = messages.network;
      status.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = "Save my spot";
      submit.removeAttribute("aria-busy");
    }
  });
}

export function initRegister() {
  bindForm();
  loadClasses();
}
