import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly secret = 'supersecret'; // Replace with a real secret from config

  use(req: Request, res: Response, next: NextFunction) {
    // Generate and set CSRF token for GET requests
    if (req.method === 'GET') {
      const token = this.createCsrfToken();
      res.cookie('csrf-token', token, { httpOnly: false, sameSite: 'strict' });
    }
    next();
  }

  private createCsrfToken(): string {
    return createHmac('sha256', this.secret)
      .update(new Date().toISOString())
      .digest('hex');
  }
}

@Injectable()
export class CsrfValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfTokenFromCookie = req.cookies['csrf-token'];
      const csrfTokenFromHeader = req.headers['x-csrf-token'];

      if (
        !csrfTokenFromCookie ||
        !csrfTokenFromHeader ||
        csrfTokenFromCookie !== csrfTokenFromHeader
      ) {
        return res.status(403).json({ message: 'Invalid CSRF token' });
      }
    }
    next();
  }
}
