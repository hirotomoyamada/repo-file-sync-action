import type { InputValue } from "action-input-parser/lib/types";
export declare const forEach: (array: any[], callback: (item: any, index: number, array: any[]) => Promise<void>) => Promise<void>;
export declare const dedent: (templateStrings: TemplateStringsArray | string, ...values: any[]) => string;
export declare const execCmd: (command: string, workingDir?: string) => Promise<string>;
export declare const addTrailingSlash: (str: string) => string;
export declare const pathIsDirectory: (path: string) => Promise<boolean>;
export declare const copy: (src: string, dest: string, isDirectory: boolean, exclude?: string[]) => Promise<void>;
export declare const remove: (path: InputValue) => Promise<void>;
