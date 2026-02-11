/**
 * Alabobai Authentication Service
 * Ultra Agent V4.0 - Enterprise Authentication with JWT Tokens
 *
 * Features:
 * - JWT access & refresh token management
 * - Email/password authentication
 * - OAuth provider support (Google, GitHub)
 * - Password reset flow
 * - Session management
 * - Token refresh mechanism
 */

import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash?: string;
  emailVerified: boolean;
  oauthProvider?: 'google' | 'github';
  oauthId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface TokenPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface OAuthUserData {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  bcryptSaltRounds: number;
  passwordResetExpiry: number; // in minutes
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ============================================================================
// Authentication Service
// ============================================================================

export class AuthService {
  private config: AuthConfig;

  constructor(config?: Partial<AuthConfig>) {
    this.config = {
      jwtSecret: process.env.JWT_SECRET || 'alabobai-ultra-agent-v4-secret-key',
      jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'alabobai-ultra-agent-v4-refresh-secret',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      bcryptSaltRounds: 12,
      passwordResetExpiry: 60, // 60 minutes
      ...config,
    };
  }

  // --------------------------------------------------------------------------
  // Token Generation
  // --------------------------------------------------------------------------

  /**
   * Generate access token for user
   */
  generateAccessToken(user: User): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      type: 'access',
    };

    const options: SignOptions = {
      expiresIn: this.config.accessTokenExpiry as any,
      issuer: 'alabobai',
      audience: 'ultra-agent-v4',
    };

    return jwt.sign(payload, this.config.jwtSecret, options);
  }

  /**
   * Generate refresh token for user
   */
  generateRefreshToken(user: User): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      type: 'refresh',
    };

    const options: SignOptions = {
      expiresIn: this.config.refreshTokenExpiry as any,
      issuer: 'alabobai',
      audience: 'ultra-agent-v4',
    };

    return jwt.sign(payload, this.config.jwtRefreshSecret, options);
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokenPair(user: User, rememberMe: boolean = false): AuthTokens {
    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Calculate expiry in seconds
    const expiresIn = rememberMe ? 7 * 24 * 60 * 60 : 15 * 60; // 7 days or 15 minutes

    return {
      token,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  // --------------------------------------------------------------------------
  // Token Verification
  // --------------------------------------------------------------------------

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        issuer: 'alabobai',
        audience: 'ultra-agent-v4',
      }) as TokenPayload;

      if (payload.type !== 'access') {
        throw new AuthError('Invalid token type', 'INVALID_TOKEN_TYPE', 401);
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthError('Token expired', 'TOKEN_EXPIRED', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthError('Invalid token', 'INVALID_TOKEN', 401);
      }
      throw error;
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.config.jwtRefreshSecret, {
        issuer: 'alabobai',
        audience: 'ultra-agent-v4',
      }) as TokenPayload;

      if (payload.type !== 'refresh') {
        throw new AuthError('Invalid token type', 'INVALID_TOKEN_TYPE', 401);
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401);
      }
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Password Handling
  // --------------------------------------------------------------------------

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.config.bcryptSaltRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // --------------------------------------------------------------------------
  // Password Reset
  // --------------------------------------------------------------------------

  /**
   * Generate password reset token
   */
  generatePasswordResetToken(): { token: string; hashedToken: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + this.config.passwordResetExpiry * 60 * 1000);

    return {
      token,
      hashedToken,
      expiresAt,
    };
  }

  /**
   * Hash password reset token for storage
   */
  hashResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // --------------------------------------------------------------------------
  // Email Verification
  // --------------------------------------------------------------------------

  /**
   * Generate email verification token
   */
  generateEmailVerificationToken(): { token: string; hashedToken: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    return {
      token,
      hashedToken,
      expiresAt,
    };
  }

  // --------------------------------------------------------------------------
  // OAuth Helpers
  // --------------------------------------------------------------------------

  /**
   * Generate OAuth state parameter for CSRF protection
   */
  generateOAuthState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Verify OAuth state parameter
   */
  verifyOAuthState(state: string, expectedState: string): boolean {
    return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState));
  }

  // --------------------------------------------------------------------------
  // Session Management
  // --------------------------------------------------------------------------

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }

  /**
   * Create a session identifier
   */
  createSessionId(): string {
    return crypto.randomUUID();
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Sanitize user object for response (remove sensitive data)
   */
  sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Normalize email (lowercase and trim)
   */
  normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Check if token is about to expire (within 5 minutes)
   */
  isTokenExpiringSoon(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded || !decoded.exp) return true;

      const expiresAt = decoded.exp * 1000;
      const fiveMinutes = 5 * 60 * 1000;

      return Date.now() > expiresAt - fiveMinutes;
    } catch {
      return true;
    }
  }
}

// ============================================================================
// Express Middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Authentication middleware for Express routes
 */
export function authMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = authService.extractTokenFromHeader(req.headers.authorization);

      if (!token) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Authentication token is required',
          },
        });
      }

      const payload = authService.verifyAccessToken(token);
      req.user = payload;
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred',
        },
      });
    }
  };
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export function optionalAuthMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = authService.extractTokenFromHeader(req.headers.authorization);

      if (token) {
        const payload = authService.verifyAccessToken(token);
        req.user = payload;
      }

      next();
    } catch {
      // Silently continue without user
      next();
    }
  };
}

// ============================================================================
// Route Handlers (Example Implementation)
// ============================================================================

