import { Request, Response, NextFunction } from 'express';
import { trimFormStrings } from '../utils/trimFormStrings';

export function trimBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = trimFormStrings(req.body);
  }
  next();
}
