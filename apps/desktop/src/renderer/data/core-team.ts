export type TeamMember = {
  readonly id: string;
  readonly name: string;
  readonly runtime: 'Codex';
  readonly status: 'idle' | 'working';
};

export const coreTeamMembers: readonly TeamMember[] = [
  { id: 'lead', name: 'Lead', runtime: 'Codex', status: 'idle' },
  { id: 'developer', name: 'Developer', runtime: 'Codex', status: 'idle' },
  { id: 'reviewer', name: 'Reviewer', runtime: 'Codex', status: 'idle' },
  { id: 'tester', name: 'Tester', runtime: 'Codex', status: 'idle' },
];
