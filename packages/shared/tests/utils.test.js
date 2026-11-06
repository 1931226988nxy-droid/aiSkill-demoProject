import { describe, it, expect, vi } from 'vitest';
import {
  downloadBlob,
  filterTree,
  formatBytes,
  formatDate,
  getDownloadName,
  listToTree,
  normalizeTree,
  safeFileName,
  validateFile,
} from '@jcc/shared/utils';
import { createHttpClient } from '@jcc/shared/api';
describe('树和文件公共方法', () => {
  it('保留主键 0，构树不修改输入，孤儿作为根', () => {
    const input = [
      { id: 0, parentId: null },
      { id: 1, parentId: 0 },
      { id: 2, parentId: 99 },
    ];
    const tree = listToTree(input);
    expect(tree.map((n) => n.id)).toEqual([0, 2]);
    expect(tree[0].children[0].id).toBe(1);
    expect(input[0]).not.toHaveProperty('children');
  });
  it('拒绝重复主键和循环，避免无限递归', () => {
    expect(() => listToTree([{ id: 1 }, { id: 1 }])).toThrow('重复');
    expect(() =>
      listToTree([
        { id: 1, parentId: 2 },
        { id: 2, parentId: 1 },
      ]),
    ).toThrow('循环');
  });
  it('字段映射及搜索保留祖先', () => {
    const tree = normalizeTree(
      [
        {
          id: 0,
          label: '总公司',
          nodes: [
            { id: 1, label: '财务部' },
            { id: 2, label: '工程部' },
          ],
        },
      ],
      { value: 'id', label: 'label', children: 'nodes' },
    );
    const result = filterTree(tree, '财务');
    expect(result[0].key).toBe(0);
    expect(result[0].children.map((n) => n.key)).toEqual([1]);
    expect(tree[0].children).toHaveLength(2);
  });
  it('校验后缀、MIME 通配、大小边界和空 accept', () => {
    expect(
      validateFile({ name: 'A.PDF', type: '', size: 1024 * 1024 }, { accept: '.pdf', maxSizeMB: 1 })
        .valid,
    ).toBe(true);
    expect(
      validateFile({ name: 'a.png', type: 'image/png', size: 3 }, { accept: 'image/*' }).valid,
    ).toBe(true);
    expect(validateFile({ name: 'a.exe', type: '', size: 3 }, { accept: '.pdf' }).valid).toBe(
      false,
    );
    expect(validateFile({ name: 'a', size: 1024 * 1024 + 1 }, { maxSizeMB: 1 }).valid).toBe(false);
    expect(validateFile({ name: 'a', size: 0 }, { maxSizeMB: 0 }).valid).toBe(true);
  });
  it('解析中文下载名并清除目录和非法字符', () => {
    expect(getDownloadName("attachment; filename*=UTF-8''%E6%96%87%E4%BB%B6.pdf")).toBe('文件.pdf');
    expect(getDownloadName('attachment; filename="../report.csv"')).toBe('report.csv');
    expect(safeFileName('x\\a?.txt')).toBe('a_.txt');
  });
  it('格式化不混淆零和缺失', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(-1)).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('bad')).toBe('—');
    expect(formatDate(0)).not.toBe('—');
  });
  it('下载链接移除后延迟释放对象 URL', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.revokeObjectURL.mockClear();
    downloadBlob(new Blob(['a']), 'a.txt');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBe(null);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:jcc-test');
    vi.useRealTimers();
  });
});
describe('可注入请求客户端', () => {
  it('保留 0/false，数组序列化，合并请求头并传递 signal', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    const client = createHttpClient({
      baseURL: '/api',
      fetch,
      getHeaders: () => ({ Authorization: 'demo-token' }),
    });
    const signal = new AbortController().signal;
    await expect(
      client('/plans', {
        query: { page: 0, active: false, tags: ['a', 'b'], empty: null },
        headers: { 'X-Project': 'a' },
        signal,
      }),
    ).resolves.toEqual({ ok: true });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/plans?page=0&active=false&tags=a&tags=b');
    expect(options.headers.get('Authorization')).toBe('demo-token');
    expect(options.signal).toBe(signal);
  });
  it('FormData 不强制设置 JSON Content-Type', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const form = new FormData();
    form.append('name', 'demo');
    await createHttpClient({ fetch })('/file', {
      method: 'POST',
      body: form,
      responseType: 'text',
    });
    expect(fetch.mock.calls[0][1].body).toBe(form);
    expect(fetch.mock.calls[0][1].headers.has('Content-Type')).toBe(false);
  });
  it('结构化错误和 401 回调保留，204 返回 null', async () => {
    const onUnauthorized = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"message":"登录已失效"}', { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createHttpClient({ fetch, onUnauthorized });
    await expect(client('/plans')).rejects.toMatchObject({
      name: 'HttpError',
      status: 401,
      message: '登录已失效',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(client('/plans')).resolves.toBe(null);
  });
  it('JSON body 只在普通对象时序列化', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    await createHttpClient({ fetch })('/plans', { method: 'POST', body: { count: 0 } });
    expect(fetch.mock.calls[0][1].body).toBe('{"count":0}');
    expect(fetch.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json');
  });
});
