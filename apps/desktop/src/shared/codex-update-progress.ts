export type CodexUpdateStage = 'PREPARING' | 'INSTALLING' | 'CHECKING_VERSION' | 'VERIFYING_CONNECTION' | 'COMPLETED';
export type CodexUpdateProgress = { stage: CodexUpdateStage; startedAt: string };
