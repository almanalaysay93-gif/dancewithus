/** Shared form checks. Keep these in step with apps-script/Code.gs. */

export function cleanName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return "";
  if (!/\p{L}/u.test(name)) return "";
  return name;
}

export function normalizeMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) digits = "0" + digits.slice(2);
  if (digits.length === 10 && digits.startsWith("9")) digits = "0" + digits;
  return /^09\d{9}$/.test(digits) ? digits : "";
}

export function formatMobile(digits) {
  if (!digits) return "";
  return digits.replace(/^(09\d{2})(\d{3})(\d{4})$/, "$1 $2 $3");
}

export function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
}
