// Minimal type declaration for csurf (package is deprecated but functional)
declare module 'csurf' {
  import { RequestHandler } from 'express';
  interface CsurfOptions {
    cookie?: boolean | Record<string, unknown>;
    ignoreMethods?: string[];
    sessionKey?: string;
    value?: (req: import('express').Request) => string;
  }
  function csurf(options?: CsurfOptions): RequestHandler;
  export = csurf;
}
