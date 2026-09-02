import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface UserPayload {
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

const getJwtSecret = (): string => {
  return process.env.JWT_SECRET || 'fallback_digits_mepatender_jwt_secret_2026';
};

const getAdminUsername = (): string => {
  return process.env.ADMIN_USERNAME || 'admin@digits.it';
};

const getAdminPassword = (): string => {
  return process.env.ADMIN_PASSWORD || 'digits_secure_admin_2026!';
};

const getApiKey = (): string => {
  return process.env.API_KEY || 'digits_internal_api_key_2026';
};

/**
 * Genera un token JWT con validità 24 ore
 */
export function generateToken(payload: { username: string; role: string }): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: '24h' });
}

/**
 * Verifica un token JWT ed estrae il payload
 */
export function verifyToken(token: string): UserPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as UserPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Handler per l'endpoint di login (POST /api/auth/login)
 */
export function handleLogin(req: Request, res: Response) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username e password sono richiesti.' });
  }

  const validUsername = getAdminUsername();
  const validPassword = getAdminPassword();

  // Verifica credenziali
  if (username === validUsername && password === validPassword) {
    const token = generateToken({ username, role: 'admin' });
    return res.json({
      success: true,
      token,
      user: {
        username,
        role: 'admin'
      }
    });
  }

  return res.status(401).json({ error: 'Credenziali di accesso non valide.' });
}

/**
 * Middleware Express per proteggere tutti gli endpoint /api/*
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Rotte pubbliche esentate dall'autenticazione
  const publicRoutes = [
    '/api/auth/login',
    '/api/health'
  ];

  if (publicRoutes.includes(req.path)) {
    return next();
  }

  // 1. Controllo tramite API Key (Header x-api-key) per integrazioni / script automatizzati
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && apiKeyHeader === getApiKey()) {
    req.user = { username: 'api_service', role: 'service' };
    return next();
  }

  // 2. Controllo tramite JWT Bearer Token (Header Authorization)
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      error: 'Autenticazione richiesta. Header Authorization (Bearer Token) o x-api-key mancante.',
      code: 'AUTH_REQUIRED'
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Formato header Authorization non valido. Usare il formato: Bearer <token>.',
      code: 'INVALID_AUTH_FORMAT'
    });
  }

  const token = parts[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      error: 'Token di autenticazione non valido o scaduto. Effettuare nuovamente il login.',
      code: 'INVALID_TOKEN'
    });
  }

  // Token valido: attacca l'utente alla request e procedi
  req.user = decoded;
  next();
}
