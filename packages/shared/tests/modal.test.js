import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { JccModal, JccProvider, openModal } from '@jcc/shared/components';

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = '';
});

describe('编程式弹窗', () => {
  it('在其他组件内打开，传递 props、内容事件、Modal 参数并可关闭', async () => {
    const saved = vi.fn();
    const Editor = defineComponent({
      props: { name: String },
      emits: ['saved'],
      setup(props, { emit }) {
        return () =>
          h('button', { class: 'save-user', onClick: () => emit('saved', props.name) }, props.name);
      },
    });
    let handle;
    const Caller = defineComponent({
      setup() {
        return () =>
          h(
            'button',
            {
              class: 'launch-modal',
              onClick: () => {
                handle = openModal({
                  component: Editor,
                  props: { name: '小王' },
                  on: {
                    saved: (name) => {
                      saved(name);
                      handle.close();
                    },
                  },
                  modalProps: { title: '编辑用户', width: 720, footer: null },
                });
              },
            },
            '打开',
          );
      },
    });
    wrapper = mount(JccProvider, { attachTo: document.body, slots: { default: () => h(Caller) } });
    wrapper.find('.launch-modal').trigger('click');
    await flushPromises();
    expect(document.querySelector('.ant-modal-title').textContent).toContain('编辑用户');
    expect(document.querySelector('.save-user').textContent).toBe('小王');
    expect(document.querySelector('.ant-modal').style.width).toBe('720px');
    document.querySelector('.save-user').click();
    await nextTick();
    expect(saved).toHaveBeenCalledWith('小王');
    expect(wrapper.findComponent(JccModal).props('open')).toBe(false);
  });

  it('标题可拖拽，切换全屏时复位，并回调状态', async () => {
    const changed = vi.fn();
    wrapper = mount(JccProvider, { attachTo: document.body });
    openModal({
      component: defineComponent({ setup: () => () => h('div', '内容') }),
      modalProps: { title: '可拖拽' },
      onFullscreenChange: changed,
    });
    await flushPromises();
    const position = document.querySelector('.jcc-modal-position');
    position.getBoundingClientRect = () => ({ left: 100, right: 500, top: 100, bottom: 400 });
    document.querySelector('.jcc-modal-title').dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 150,
        clientY: 150,
      }),
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 190, clientY: 180 }));
    await nextTick();
    expect(position.style.transform).toContain('translate(40px, 30px)');
    window.dispatchEvent(new MouseEvent('pointerup'));
    position.getBoundingClientRect = () => ({ left: 140, right: 540, top: 100, bottom: 1300 });
    document.querySelector('.jcc-modal-title').dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 180,
        clientY: 140,
      }),
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 180, clientY: 185 }));
    await nextTick();
    expect(position.style.transform).toContain('translate(40px, 30px)');
    window.dispatchEvent(new MouseEvent('pointerup'));
    document.querySelector('.jcc-modal-fullscreen-button').click();
    await nextTick();
    expect(changed).toHaveBeenCalledWith(true, expect.any(Object));
    expect(document.querySelector('.jcc-modal-fullscreen')).toBeTruthy();
    expect(position.style.transform).toContain('translate(0px, 0px)');
  });

  it('没有 Provider 时给出明确错误', () => {
    expect(() => openModal({ component: 'div' })).toThrow('JccProvider');
  });
});
