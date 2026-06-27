import { Request, Response, NextFunction } from 'express';

export function embedFramePolicy(_req: Request, res: Response, next: NextFunction): void {
  const ancestors = process.env.EMBED_FRAME_ANCESTORS ?? '*';
  res.setHeader('Content-Security-Policy', `frame-ancestors ${ancestors}`);
  next();
}
