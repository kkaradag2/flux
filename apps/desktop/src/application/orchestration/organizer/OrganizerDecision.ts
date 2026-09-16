export type OrganizerPlanTask = Readonly<{
  key: string;
  title: string;
  description: string;
  ownerAgentId: string;
  dependsOn: readonly string[];
  acceptanceCriteria: readonly string[];
}>;

export type OrganizerDecision =
  | Readonly<{ type: 'respond'; message: string }>
  | Readonly<{ type: 'ask_user'; message: string; questions: readonly string[] }>
  | Readonly<{ type: 'create_plan'; message: string; planSummary: string; tasks: readonly OrganizerPlanTask[] }>;
