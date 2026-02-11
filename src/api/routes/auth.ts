/**
 * Alabobai Authentication API Routes
 * Endpoints for user authentication, registration, and session management
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import AuthService, {
  authMiddleware,
  AuthError,
  User,
  AuthTokens,
  TokenPayload
} from '../../services/auth.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const SignupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long')
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false)
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format')
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
});

// ============================================================================
// TYPES
// ============================================================================

export interface AuthRouterConfig {
  authService?: AuthService;
  userStore?: UserStore;
  tokenBlacklist?: TokenBlacklist;
  emailService?: EmailService;
}

/**
 * User store interface - can be implemented with any database
 */
export interface UserStore {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;
}

/**
 * Token blacklist interface for logout functionality
 */
export interface TokenBlacklist {
  add(token: string, expiresAt: Date): Promise<void>;
  has(token: string): Promise<boolean>;
}

/**
 * Password reset token store interface
 */
export interface ResetTokenStore {
  save(userId: string, hashedToken: string, expiresAt: Date): Promise<void>;
  find(hashedToken: string): Promise<{ userId: string; expiresAt: Date } | null>;
  delete(hashedToken: string): Promise<void>;
}

/**
 * Email service interface for sending password reset emails
 */
export interface EmailService {
  sendPasswordResetEmail(email: string, resetToken: string): Promise<void>;
}

// ============================================================================
// IN-MEMORY STORES (Replace with database implementation in production)
// ============================================================================

class InMemoryUserStore implements UserStore {
  private users: Map<string, User> = new Map();
  private emailIndex: Map<string, string> = new Map();

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const userId = this.emailIndex.get(normalizedEmail);
    if (!userId) return null;
    return this.users.get(userId) || null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = new Date();
    const user: User = {
      ...userData,
      id: uuid(),
      createdAt: now,
      updatedAt: now
    };
    this.users.set(user.id, user);
    this.emailIndex.set(user.email.toLowerCase().trim(), user.id);
    return user;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.passwordHash = passwordHash;
      user.updatedAt = new Date();
    }
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastLoginAt = new Date();
      user.updatedAt = new Date();
    }
  }
}

class InMemoryTokenBlacklist implements TokenBlacklist {
  private blacklist: Map<string, Date> = new Map();

  constructor() {
    // Periodically clean up expired tokens
    setInterval(() => {
      const now = new Date();
      for (const [token, expiresAt] of this.blacklist.entries()) {
        if (expiresAt < now) {
          this.blacklist.delete(token);
        }
      }
    }, 60 * 1000); // Clean every minute
  }

  async add(token: string, expiresAt: Date): Promise<void> {
    this.blacklist.set(token, expiresAt);
  }

  async has(token: string): Promise<boolean> {
    const expiresAt = this.blacklist.get(token);
    if (!expiresAt) return false;
    if (expiresAt < new Date()) {
      this.blacklist.delete(token);
      return false;
    }
    return true;
  }
}

class InMemoryResetTokenStore implements ResetTokenStore {
  private tokens: Map<string, { userId: string; expiresAt: Date }> = new Map();

  async save(userId: string, hashedToken: string, expiresAt: Date): Promise<void> {
    this.tokens.set(hashedToken, { userId, expiresAt });
  }

  async find(hashedToken: string): Promise<{ userId: string; expiresAt: Date } | null> {
    return this.tokens.get(hashedToken) || null;
  }

  async delete(hashedToken: string): Promise<void> {
    this.tokens.delete(hashedToken);
  }
}

