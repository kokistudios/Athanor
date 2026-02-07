import * as path from 'path';
import * as os from 'os';
import type { AthanorConfig } from '../../shared/types/config';

const athanorHome = path.join(os.homedir(), '.athanor');

export const defaultConfig: AthanorConfig = {
  database: {
    driver: 'sqlite',
    sqlite: {
      path: path.join(athanorHome, 'athanor.db'),
    },
  },
  storage: {
    backend: 'local',
    local: {
      path: path.join(athanorHome, 'data'),
    },
  },
  claude: {
    path: 'claude',
    default_model: 'sonnet',
    default_permission_mode: 'default',
  },
  codex: {
    path: 'codex',
    default_model: 'gpt-5-codex',
  },
  preferences: {
    theme: 'dark',
    message_preview_length: 500,
  },
};
