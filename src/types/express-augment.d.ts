// Global Express type augmentations
declare global {
  namespace Express {
    interface Request {
      user?: import('../models').User;
      sessionId?: string;
      id?: string;
      csrfToken(): string;
    }
  }
}

export {};
