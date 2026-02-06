import * as fs from 'fs/promises';
import * as path from 'path';

export interface ContentStore {
  write(key: string, content: Buffer | string): Promise<string>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  deleteTree(prefix: string): Promise<void>;
}

export class LocalContentStore implements ContentStore {
  constructor(private basePath: string) {}

  private resolve(key: string): string {
    const base = path.resolve(this.basePath);
    const resolved = path.resolve(base, key);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
      throw new Error('Content key escapes storage root');
    }
    return resolved;
  }

  async write(key: string, content: Buffer | string): Promise<string> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    if (typeof content === 'string') {
      await fs.writeFile(filePath, content, { encoding: 'utf-8', mode: 0o600 });
    } else {
      await fs.writeFile(filePath, content, { mode: 0o600 });
    }
    return filePath;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // ignore if already deleted
    }
  }

  async deleteTree(prefix: string): Promise<void> {
    const dir = this.resolve(prefix);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore if already deleted
    }
  }
}
