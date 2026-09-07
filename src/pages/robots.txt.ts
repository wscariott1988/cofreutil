import type { APIRoute } from 'astro';

export const prerender = true;

const blockedPaths = [
  '/admin',
  '/testes',
  '/homologacao',
  '/privado',
  '/obrigado',
];

function getRobotsTxt(siteUrl: string): string {
  const disallow = blockedPaths.map((path) => `Disallow: ${path}`).join('\n');

  return `User-agent: *
Allow: /
${disallow}

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /

Sitemap: ${new URL('sitemap-index.xml', siteUrl).toString()}
`;
}

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site ? site.toString() : 'https://www.cofreutil.com.br';
  const body = getRobotsTxt(siteUrl);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
