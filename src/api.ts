/**
 * Helper utility per gestire le chiamate API verso il backend di MepaTender AI
 * Inietta automaticamente l'header Authorization: Bearer <token> ed intercetta gli errori 401.
 */

export const AUTH_TOKEN_KEY = 'digits_auth_token';
export const AUTH_USER_KEY = 'digits_auth_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string, user?: any): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
}

export function removeStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function getStoredUser(): any | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Chiamata fetch autenticata verso il backend
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const updatedInit: RequestInit = {
    ...init,
    headers
  };

  const response = await fetch(input, updatedInit);

  // Se la risposta è 401 e la richiesta era verso un endpoint /api non-auth, rimuovi il token scaduto
  if (response.status === 401 && typeof input === 'string' && input.startsWith('/api') && !input.includes('/api/auth/login')) {
    console.warn('[API Auth] Risposta 401 Unauthorized ricevuta. Reset token sessione.');
    removeStoredToken();
    window.dispatchEvent(new Event('digits:unauthorized'));
  }

  return response;
}
