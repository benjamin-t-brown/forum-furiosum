import { Request, Response } from 'express';

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data });
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({ ok: false, error: { code, message, details } });
}

export function parsePagination(req: Request): { page: number; limit: number } {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '20', 10) || 20));
  return { page, limit };
}
