import type { InputValue } from "action-input-parser/lib/types";
declare let context: Record<string, InputValue>;
export { context };
export declare const parseConfig: () => Promise<any[]>;
