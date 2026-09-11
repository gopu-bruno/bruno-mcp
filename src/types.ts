export interface DiscoveredCollection {
  path: string;
  workspacePath: string | null;
  workspaceName: string | null;
  nameInWorkspace: string | null;
}

export interface RegisteredCollection {
  path: string;
  name: string;
  workspacePath: string | null;
  workspaceName: string | null;
}

export interface CollectionListItem extends RegisteredCollection {
  environments: string[];
}

export interface RequestInfo {
  name: string;
  pathname: string;
  relativePath: string;
  /** `http-request`, `graphql-request`, `grpc-request`, `ws-request`. */
  type: string | null;
  method: string | null;
  url: string | null;
}

export type VariableOverrides = Record<string, string | number | boolean>;

export interface RunOptions {
  environment?: string;
  variables?: VariableOverrides;
}

export interface DiscoveryConfig {
  explicitCollections: string[];
  explicitWorkspaces: string[];
  cwdDiscovery: boolean;
  autoDiscovery: boolean;
}
