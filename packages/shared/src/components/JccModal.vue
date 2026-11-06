<script setup>
import { computed, h, onBeforeUnmount, reactive, useAttrs, watch } from 'vue';
import { Button, Modal } from 'ant-design-vue';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons-vue';

defineOptions({ inheritAttrs: false });
const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  draggable: { type: Boolean, default: true },
  fullscreen: Boolean,
});
const emit = defineEmits(['update:open', 'update:fullscreen', 'ok', 'cancel']);
const attrs = useAttrs();
const offset = reactive({ x: 0, y: 0 });
let modalElement;
let dragStart;

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    stopDrag();
    offset.x = 0;
    offset.y = 0;
  },
);

const wrapClassName = computed(() =>
  [
    'jcc-modal-wrap',
    attrs.wrapClassName,
    props.fullscreen && 'jcc-modal-fullscreen',
    !props.draggable && 'jcc-modal-static',
  ]
    .filter(Boolean)
    .join(' '),
);

function renderModal({ originVNode }) {
  return h(
    'div',
    {
      class: 'jcc-modal-position',
      style: { transform: `translate(${offset.x}px, ${offset.y}px)` },
      ref: (element) => {
        modalElement = element;
      },
    },
    originVNode,
  );
}

function stopDrag() {
  dragStart = null;
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', stopDrag);
  window.removeEventListener('pointercancel', stopDrag);
}

function startDrag(event) {
  if (!props.draggable || props.fullscreen || event.button !== 0 || event.target.closest('button'))
    return;
  const bounds = modalElement?.getBoundingClientRect();
  if (!bounds) return;
  event.preventDefault();
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    left: bounds.left,
    right: bounds.right,
    top: bounds.top,
    bottom: bounds.bottom,
    offsetX: offset.x,
    offsetY: offset.y,
  };
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
}

function moveDrag(event) {
  if (!dragStart) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  // 弹窗高于视口时仍保留标题可见，不让拖拽边界反向把弹窗推走。
  const maxDx = Math.max(0, window.innerWidth - dragStart.right);
  const maxDy = Math.max(0, window.innerHeight - dragStart.bottom);
  offset.x = dragStart.offsetX + Math.min(Math.max(dx, -dragStart.left), maxDx);
  offset.y = dragStart.offsetY + Math.min(Math.max(dy, -dragStart.top), maxDy);
}

function toggleFullscreen() {
  stopDrag();
  offset.x = 0;
  offset.y = 0;
  emit('update:fullscreen', !props.fullscreen);
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <Modal
    v-bind="$attrs"
    :open="open"
    :wrap-class-name="wrapClassName"
    :modal-render="renderModal"
    @ok="(event) => emit('ok', event)"
    @cancel="
      (event) => {
        emit('cancel', event);
        emit('update:open', false);
      }
    "
  >
    <template #title>
      <div class="jcc-modal-title" @pointerdown="startDrag">
        <span class="jcc-modal-title-text">
          <slot name="title">{{ title }}</slot>
        </span>
        <Button
          class="jcc-modal-fullscreen-button"
          type="text"
          :aria-label="fullscreen ? '退出全屏' : '全屏'"
          :title="fullscreen ? '退出全屏' : '全屏'"
          @click="toggleFullscreen"
        >
          <FullscreenExitOutlined v-if="fullscreen" />
          <FullscreenOutlined v-else />
        </Button>
      </div>
    </template>
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </Modal>
</template>
