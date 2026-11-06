import { describe, expect, it } from 'vitest';
import { JccTable } from '@jcc/shared/components';
import { createHttpClient } from '@jcc/shared/api';
import { formatBytes } from '@jcc/shared/utils';
import { documentImageUrl } from '@jcc/shared/assets';
import { isEmail, isMobileCN, isPositiveInteger } from '@jcc/shared/validators';

describe('独立公共库入口', () => {
  it('分类入口可以从同一个包导入', () => {
    expect(JccTable).toBeTruthy();
    expect(typeof createHttpClient).toBe('function');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(documentImageUrl).toMatch(/^data:image\/svg\+xml,/);
  });

  it('验证规则处理空值、边界和非法格式', () => {
    expect(isEmail(' user@example.com ')).toBe(true);
    expect(isEmail('user@@example.com')).toBe(false);
    expect(isMobileCN('13800138000')).toBe(true);
    expect(isMobileCN('12800138000')).toBe(false);
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
  });
});
