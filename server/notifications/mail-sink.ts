import fs from 'fs';
import path from 'path';

export interface MailSinkMessage {
  id: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  meta?: Record<string, any>;
  createdAt: string;
}

export function getMailSinkDir(): string {
  // Stored in repo artifacts/ for easy inspection in dev/test.
  return path.resolve(process.cwd(), 'artifacts', 'mail-sink');
}

export function writeMailSinkMessage(message: MailSinkMessage): void {
  const dir = getMailSinkDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${message.createdAt.replace(/[:.]/g, '-')}_${message.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(message, null, 2), 'utf8');
}
