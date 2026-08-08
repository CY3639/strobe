import axios from 'axios';

const API_BASE_URL_STORAGE_KEY = 'strobe_api_base_url';
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

function normaliseBaseUrl(value) {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getStoredApiBaseUrl(defaultBaseUrl) {
  const stored = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored);
    const url = normaliseBaseUrl(parsed?.url);
    const defaultAtSet = normaliseBaseUrl(parsed?.defaultBaseUrl);

    if (url && defaultAtSet === defaultBaseUrl) {
      return url;
    }
  } catch {
    localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  }

  return null;
}

export function getDefaultApiBaseUrl() {
  return normaliseBaseUrl(import.meta.env.VITE_API_BASE_URL) || DEFAULT_API_BASE_URL;
}

export function getApiBaseUrl() {
  const defaultBaseUrl = getDefaultApiBaseUrl();
  const stored = getStoredApiBaseUrl(defaultBaseUrl);
  if (stored) return stored;

  return defaultBaseUrl;
}

export function hasApiBaseUrlOverride() {
  return Boolean(getStoredApiBaseUrl(getDefaultApiBaseUrl()));
}

export function setApiBaseUrl(nextBaseUrl) {
  const normalised = normaliseBaseUrl(nextBaseUrl);
  if (!normalised) {
    throw new Error('Please enter a valid URL, e.g. http://localhost:3000');
  }

  localStorage.setItem(API_BASE_URL_STORAGE_KEY, JSON.stringify({
    url: normalised,
    defaultBaseUrl: getDefaultApiBaseUrl(),
  }));
  api.defaults.baseURL = normalised;
  return normalised;
}

export function clearApiBaseUrlOverride() {
  localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  const defaultBaseUrl = getDefaultApiBaseUrl();
  api.defaults.baseURL = defaultBaseUrl;
  return defaultBaseUrl;
}

function fixMalformedAbsoluteUrl(value) {
  const lower = value.toLowerCase();
  if (lower.startsWith('https//')) return `https://${value.slice(7)}`;
  if (lower.startsWith('http//')) return `http://${value.slice(6)}`;
  return value;
}

export function resolveApiUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const fixed = fixMalformedAbsoluteUrl(trimmed);
  if (/^https?:\/\//i.test(fixed)) {
    return fixed;
  }

  const baseUrl = getApiBaseUrl();
  const relativePath = fixed.startsWith('/') ? fixed : `/${fixed}`;
  return `${baseUrl}${relativePath}`;
}

function showApiBaseUrlDialog(currentValue) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(2, 6, 23, 0.55)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'z-index: 9999',
      'padding: 20px',
    ].join(';');

    const dialog = document.createElement('div');
    dialog.style.cssText = [
      'width: min(540px, 100%)',
      'background: #ffffff',
      'border-radius: 14px',
      'padding: 18px',
      'box-sizing: border-box',
      'box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35)',
      'font-family: "Segoe UI", sans-serif',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Set API base URL';
    title.style.cssText = 'font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px;';

    const description = document.createElement('div');
    description.textContent = 'Enter a full URL, for example http://localhost:8000';
    description.style.cssText = 'font-size: 13px; color: #475569; margin-bottom: 12px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.placeholder = 'http://localhost:8000';
    input.autocomplete = 'off';
    input.style.cssText = [
      'width: 100%',
      'height: 40px',
      'border: 1px solid #cbd5e1',
      'border-radius: 8px',
      'padding: 0 12px',
      'box-sizing: border-box',
      'font-size: 14px',
      'margin-bottom: 14px',
    ].join(';');

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = [
      'height: 34px',
      'padding: 0 14px',
      'border: 1px solid #cbd5e1',
      'border-radius: 8px',
      'background: #ffffff',
      'color: #334155',
      'font-size: 13px',
      'font-weight: 600',
      'cursor: pointer',
    ].join(';');

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Save';
    saveButton.style.cssText = [
      'height: 34px',
      'padding: 0 14px',
      'border: 1px solid #0ea5e9',
      'border-radius: 8px',
      'background: #0ea5e9',
      'color: #ffffff',
      'font-size: 13px',
      'font-weight: 600',
      'cursor: pointer',
    ].join(';');

    let settled = false;

    const close = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        close(input.value);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close(null);
      }
    });
    cancelButton.addEventListener('click', () => close(null));
    saveButton.addEventListener('click', () => close(input.value));

    actions.appendChild(cancelButton);
    actions.appendChild(saveButton);

    dialog.appendChild(title);
    dialog.appendChild(description);
    dialog.appendChild(input);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);

    input.focus();
    input.select();
  });
}

export async function promptForApiBaseUrl() {
  const current = getApiBaseUrl();
  const next = await showApiBaseUrlDialog(current);

  if (next === null) return null;

  const updated = setApiBaseUrl(next);
  window.location.reload();
  return updated;
}

export const API_BASE_URL = getApiBaseUrl();
export const APP_BASE_URL = window.location.origin;

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('strobe_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
