import type { TeamDefinition } from '../../shared/management-api';
export interface TeamRepository { list(): Promise<TeamDefinition[]>; save(team: TeamDefinition, create: boolean): Promise<TeamDefinition>; }
