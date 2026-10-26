export const PORTALS = [
  {
    id: 'portal',
    title: 'هنذاكروا Portal',
    description: 'بوابة المذاكرة الرئيسية',
    marker: 'P',
    url: 'https://haneenstudy-tu9hntzp.manus.space/baccalaureate',
  },
  {
    id: 'v1',
    title: 'هنذاكروا V1',
    description: 'الإصدار الأول من المنصة',
    marker: 'V1',
    url: 'https://hanzakro-2026-10-26-v1.vercel.app/',
  },
] as const;

export type Portal = (typeof PORTALS)[number];
