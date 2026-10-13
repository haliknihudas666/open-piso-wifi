/**
 * Safe Storage Abstraction for Captive Portal Environments
 * 
 * In captive portal environments (especially iOS Captive Network Assistant / Apple WebSheet),
 * accessing `localStorage` directly can throw a SecurityError or DOMException when cookies/storage
 * are restricted in the modal webview.
 * 
 * This module provides a resilient 3-layer storage mechanism:
 * 1. window.localStorage (Primary)
 * 2. document.cookie (Secondary / Cross-session & SSID switch bridge)
 * 3. In-memory fallback map (Tertiary / Ephemeral runtime safety)
 */

const memoryStore = new Map<string, string>();

/**
 * Checks whether localStorage is available and writable
 */
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__piso_storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a cookie value by name from document.cookie
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const cookies = document.cookie.split(';');
    for (const rawCookie of cookies) {
      const trimmed = rawCookie.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        if (key === name) {
          return decodeURIComponent(trimmed.slice(eqIdx + 1));
        }
      }
    }
  } catch {
    // Ignore cookie read failures in restricted sandboxes
  }
  return null;
}

/**
 * Sets a cookie with long-lived persistence (default 7 days) and SameSite=Lax
 */
function setCookie(name: string, value: string, maxAgeSeconds: number = 604800): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  } catch {
    // Ignore cookie write failures in restricted sandboxes
  }
}

/**
 * Deletes a cookie
 */
function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } catch {}
}

export const safeStorage = {
  getItem(key: string): string | null {
    // 1. Try Memory Store first if already cached
    if (memoryStore.has(key)) {
      return memoryStore.get(key) || null;
    }

    // 2. Try window.localStorage
    if (isLocalStorageAvailable()) {
      try {
        const val = window.localStorage.getItem(key);
        if (val !== null) {
          memoryStore.set(key, val);
          return val;
        }
      } catch {}
    }

    // 3. Fallback to document.cookie
    const cookieVal = getCookie(key);
    if (cookieVal !== null) {
      memoryStore.set(key, cookieVal);
      // Back-propagate to localStorage if available
      if (isLocalStorageAvailable()) {
        try {
          window.localStorage.setItem(key, cookieVal);
        } catch {}
      }
      return cookieVal;
    }

    return null;
  },

  setItem(key: string, value: string): void {
    // 1. Always update memory store
    memoryStore.set(key, value);

    // 2. Write to window.localStorage
    if (isLocalStorageAvailable()) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    }

    // 3. Dual-write to document.cookie for resilience across SSID/CNA switches
    setCookie(key, value);
  },

  removeItem(key: string): void {
    memoryStore.delete(key);

    if (isLocalStorageAvailable()) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }

    deleteCookie(key);
  },
};

// -----------------------------------------------------------------------------
// Specialized Session & Theme Persistence Helpers
// -----------------------------------------------------------------------------

const TOKEN_KEY = 'piso_session_token';
const CODE_KEY = 'piso_session_code';
const THEME_KEY = 'piso_theme';

/**
 * Retrieves the current customer session token safely
 */
export function getStoredSessionToken(): string | null {
  return safeStorage.getItem(TOKEN_KEY);
}

/**
 * Persists the customer session token across both localStorage and cookies
 */
export function setStoredSessionToken(token: string): void {
  if (!token) return;
  safeStorage.setItem(TOKEN_KEY, token);
}

/**
 * Clears the customer session token from all storage tiers
 */
export function clearStoredSessionToken(): void {
  safeStorage.removeItem(TOKEN_KEY);
}

/**
 * Retrieves the customer's permanent session code (e.g. PW-GDQLWK) safely
 */
export function getStoredSessionCode(): string | null {
  return safeStorage.getItem(CODE_KEY);
}

/**
 * Persists the customer's session code across localStorage and cookies
 */
export function setStoredSessionCode(code: string): void {
  if (!code) return;
  safeStorage.setItem(CODE_KEY, code.trim().toUpperCase());
}

/**
 * Clears the customer's session code
 */
export function clearStoredSessionCode(): void {
  safeStorage.removeItem(CODE_KEY);
}

/**
 * Retrieves the preferred portal UI theme
 */
export function getStoredTheme(): 'light' | 'dark' | null {
  const val = safeStorage.getItem(THEME_KEY);
  return val === 'light' || val === 'dark' ? val : null;
}

/**
 * Saves the preferred portal UI theme
 */
export function setStoredTheme(theme: 'light' | 'dark'): void {
  safeStorage.setItem(THEME_KEY, theme);
}
