export default class Git {
    github: any;
    existingPr: any;
    prBranch: string | undefined;
    baseBranch: string | undefined;
    repo: any;
    workingDir: string | undefined;
    gitUrl: string | undefined;
    constructor();
    initRepo(repo: any): Promise<void>;
    clone(): Promise<string>;
    setIdentity(): Promise<string>;
    getBaseBranch(): Promise<void>;
    createPrBranch(): Promise<void>;
    add(file: string): Promise<string>;
    hasChanges(): Promise<boolean>;
    commit(message?: string): Promise<string>;
    status(): Promise<string>;
    push(): Promise<string>;
    getLastCommitMsg(filePath: string): Promise<string>;
    findExistingPr(): Promise<any>;
    setPrWarning(): Promise<void>;
    removePrWarning(): Promise<void>;
    createOrUpdatePr(changedFiles: string[]): Promise<any>;
    addPrLabels(labels: (string | number | boolean)[]): Promise<void>;
    addPrAssignees(assignees: (string | number | boolean)[]): Promise<void>;
}
