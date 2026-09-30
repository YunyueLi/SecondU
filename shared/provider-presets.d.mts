export interface CompatibleProviderPreset {id:'gemini'|'qwen'|'glm'|'doubao'|'minimax';name:string;baseUrl:string;api:'chat_completions';docsUrl:string;descriptionZh:string;descriptionEn:string;hintZh:string;hintEn:string}
export const compatibleProviderPresets: CompatibleProviderPreset[];
export const providerIds: string[];
export function usesDefaultReasoning(provider:string):boolean;
