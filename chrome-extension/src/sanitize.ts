import DOMPurify from "dompurify";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

export function sanitizeFormData<T extends Record<string, unknown>>(data: T): T {
  const result = {} as T;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      if (typeof value === "string") {
        result[key] = escapeHtml(value) as T[typeof key];
      } else if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
        result[key] = value as T[typeof key];
      } else if (Array.isArray(value)) {
        result[key] = value.map((v) => (typeof v === "string" ? escapeHtml(v) : v)) as T[typeof key];
      } else if (typeof value === "object" && value !== null) {
        result[key] = sanitizeFormData(value as Record<string, unknown>) as T[typeof key];
      } else {
        result[key] = value as T[typeof key];
      }
    }
  }
  return result;
}

export function sanitizeNotificationText(message: string): string {
  return escapeHtml(message).slice(0, 500);
}

const VALID_URL_PATTERN = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}(\/[^\s<>"']*)?$/;

export function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && VALID_URL_PATTERN.test(url);
  } catch {
    return false;
  }
}

export function sanitizeTemplateOutput(template: string): string {
  return DOMPurify.sanitize(template, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "svg", "math"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit"],
    ALLOW_DATA_ATTR: false,
    USE_PROFILES: { html: true },
  });
}

export function stripAllHtml(str: string): string {
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], KEEP_CONTENT: true }).trim();
}
