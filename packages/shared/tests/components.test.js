import { afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { Form, Input, Pagination, Table, Tree, TreeSelect, Upload } from 'ant-design-vue';
import {
  JccAppShell,
  JccDownload,
  JccFormModal,
  JccPagination,
  JccTable,
  JccTree,
  JccTreeTableLayout,
  JccTreeSelect,
  JccUpload,
} from '@jcc/shared/components';
const wrappers = [];
function render(component, options = {}) {
  const wrapper = mount(component, { attachTo: document.body, ...options });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
});
describe('应用外壳用户入口', () => {
  it('可替换默认用户入口，并将用户信息传给插槽', () => {
    const wrapper = render(JccAppShell, {
      props: { activeKey: '', userName: '馆员甲', department: '馆员' },
      slots: {
        user: ({ userName, department }) =>
          h('button', { class: 'custom-user' }, `${userName} · ${department}`),
      },
    });
    expect(wrapper.find('.custom-user').text()).toBe('馆员甲 · 馆员');
    expect(wrapper.find('.fs-user').exists()).toBe(false);
  });
});
describe('分页和表格组合', () => {
  it('切换页容量只触发一次 change，并回到第一页', async () => {
    const wrapper = render(JccPagination, { props: { page: 3, pageSize: 20, total: 300 } });
    wrapper.findComponent(Pagination).vm.$emit('change', 3, 50);
    await nextTick();
    expect(wrapper.emitted('change')).toEqual([[{ page: 1, pageSize: 50 }]]);
    expect(wrapper.emitted('update:page')).toEqual([[1]]);
  });
  it('服务端模式不对已分页数据再次切片，支持 Ant 插槽和属性', () => {
    const wrapper = render(JccTable, {
      props: {
        dataSource: [{ id: 21, name: '第21条' }],
        columns: [{ dataIndex: 'name', key: 'name', title: '名称' }],
        page: 2,
        pageSize: 20,
        total: 41,
      },
      attrs: { scroll: { x: 800 } },
      slots: { bodyCell: ({ record }) => h('button', { class: 'custom-cell' }, record.name) },
    });
    expect(wrapper.findComponent(Table).props('dataSource')).toHaveLength(1);
    expect(wrapper.findComponent(Table).props('scroll')).toEqual({ x: 800 });
    expect(wrapper.find('.custom-cell').text()).toBe('第21条');
  });
  it('前端模式分页；分页关闭时显示全部数据', async () => {
    const data = Array.from({ length: 25 }, (_, id) => ({ id }));
    const wrapper = render(JccTable, {
      props: { dataSource: data, mode: 'client', page: 2, pageSize: 20 },
    });
    expect(
      wrapper
        .findComponent(Table)
        .props('dataSource')
        .map((row) => row.id),
    ).toEqual([20, 21, 22, 23, 24]);
    expect(wrapper.findComponent(JccPagination).props('total')).toBe(25);
    await wrapper.setProps({ pagination: false });
    expect(wrapper.findComponent(Table).props('dataSource')).toHaveLength(25);
  });
});
describe('树组件统一字段与受控值', () => {
  const data = [
      {
        id: 0,
        label: '总部',
        nodes: [
          { id: 1, label: '财务部' },
          { id: 2, label: '工程部' },
        ],
      },
    ],
    fields = { label: 'label', value: 'id', children: 'nodes' };
  it('Tree 搜索保留祖先，选择主键 0 正常回传', async () => {
    const wrapper = render(JccTree, {
      props: { treeData: data, fieldNames: fields, selectedKeys: [0] },
    });
    await wrapper.find('input').setValue('财务');
    const tree = wrapper.findComponent(Tree);
    expect(tree.props('treeData')[0].children).toHaveLength(1);
    expect(tree.props('expandedKeys')).toEqual([0, 1]);
    tree.vm.$emit('select', [0], {});
    expect(wrapper.emitted('update:selectedKeys')[0]).toEqual([[0]]);
  });
  it('TreeSelect 支持单选 0 和多选数组原样回传', () => {
    const wrapper = render(JccTreeSelect, {
      props: { treeData: data, fieldNames: fields, value: 0 },
    });
    const tree = wrapper.findComponent(TreeSelect);
    expect(tree.props('treeData')[0].value).toBe(0);
    tree.vm.$emit('change', [0, 1], ['总部', '财务部'], {});
    expect(wrapper.emitted('update:value')[0]).toEqual([[0, 1]]);
  });
});
describe('树表分栏', () => {
  it('组合插槽并允许键盘调整宽度，遵守最大宽度', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    try {
      const wrapper = render(JccTreeTableLayout, {
        props: { maxTreeWidth: 340, treeLabel: '分类树', mobileOpen: true },
        slots: {
          'tree-header': '<h1>目录</h1>',
          tree: '<div class="custom-tree">分类</div>',
          'content-header': '<h2>列表</h2>',
          toolbar: '<button>添加</button>',
          default: '<table><tbody><tr><td>图书</td></tr></tbody></table>',
        },
      });
      await nextTick();
      expect(wrapper.find('.jcc-tree-table__tree').attributes('aria-label')).toBe('分类树');
      expect(wrapper.find('.custom-tree').text()).toBe('分类');
      expect(wrapper.find('h2').text()).toBe('列表');
      expect(wrapper.classes()).toContain('is-mobile-open');
      const separator = wrapper.find('[role="separator"]');
      expect(separator.attributes('aria-valuenow')).toBe('240');
      for (let index = 0; index < 4; index += 1) {
        await separator.trigger('keydown', { key: 'ArrowLeft' });
      }
      expect(separator.attributes('aria-valuenow')).toBe('180');
      for (let index = 0; index < 10; index += 1) {
        await separator.trigger('keydown', { key: 'ArrowRight' });
      }
      expect(separator.attributes('aria-valuenow')).toBe('340');
      expect(wrapper.emitted('resize').at(-1)).toEqual([340]);
    } finally {
      width.mockRestore();
    }
  });
  it('拖动分隔线更新宽度，并在松开后停止调整', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    try {
      const wrapper = render(JccTreeTableLayout, {
        slots: { tree: '<div>树</div>', default: '<div>表格</div>' },
      });
      await nextTick();
      const separator = wrapper.find('[role="separator"]');
      separator.element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300 }),
      );
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 370 }));
      await nextTick();
      expect(separator.attributes('aria-valuenow')).toBe('310');
      window.dispatchEvent(new MouseEvent('pointerup'));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 450 }));
      await nextTick();
      expect(separator.attributes('aria-valuenow')).toBe('310');
    } finally {
      width.mockRestore();
    }
  });
  it('窄容器限制树的最大宽度，给右侧列表留出空间', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    try {
      const wrapper = render(JccTreeTableLayout);
      await nextTick();
      const separator = wrapper.find('[role="separator"]');
      expect(separator.attributes('aria-valuemin')).toBe('180');
      expect(separator.attributes('aria-valuemax')).toBe('190');
      expect(separator.attributes('aria-valuenow')).toBe('190');
    } finally {
      width.mockRestore();
    }
  });
});
describe('上传适配边界', () => {
  it('不支持的文件在发起请求前拒绝', async () => {
    const upload = vi.fn();
    const wrapper = render(JccUpload, { props: { upload, accept: '.pdf' } });
    const result = await wrapper.findComponent(Upload).props('beforeUpload')(
      new File(['demo'], 'bad.txt'),
      [],
    );
    expect(result).toBe(Upload.LIST_IGNORE);
    expect(upload).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('不支持');
  });
  it('成功在适配器完成后回传，失败有错误反馈', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ id: 'f1', name: 'a.txt' })
      .mockRejectedValueOnce(new Error('服务器拒绝'));
    const wrapper = render(JccUpload, { props: { upload } });
    const request = wrapper.findComponent(Upload).props('customRequest');
    const success = vi.fn(),
      failure = vi.fn();
    request({ file: new File(['a'], 'a.txt'), onSuccess: success, onError: failure });
    expect(success).not.toHaveBeenCalled();
    await flushPromises();
    expect(success).toHaveBeenCalledWith({ id: 'f1', name: 'a.txt' });
    request({ file: new File(['b'], 'b.txt'), onSuccess: success, onError: failure });
    await flushPromises();
    expect(failure.mock.calls[0][0].message).toBe('服务器拒绝');
    expect(wrapper.text()).toContain('服务器拒绝');
  });
  it('移除/卸载会中止上传并忽略晚到的成功回调', async () => {
    let resolve;
    const upload = vi.fn(() => new Promise((r) => (resolve = r)));
    const wrapper = render(JccUpload, { props: { upload } });
    const success = vi.fn();
    const task = wrapper.findComponent(Upload).props('customRequest')({
      file: new File(['a'], 'a.txt'),
      onSuccess: success,
    });
    await Promise.resolve();
    task.abort();
    resolve({ id: 'late' });
    await flushPromises();
    expect(upload.mock.calls[0][1].signal.aborted).toBe(true);
    expect(success).not.toHaveBeenCalled();
  });
});
describe('公共表单弹窗', () => {
  const field = ({ model }) =>
    h(Form.Item, { name: 'name', label: '名称' }, () =>
      h(Input, { value: model.name, 'onUpdate:value': (value) => (model.name = value) }),
    );
  const button = (text) =>
    Array.from(document.querySelectorAll('.ant-modal button')).find(
      (node) => node.textContent.replace(/\s/g, '') === text,
    );
  it('接口失败保留字段并可重试成功', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('保存失败'))
      .mockResolvedValueOnce({ id: 1 });
    const wrapper = render(JccFormModal, {
      props: {
        open: true,
        initialValues: { name: '初始' },
        rules: { name: [{ required: true, message: '必填' }] },
        submit,
      },
      slots: { default: field },
    });
    await flushPromises();
    document.querySelector('.jcc-modal-fullscreen-button').click();
    await nextTick();
    expect(document.querySelector('.jcc-modal-fullscreen')).toBeTruthy();
    const input = document.querySelector('.ant-modal input');
    input.value = '保留内容';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存').click();
    await flushPromises();
    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(document.querySelector('.ant-modal input').value).toBe('保留内容');
    expect(document.body.textContent).toContain('保存失败');
    button('保存').click();
    await flushPromises();
    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
  });
  it('未填写不调用接口，双击只保存一次', async () => {
    let resolve;
    const submit = vi.fn(() => new Promise((r) => (resolve = r)));
    const wrapper = render(JccFormModal, {
      props: {
        open: true,
        initialValues: { name: '' },
        rules: { name: [{ required: true, message: '必填' }] },
        submit,
      },
      slots: { default: field },
    });
    await flushPromises();
    button('保存').click();
    await flushPromises();
    expect(submit).not.toHaveBeenCalled();
    const input = document.querySelector('.ant-modal input');
    input.value = '有效内容';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存').click();
    button('保存').click();
    await flushPromises();
    expect(submit).toHaveBeenCalledTimes(1);
    resolve({ id: 1 });
    await flushPromises();
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });
  it('修改后关闭仍需确认放弃', async () => {
    const wrapper = render(JccFormModal, {
      props: { open: true, initialValues: { name: '初始' }, submit: vi.fn() },
      slots: { default: field },
    });
    await flushPromises();
    const input = document.querySelector('.ant-modal input');
    input.value = '已修改';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    document.querySelector('.ant-modal-close').click();
    await flushPromises();
    expect(document.body.textContent).toContain('有尚未保存的修改');
    expect(wrapper.emitted('update:open')).toBeUndefined();
    button('放弃修改').click();
    await nextTick();
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
  });
});
describe('下载适配与错误恢复', () => {
  it('请求失败不下载，重试后使用服务端文件名', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('没有下载权限'))
      .mockResolvedValueOnce({ blob: new Blob(['demo']), filename: 'result.txt' });
    const wrapper = render(JccDownload, {
      props: { file: { id: 1, name: 'original.txt' }, request },
    });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(click).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('没有下载权限');
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.instances[0].download).toBe('result.txt');
    expect(wrapper.emitted('success')).toHaveLength(1);
  });
  it('卸载后晚到的响应不触发下载', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let resolve;
    const request = vi.fn(() => new Promise((r) => (resolve = r)));
    const wrapper = render(JccDownload, { props: { file: { id: 1, name: 'a.txt' }, request } });
    await wrapper.find('button').trigger('click');
    await Promise.resolve();
    wrapper.unmount();
    resolve(new Blob(['late']));
    await flushPromises();
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });
});
