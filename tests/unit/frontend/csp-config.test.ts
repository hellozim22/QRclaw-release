import { describe, it, expect } from 'vitest';
import { buildCspDirectives, buildPermissionsPolicy } from '../../../web/src/lib/csp';

describe('CSP Configuration', () => {
  describe('buildCspDirectives', () => {
    it('should not contain bare "ws://" when gateway URL is empty', () => {
      const csp = buildCspDirectives({ gatewayUrl: '', supabaseUrl: '' });
      // Should not have "ws://" followed by space or end-of-string (bare protocol)
      expect(csp).not.toMatch(/ws:\/\/\s/);
      expect(csp).not.toMatch(/ws:\/\/$/);
      expect(csp).not.toMatch(/ws:\/\/'/);
      // Should not have double spaces from empty interpolation
      expect(csp).not.toMatch(/  /);
    });

    it('should not contain bare "ws://" when gateway URL is undefined', () => {
      const csp = buildCspDirectives({ gatewayUrl: undefined, supabaseUrl: undefined });
      expect(csp).not.toMatch(/ws:\/\/\s/);
      expect(csp).not.toMatch(/ws:\/\/$/);
    });

    it('should include gateway URLs in connect-src when provided', () => {
      const csp = buildCspDirectives({
        gatewayUrl: 'https://gateway-test.qrclaw.ai',
        supabaseUrl: 'https://abc.supabase.co',
      });
      expect(csp).toContain('https://gateway-test.qrclaw.ai');
      expect(csp).toContain('ws://gateway-test.qrclaw.ai');
    });

    it('should include upgrade-insecure-requests directive', () => {
      const csp = buildCspDirectives({
        gatewayUrl: 'https://gateway-test.qrclaw.ai',
        supabaseUrl: 'https://abc.supabase.co',
      });
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('should include upgrade-insecure-requests even when env vars are empty', () => {
      const csp = buildCspDirectives({ gatewayUrl: '', supabaseUrl: '' });
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('should include wss://*.qrclaw.ai for wildcard WSS coverage', () => {
      const csp = buildCspDirectives({
        gatewayUrl: 'https://gateway-test.qrclaw.ai',
        supabaseUrl: '',
      });
      expect(csp).toContain('wss://*.qrclaw.ai');
    });

    it('should include supabase URL in connect-src and img-src when provided', () => {
      const csp = buildCspDirectives({
        gatewayUrl: '',
        supabaseUrl: 'https://abc.supabase.co',
      });
      expect(csp).toContain('https://abc.supabase.co');
    });

    it('should not have trailing or leading spaces in directives', () => {
      const csp = buildCspDirectives({ gatewayUrl: '', supabaseUrl: '' });
      const directives = csp.split('; ');
      for (const directive of directives) {
        expect(directive).toBe(directive.trim());
      }
    });

    it('should NOT include unsafe-eval in production (CRITICAL-2)', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const csp = buildCspDirectives({ gatewayUrl: '', supabaseUrl: '' });
        expect(csp).not.toContain('unsafe-eval');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('may include unsafe-eval in development only', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        const csp = buildCspDirectives({ gatewayUrl: '', supabaseUrl: '' });
        // In development, unsafe-eval is acceptable for dev tools / HMR
        expect(csp).toContain('unsafe-eval');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('buildPermissionsPolicy', () => {
    it('should allow camera on self origin', () => {
      const policy = buildPermissionsPolicy();
      expect(policy).toContain('camera=(self)');
    });

    it('should block microphone', () => {
      const policy = buildPermissionsPolicy();
      expect(policy).toContain('microphone=()');
    });

    it('should block geolocation', () => {
      const policy = buildPermissionsPolicy();
      expect(policy).toContain('geolocation=()');
    });
  });
});
