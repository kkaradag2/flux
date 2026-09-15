export interface ProjectPreview {
  readonly id: string;
  readonly name: string;
}
export interface RequestPreview {
  readonly id: string;
  readonly title: string;
  readonly updatedLabel: string;
}
// Static presentation data, independent of domain models and integrations.
export const previewProjects: readonly ProjectPreview[] = [{ id: 'flux', name: 'Flux' }];
export const previewRequests: readonly RequestPreview[] = [
  { id: 'workspace', title: 'Design the main workspace', updatedLabel: '2h' },
  { id: 'desktop', title: 'Set up the desktop app', updatedLabel: '1d' },
  { id: 'architecture', title: 'Plan the project structure', updatedLabel: '2d' },
];
