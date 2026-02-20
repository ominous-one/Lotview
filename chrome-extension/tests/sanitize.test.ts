import {
  escapeHtml,
  sanitizeFormData,
  sanitizeNotificationText,
  sanitizeTemplateOutput,
  isValidHttpsUrl,
} from '../src/sanitize';

describe('sanitize', () => {
  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      );
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("it's")).toBe("it&#x27;s");
    });

    it('should return empty string for empty input', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should not modify safe strings', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });
  });

  describe('sanitizeFormData', () => {
    it('should sanitize string values', () => {
      const data = { title: '<script>alert(1)</script>' };
      const result = sanitizeFormData(data);
      expect(result.title).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    });

    it('should preserve numbers and booleans', () => {
      const data = { price: 25000, available: true };
      const result = sanitizeFormData(data);
      expect(result.price).toBe(25000);
      expect(result.available).toBe(true);
    });

    it('should sanitize nested objects', () => {
      const data = { meta: { description: '<b>bold</b>' } };
      const result = sanitizeFormData(data);
      expect((result.meta as { description: string }).description).toBe('&lt;b&gt;bold&lt;&#x2F;b&gt;');
    });

    it('should sanitize arrays of strings', () => {
      const data = { tags: ['<tag1>', '<tag2>'] };
      const result = sanitizeFormData(data);
      expect(result.tags).toEqual(['&lt;tag1&gt;', '&lt;tag2&gt;']);
    });
  });

  describe('sanitizeNotificationText', () => {
    it('should escape HTML and truncate', () => {
      const longText = 'A'.repeat(600);
      const result = sanitizeNotificationText(longText);
      expect(result.length).toBe(500);
    });

    it('should escape HTML in notification', () => {
      expect(sanitizeNotificationText('<b>alert</b>')).toBe('&lt;b&gt;alert&lt;&#x2F;b&gt;');
    });
  });

  describe('sanitizeTemplateOutput', () => {
    it('should remove script tags and content', () => {
      const template = 'Hello <script>evil()</script> World';
      const result = sanitizeTemplateOutput(template);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('evil');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should remove all HTML tags but keep content', () => {
      const template = '<div onclick="alert(1)">Click</div>';
      const result = sanitizeTemplateOutput(template);
      expect(result).not.toContain('<div');
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click');
    });

    it('should strip anchor tags with javascript URLs', () => {
      const template = '<a href="javascript:alert(1)">Link</a>';
      const result = sanitizeTemplateOutput(template);
      expect(result).not.toContain('<a');
      expect(result).not.toContain('javascript');
      expect(result).toContain('Link');
    });

    it('should remove iframe tags completely', () => {
      const template = 'Before <iframe src="evil.com"></iframe> After';
      const result = sanitizeTemplateOutput(template);
      expect(result).not.toContain('<iframe');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('should remove style tags and content', () => {
      const template = 'Text <style>body { display: none }</style> More';
      const result = sanitizeTemplateOutput(template);
      expect(result).not.toContain('<style');
      expect(result).not.toContain('display');
      expect(result).toContain('Text');
      expect(result).toContain('More');
    });

    it('should handle SVG-based XSS', () => {
      const template = '<svg onload="alert(1)"><circle/></svg>';
      const result = sanitizeTemplateOutput(template);
      expect(result).not.toContain('<svg');
      expect(result).not.toContain('onload');
    });

    it('should handle mutation XSS patterns', () => {
      const template = '<noscript><p title="</noscript><img src=x onerror=alert(1)>">';
      const result = sanitizeTemplateOutput(template);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('<img');
    });

    it('should preserve normal content', () => {
      const template = '2024 Toyota Camry - $25,000';
      expect(sanitizeTemplateOutput(template)).toBe('2024 Toyota Camry - $25,000');
    });

    it('should handle special characters in normal content', () => {
      const template = 'Price: $25,000 & includes warranty';
      expect(sanitizeTemplateOutput(template)).toBe('Price: $25,000 & includes warranty');
    });
  });

  describe('isValidHttpsUrl', () => {
    it('should return true for valid HTTPS URLs', () => {
      expect(isValidHttpsUrl('https://example.com')).toBe(true);
      expect(isValidHttpsUrl('https://lotview.ai/api/test')).toBe(true);
    });

    it('should return false for HTTP URLs', () => {
      expect(isValidHttpsUrl('http://example.com')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidHttpsUrl('not-a-url')).toBe(false);
      expect(isValidHttpsUrl('')).toBe(false);
    });
  });
});
