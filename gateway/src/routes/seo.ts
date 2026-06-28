/**
 * SEO helpers — sitemap.xml and robots.txt
 * Per Phase 5: Minimal SEO foundation for the gateway service.
 *
 * Note: The main sitemap lives in the Next.js frontend (web/).
 * This provides gateway-level robots.txt to prevent indexing API endpoints.
 */
import { Router } from 'express';

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL || 'https://gateway.qrclaw.ai';

export const seoRouter = Router();

/**
 * GET /robots.txt — Disallow all crawlers from gateway API endpoints.
 * The gateway is a WebSocket relay, not a content server.
 */
seoRouter.get('/robots.txt', (_req, res) => {
  const robotsTxt = [
    'User-agent: *',
    'Disallow: /ws',
    'Disallow: /health',
    'Disallow: /api/',
    '',
    `Sitemap: ${GATEWAY_BASE_URL}/sitemap.xml`,
  ].join('\n');

  res.type('text/plain').send(robotsTxt);
});

/**
 * GET /sitemap.xml — Empty sitemap (gateway has no indexable pages).
 */
seoRouter.get('/sitemap.xml', (_req, res) => {
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '</urlset>',
  ].join('\n');

  res.type('application/xml').send(sitemap);
});