/**
 * Example route handlers for auth endpoints
 * These would be used in your Express router
 */
export const authRoutes = {
  /**
   * POST /api/auth/login
   */
  async login(
    authService: AuthService,
    credentials: LoginCredentials,
    findUserByEmail: (email: string) => Promise<User | null>
  ): Promise<{ user: Omit<User, 'passwordHash'>; tokens: AuthTokens }> {
    const { email, password, rememberMe } = credentials;

    // Validate input
    if (!authService.validateEmail(email)) {
      throw new AuthError('Invalid email format', 'INVALID_EMAIL', 400);
    }

    // Find user
    const normalizedEmail = authService.normalizeEmail(email);
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS', 401);
    }

    // Check password
    if (!user.passwordHash) {
      throw new AuthError('Please use OAuth to sign in', 'OAUTH_REQUIRED', 400);
    }

    const passwordValid = await authService.verifyPassword(password, user.passwordHash);

    if (!passwordValid) {
      throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS', 401);
    }

    // Generate tokens
    const tokens = authService.generateTokenPair(user, rememberMe);

    return {
      user: authService.sanitizeUser(user),
      tokens,
    };
  },

  /**
   * POST /api/auth/signup
   */
  async signup(
    authService: AuthService,
    data: SignupData,
    findUserByEmail: (email: string) => Promise<User | null>,
    createUser: (user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) => Promise<User>
  ): Promise<{ user: Omit<User, 'passwordHash'>; tokens: AuthTokens }> {
    const { firstName, lastName, email, password } = data;

    // Validate input
    if (!authService.validateEmail(email)) {
      throw new AuthError('Invalid email format', 'INVALID_EMAIL', 400);
    }

    const passwordValidation = authService.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new AuthError(passwordValidation.errors[0], 'WEAK_PASSWORD', 400);
    }

    // Check if user exists
    const normalizedEmail = authService.normalizeEmail(email);
    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      throw new AuthError('Email already in use', 'EMAIL_EXISTS', 409);
    }

    // Hash password and create user
    const passwordHash = await authService.hashPassword(password);

    const user = await createUser({
      email: normalizedEmail,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      passwordHash,
      emailVerified: false,
    });

    // Generate tokens
    const tokens = authService.generateTokenPair(user);

    return {
      user: authService.sanitizeUser(user),
      tokens,
    };
  },

  /**
   * POST /api/auth/refresh
   */
  async refresh(
    authService: AuthService,
    refreshToken: string,
    findUserById: (id: string) => Promise<User | null>
  ): Promise<AuthTokens> {
    // Verify refresh token
    const payload = authService.verifyRefreshToken(refreshToken);

    // Get user
    const user = await findUserById(payload.userId);

    if (!user) {
      throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
    }

    // Generate new tokens
    return authService.generateTokenPair(user);
  },

  /**
   * POST /api/auth/forgot-password
   */
  async forgotPassword(
    authService: AuthService,
    email: string,
    findUserByEmail: (email: string) => Promise<User | null>,
    saveResetToken: (userId: string, hashedToken: string, expiresAt: Date) => Promise<void>,
    sendResetEmail: (email: string, token: string) => Promise<void>
  ): Promise<{ message: string }> {
    // Validate email
    if (!authService.validateEmail(email)) {
      throw new AuthError('Invalid email format', 'INVALID_EMAIL', 400);
    }

    // Find user (don't reveal if user exists)
    const normalizedEmail = authService.normalizeEmail(email);
    const user = await findUserByEmail(normalizedEmail);

    if (user) {
      // Generate reset token
      const { token, hashedToken, expiresAt } = authService.generatePasswordResetToken();

      // Save token
      await saveResetToken(user.id, hashedToken, expiresAt);

      // Send email
      await sendResetEmail(user.email, token);
    }

    // Always return success to prevent email enumeration
    return {
      message: 'If an account exists with this email, you will receive password reset instructions.',
    };
  },

  /**
   * POST /api/auth/reset-password
   */
  async resetPassword(
    authService: AuthService,
    data: PasswordResetConfirm,
    findResetToken: (hashedToken: string) => Promise<{ userId: string; expiresAt: Date } | null>,
    findUserById: (id: string) => Promise<User | null>,
    updateUserPassword: (userId: string, passwordHash: string) => Promise<void>,
    deleteResetToken: (hashedToken: string) => Promise<void>
  ): Promise<{ message: string }> {
    const { token, newPassword } = data;

    // Validate password
    const passwordValidation = authService.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new AuthError(passwordValidation.errors[0], 'WEAK_PASSWORD', 400);
    }

    // Hash token and find it
    const hashedToken = authService.hashResetToken(token);
    const resetData = await findResetToken(hashedToken);

    if (!resetData) {
      throw new AuthError('Invalid or expired reset token', 'INVALID_RESET_TOKEN', 400);
    }

    // Check expiry
    if (new Date() > resetData.expiresAt) {
      await deleteResetToken(hashedToken);
      throw new AuthError('Reset token has expired', 'RESET_TOKEN_EXPIRED', 400);
    }

    // Find user
    const user = await findUserById(resetData.userId);

    if (!user) {
      throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
    }

    // Update password
    const passwordHash = await authService.hashPassword(newPassword);
    await updateUserPassword(user.id, passwordHash);

    // Delete reset token
    await deleteResetToken(hashedToken);

    return {
      message: 'Password has been reset successfully.',
    };
  },
};

// ============================================================================
// Default Export
// ============================================================================

export default AuthService;
