import type { ReactNode } from 'react';

const paths = {
 code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>,
 search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
 shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" /><path d="m8 12 3 3 5-6" /></>,
 testTube: <><path d="m14 3 7 7m-5-5L3 18a3 3 0 0 0 4 4L20 9M8 13h8" /></>,
 database: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  newTask: <><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7" /><path d="m16 3 5 5-10 10-5 1 1-5Z" /><path d="m14 5 5 5" /></>,
  agents: <><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 3v4M2 12v4m20-4v4M9 16h6M8 11h.01M16 11h.01" /></>,
  folder: <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  settings: <><path d="m9.5 3-.6 2.1-1.8 1-2.1-.4-2.5 4.3L4 11.5v2L2.5 15 5 19.3l2.1-.4 1.8 1 .6 2.1h5l.6-2.1 1.8-1 2.1.4 2.5-4.3-1.5-1.5v-2l1.5-1.5L19 5.7l-2.1.4-1.8-1-.6-2.1Z" /><circle cx="12" cy="12.5" r="3" /></>,
  attachment: <path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L12 3a2 2 0 0 1 3 3L5 16" />,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M6 7v10m12-10a8 8 0 0 1-8 8H6" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 0h4" /></>,
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