class MockEmailService implements EmailService {
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    // In production, integrate with an email service like SendGrid, AWS SES, etc.
    console.log(`[Email Service] Password reset email sent to ${email}`);
    console.log(`[Email Service] Reset token: ${resetToken}`);
    // The reset link would be: https://your-app.com/reset-password?token=${resetToken}
  }
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createAuthRouter(config: AuthRouterConfig = {}): Router {
  const router = Router();
  const authService = config.authService || new AuthService();
  const userStore = config.userStore || new InMemoryUserStore();
  const tokenBlacklist = config.tokenBlacklist || new InMemoryTokenBlacklist();
  const resetTokenStore = new InMemoryResetTokenStore();
  const emailService = config.emailService || new MockEmailService();

  // Apply auth middleware to protected routes
  const requireAuth = authMiddleware(authService);

  // ============================================================================
  // POST /api/auth/signup - Register a new user
  // ============================================================================

  router.post('/signup', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = SignupSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          }
        });
      }

      const { email, password, firstName, lastName } = validation.data;

      // Normalize email
      const normalizedEmail = authService.normalizeEmail(email);

      // Check if user already exists
      const existingUser = await userStore.findByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: 'An account with this email already exists'
          }
        });
      }

      // Validate password strength
      const passwordValidation = authService.validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: passwordValidation.errors[0],
            details: passwordValidation.errors
          }
        });
      }

      // Hash password
      const passwordHash = await authService.hashPassword(password);

      // Create user
      const user = await userStore.create({
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        passwordHash,
        emailVerified: false
      });

      // Generate tokens
      const tokens = authService.generateTokenPair(user);

      // Return sanitized user and tokens
      res.status(201).json({
        success: true,
        data: {
          user: authService.sanitizeUser(user),
          ...tokens
        }
      });

    } catch (error) {
      console.error('[Auth API] Signup error:', error);
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred during registration'
        }
      });
    }
  });

  // ============================================================================
  // POST /api/auth/login - Authenticate user and return tokens
  // ============================================================================

  router.post('/login', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = LoginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          }
        });
      }

      const { email, password, rememberMe } = validation.data;

      // Find user
      const normalizedEmail = authService.normalizeEmail(email);
      const user = await userStore.findByEmail(normalizedEmail);

      if (!user) {
        // Use generic message to prevent email enumeration
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        });
      }

      // Check if user has password (might be OAuth only)
      if (!user.passwordHash) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'OAUTH_REQUIRED',
            message: 'This account uses social login. Please sign in with your OAuth provider.'
          }
        });
      }

      // Verify password
      const isValid = await authService.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        });
      }

      // Update last login
      await userStore.updateLastLogin(user.id);

      // Generate tokens
      const tokens = authService.generateTokenPair(user, rememberMe);

      res.json({
        success: true,
        data: {
          user: authService.sanitizeUser(user),
          ...tokens
        }
      });

    } catch (error) {
      console.error('[Auth API] Login error:', error);
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred during login'
        }
      });
    }
  });

  // ============================================================================
  // POST /api/auth/logout - Invalidate current token
  // ============================================================================

  router.post('/logout', requireAuth, async (req: Request, res: Response) => {
    try {
      const token = authService.extractTokenFromHeader(req.headers.authorization);

      if (token) {
        // Add token to blacklist until it expires
        // Default expiry is 15 minutes for access tokens
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await tokenBlacklist.add(token, expiresAt);
      }

      res.json({
        success: true,
        data: {
          message: 'Successfully logged out'
        }
      });

    } catch (error) {
      console.error('[Auth API] Logout error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred during logout'
        }
      });
    }
  });

  // ============================================================================
  // GET /api/auth/me - Get current authenticated user
  // ============================================================================

  router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const userPayload = req.user as TokenPayload;

      // Check if token is blacklisted
      const token = authService.extractTokenFromHeader(req.headers.authorization);
      if (token && await tokenBlacklist.has(token)) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_REVOKED',
            message: 'This token has been revoked'
          }
        });
      }

      // Fetch full user data
      const user = await userStore.findById(userPayload.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      res.json({
        success: true,
        data: {
          user: authService.sanitizeUser(user)
        }
      });

    } catch (error) {
      console.error('[Auth API] Get user error:', error);
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while fetching user data'
        }
      });
    }
  });

  // ============================================================================
  // POST /api/auth/refresh - Refresh access token using refresh token
  // ============================================================================

  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = RefreshTokenSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          }
        });
      }

      const { refreshToken } = validation.data;

      // Verify refresh token
      let payload: TokenPayload;
      try {
        payload = authService.verifyRefreshToken(refreshToken);
      } catch (error) {
        if (error instanceof AuthError) {
          return res.status(error.statusCode).json({
            success: false,
            error: {
              code: error.code,
              message: error.message
            }
          });
        }
        throw error;
      }

      // Find user
      const user = await userStore.findById(payload.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Generate new token pair
      const tokens = authService.generateTokenPair(user);

      res.json({
        success: true,
        data: {
          ...tokens
        }
      });

    } catch (error) {
      console.error('[Auth API] Refresh token error:', error);
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while refreshing token'
        }
      });
    }
  });

  // ============================================================================
  // POST /api/auth/forgot-password - Request password reset email
  // ============================================================================

  router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = ForgotPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          }
        });
      }

      const { email } = validation.data;
      const normalizedEmail = authService.normalizeEmail(email);

      // Find user (don't reveal if user exists for security)
      const user = await userStore.findByEmail(normalizedEmail);

      if (user) {
        // Generate reset token
        const { token, hashedToken, expiresAt } = authService.generatePasswordResetToken();

        // Save hashed token
        await resetTokenStore.save(user.id, hashedToken, expiresAt);

        // Send email with plain token
        await emailService.sendPasswordResetEmail(user.email, token);
      }

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        data: {
          message: 'If an account exists with this email, you will receive password reset instructions.'
        }
      });

    } catch (error) {
      console.error('[Auth API] Forgot password error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while processing your request'
        }
      });
    }
  });

  // ============================================================================
  // POST /api/auth/reset-password - Reset password using token
  // ============================================================================

  router.post('/reset-password', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = ResetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          }
        });
      }

      const { token, newPassword } = validation.data;

      // Validate password strength
      const passwordValidation = authService.validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: passwordValidation.errors[0],
            details: passwordValidation.errors
          }
        });
      }

      // Hash the token to look it up
      const hashedToken = authService.hashResetToken(token);

      // Find reset token
      const resetData = await resetTokenStore.find(hashedToken);
      if (!resetData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RESET_TOKEN',
            message: 'Invalid or expired reset token'
          }
        });
      }

      // Check if token has expired
      if (new Date() > resetData.expiresAt) {
        await resetTokenStore.delete(hashedToken);
        return res.status(400).json({
          success: false,
          error: {
            code: 'RESET_TOKEN_EXPIRED',
            message: 'Reset token has expired. Please request a new password reset.'
          }
        });
      }

      // Find user
      const user = await userStore.findById(resetData.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Hash new password and update
      const passwordHash = await authService.hashPassword(newPassword);
      await userStore.updatePassword(user.id, passwordHash);

      // Delete used reset token
      await resetTokenStore.delete(hashedToken);

      res.json({
        success: true,
        data: {
          message: 'Password has been reset successfully. You can now log in with your new password.'
        }
      });

    } catch (error) {
      console.error('[Auth API] Reset password error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while resetting your password'
        }
      });
    }
  });

  return router;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default createAuthRouter;
