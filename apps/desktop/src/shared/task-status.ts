/** One canonical task lifecycle shared by domain and presentation contracts. */
export const taskStatuses = ['planned', 'ready', 'working', 'completed', 'needs_attention', 'blocked', 'failed', 'cancelled'] as const;
export type TaskStatus = typeof taskStatuses[number];
