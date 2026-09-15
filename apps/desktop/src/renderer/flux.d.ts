import type { FluxApi } from '../shared/project-api';
declare global {
  interface Window { readonly flux: FluxApi; }
}
export {};
