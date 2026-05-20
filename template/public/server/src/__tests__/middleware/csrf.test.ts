import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { csrf } from '../../middleware/csrf';
import { COOKIE_NAMES } from '../../utils/cookie-config';

describe('csrf middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      method: 'POST',
      headers: {},
      cookies: {},
    };
    res = {};
    next = vi.fn();
  });

  it('should skip validation for GET requests', () => {
    req.method = 'GET';
    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should skip validation for HEAD requests', () => {
    req.method = 'HEAD';
    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should skip validation for OPTIONS requests', () => {
    req.method = 'OPTIONS';
    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should return 403 when CSRF header is missing', () => {
    req.method = 'POST';
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'valid-token' };
    req.headers = {}; // no x-csrf-token header

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISSING',
      })
    );
  });

  it('should return 403 when CSRF cookie is missing', () => {
    req.method = 'POST';
    req.headers = { 'x-csrf-token': 'some-token' };
    req.cookies = {}; // no csrf cookie

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISSING',
      })
    );
  });

  it('should return 403 when tokens do not match', () => {
    req.method = 'POST';
    req.headers = { 'x-csrf-token': 'header-token' };
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'different-cookie-token' };

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISMATCH',
      })
    );
  });

  it('should pass when header and cookie tokens match', () => {
    const token = 'matching-csrf-token';
    req.method = 'POST';
    req.headers = { 'x-csrf-token': token };
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: token };

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should validate CSRF on DELETE requests', () => {
    const token = 'valid-token';
    req.method = 'DELETE';
    req.headers = { 'x-csrf-token': token };
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: token };

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should validate CSRF on PUT requests', () => {
    req.method = 'PUT';
    req.headers = {};
    req.cookies = {};

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISSING',
      })
    );
  });
});
