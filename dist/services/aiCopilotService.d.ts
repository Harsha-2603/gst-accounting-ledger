export interface CopilotResponse {
    answer: string;
    sources: string[];
    aiEnabled: boolean;
}
export declare function isMutationIntent(message: string): boolean;
export declare function askCopilot(message: string): Promise<CopilotResponse>;
