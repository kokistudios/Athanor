import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse, stringify } from 'yaml';
import type { AthanorConfig } from '../../shared/types/config';
import { defaultConfig } from './defaults';

const ATHANOR_HOME = path.join(os.homedir(), '.athanor');
const CONFIG_PATH = path.join(ATHANOR_HOME, 'config.yaml');

function expandTilde(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function resolveConfigPaths(config: AthanorConfig): AthanorConfig {
  return {
    ...config,
    database: {
      ...config.database,
      sqlite: {
        path: expandTilde(config.database.sqlite.path),
      },
    },
    storage: {
      ...config.storage,
      local: {
        path: expandTilde(config.storage.local.path),
      },
    },
  };
}

export function loadConfig(): AthanorConfig {
  // Ensure ~/.athanor/ exists
  if (!fs.existsSync(ATHANOR_HOME)) {
    fs.mkdirSync(ATHANOR_HOME, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(ATHANOR_HOME, 0o700);
  } catch {
    // Best-effort hardening.
  }

  // Create default config if missing
  if (!fs.existsSync(CONFIG_PATH)) {
    const yamlContent = stringify(defaultConfig);
    fs.writeFileSync(CONFIG_PATH, yamlContent, { encoding: 'utf-8', mode: 0o600 });
    console.log(`Created default config at ${CONFIG_PATH}`);
    return resolveConfigPaths(defaultConfig);
  }
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // Best-effort hardening.
  }

  // Read and parse existing config
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = parse(raw) as Partial<AthanorConfig>;

  // Merge with defaults
  const config: AthanorConfig = {
    database: { ...defaultConfig.database, ...parsed.database },
    storage: { ...defaultConfig.storage, ...parsed.storage },
    claude: { ...defaultConfig.claude, ...parsed.claude },
    preferences: { ...defaultConfig.preferences, ...parsed.preferences },
  };

  return resolveConfigPaths(config);
}

export function getAthanorHome(): string {
  return ATHANOR_HOME;
}
