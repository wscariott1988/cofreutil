export const SITE_URL = 'https://www.cofreutil.com.br';
export const SITE_NAME = 'CofreUtil';
export const CONTACT_EMAIL = 'contato@grupows.com';
export const AUTHOR_NAME = 'Willian Scariott';
export const AUTHOR_PAGE = `${SITE_URL}/willian-scariott`;
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const SITE_DESCRIPTION =
  'CofreUtil oferece ferramentas web gratuitas que processam arquivos e dados diretamente no navegador, sem enviar o conteúdo inserido pelo usuário ao backend do CofreUtil. Não é necessário criar conta.';

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const AUTHOR_ID = `${AUTHOR_PAGE}#person`;

interface SoftwareAppOptions {
  type?: 'SoftwareApplication' | 'WebApplication';
  name: string;
  description: string;
  url: string;
  applicationCategory: string;
  featureList?: string[];
  browserRequirements?: string;
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface FaqItem {
  name: string;
  text: string;
}

export function organizationJsonLd() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    email: CONTACT_EMAIL,
    founder: { '@id': AUTHOR_ID },
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE_URL}/#logo`,
      url: OG_IMAGE,
      width: 1200,
      height: 630,
    },
  };
}

export function websiteJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: 'pt-BR',
    publisher: { '@id': ORG_ID },
  };
}

export function personJsonLd() {
  return {
    '@type': 'Person',
    '@id': AUTHOR_ID,
    name: AUTHOR_NAME,
    url: AUTHOR_PAGE,
    email: CONTACT_EMAIL,
    jobTitle: 'Desenvolvedor de Software e Fundador do CofreUtil',
    worksFor: { '@id': ORG_ID },
    knowsAbout: [
      'Arquitetura de aplicações client-side',
      'WebAssembly',
      'Web Crypto API',
      'Processamento local de arquivos no navegador',
      'Privacidade de dados e LGPD',
      'Desenvolvimento web e performance front-end',
    ],
  };
}

export function softwareApplicationJsonLd(options: SoftwareAppOptions) {
  return {
    '@type': options.type ?? 'SoftwareApplication',
    '@id': `${options.url}#softwareapplication`,
    name: options.name,
    description: options.description,
    url: options.url,
    applicationCategory: options.applicationCategory,
    operatingSystem: 'Web Browser',
    ...(options.browserRequirements ? { browserRequirements: options.browserRequirements } : {}),
    inLanguage: 'pt-BR',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      url: options.url,
    },
    author: { '@id': AUTHOR_ID },
    publisher: { '@id': ORG_ID },
    ...(options.featureList && options.featureList.length ? { featureList: options.featureList } : {}),
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqJsonLd(faq: FaqItem[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.name,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.text,
      },
    })),
  };
}

export function toolPageGraph(options: {
  name: string;
  description: string;
  url: string;
  applicationCategory: string;
  type?: 'SoftwareApplication' | 'WebApplication';
  featureList?: string[];
  browserRequirements?: string;
  breadcrumb: BreadcrumbItem[];
  faq?: FaqItem[];
}) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationJsonLd(),
      personJsonLd(),
      softwareApplicationJsonLd({
        type: options.type,
        name: options.name,
        description: options.description,
        url: options.url,
        applicationCategory: options.applicationCategory,
        featureList: options.featureList,
        browserRequirements: options.browserRequirements,
      }),
      breadcrumbJsonLd(options.breadcrumb),
      ...(options.faq && options.faq.length ? [faqJsonLd(options.faq)] : []),
    ],
  };
}

export function homePageGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      websiteJsonLd(),
      organizationJsonLd(),
      personJsonLd(),
      {
        '@type': 'WebPage',
        '@id': SITE_URL,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: 'pt-BR',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORG_ID },
      },
    ],
  };
}

export function techArticleGraph(options: {
  headline: string;
  description: string;
  url: string;
  articleSection?: string;
  datePublished?: string;
  dateModified?: string;
  citation?: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationJsonLd(),
      personJsonLd(),
      {
        '@type': 'TechArticle',
        '@id': `${options.url}#article`,
        headline: options.headline,
        description: options.description,
        url: options.url,
        inLanguage: 'pt-BR',
        mainEntityOfPage: options.url,
        author: { '@id': AUTHOR_ID },
        publisher: { '@id': ORG_ID },
        ...(options.articleSection ? { articleSection: options.articleSection } : {}),
        ...(options.datePublished ? { datePublished: options.datePublished } : {}),
        ...(options.dateModified ? { dateModified: options.dateModified } : {}),
        ...(options.citation && options.citation.length
          ? {
              citation: options.citation.map((c) => ({
                '@type': 'CreativeWork',
                url: c,
              })),
            }
          : {}),
      },
      breadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Segurança e Arquitetura', url: `${SITE_URL}/seguranca-e-arquitetura` },
      ]),
    ],
  };
}

export function personPageGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationJsonLd(),
      personJsonLd(),
      {
        '@type': 'ProfilePage',
        '@id': AUTHOR_PAGE,
        url: AUTHOR_PAGE,
        name: `${AUTHOR_NAME} — Sobre o autor do CofreUtil`,
        inLanguage: 'pt-BR',
        mainEntity: { '@id': AUTHOR_ID },
        about: { '@id': AUTHOR_ID },
      },
      breadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Willian Scariott', url: AUTHOR_PAGE },
      ]),
    ],
  };
}