export interface AthanorConfig {
  database: {
    driver: 'sqlite' | 'postgres';
    sqlite: {
      path: string;
    };
    postgres?: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    };
  };
  storage: {
    backend: 'local' | 's3';
    local: {
      path: string;
    };
    s3?: {
      bucket: string;
      region: string;
      prefix: string;
    };
  };
  claude: {
    path: string;
    default_model: string;
    default_permission_mode: string;
  };
  preferences: {
    theme: 'light' | 'dark' | 'system';
    message_preview_length: number;
  };
}
