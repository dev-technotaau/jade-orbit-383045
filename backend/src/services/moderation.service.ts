import * as fs from 'fs';
import * as path from 'path';

interface ModerationResult {
  isClean: boolean;
  flaggedTerms: string[];
  severity: 'none' | 'low' | 'medium' | 'high';
}

class ModerationService {
  private blockedKeywords: string[] = [];
  private keywordsFilePath: string;

  constructor() {
    this.keywordsFilePath = path.join(__dirname, '../data/blocked-keywords.json');
    this.loadKeywords();
  }

  private loadKeywords(): void {
    try {
      if (fs.existsSync(this.keywordsFilePath)) {
        const raw = fs.readFileSync(this.keywordsFilePath, 'utf-8');
        this.blockedKeywords = JSON.parse(raw);
      }
    } catch {
      this.blockedKeywords = [];
    }
  }

  private saveKeywords(): void {
    const dir = path.dirname(this.keywordsFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.keywordsFilePath, JSON.stringify(this.blockedKeywords, null, 2));
  }

  screenContent(content: string): ModerationResult {
    if (!content) return { isClean: true, flaggedTerms: [], severity: 'none' };
    const normalized = content.toLowerCase();
    const flaggedTerms: string[] = [];

    for (const keyword of this.blockedKeywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(normalized)) {
        flaggedTerms.push(keyword);
      }
    }

    const severity =
      flaggedTerms.length === 0
        ? 'none'
        : flaggedTerms.length <= 1
          ? 'low'
          : flaggedTerms.length <= 3
            ? 'medium'
            : 'high';

    return { isClean: flaggedTerms.length === 0, flaggedTerms, severity };
  }

  getBlockedKeywords(): string[] {
    return [...this.blockedKeywords];
  }

  addKeyword(keyword: string): void {
    const lower = keyword.toLowerCase().trim();
    if (lower && !this.blockedKeywords.includes(lower)) {
      this.blockedKeywords.push(lower);
      this.saveKeywords();
    }
  }

  removeKeyword(keyword: string): void {
    const lower = keyword.toLowerCase().trim();
    this.blockedKeywords = this.blockedKeywords.filter((k) => k !== lower);
    this.saveKeywords();
  }
}

export const moderationService = new ModerationService();
