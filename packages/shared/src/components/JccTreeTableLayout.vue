<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  treeLabel: { type: String, default: '分类树' },
  separatorLabel: { type: String, default: '调整左侧宽度' },
  mobileOpen: Boolean,
  defaultTreeWidth: { type: Number, default: undefined },
  minTreeWidth: { type: Number, default: 180 },
  maxTreeWidth: { type: Number, default: 480 },
  minContentWidth: { type: Number, default: 300 },
});
const emit = defineEmits(['resize']);

const layout = ref(null);
const layoutWidth = ref(0);
const treeWidth = ref(null);
const maximumWidth = computed(() =>
  Math.max(
    props.minTreeWidth,
    Math.min(props.maxTreeWidth, layoutWidth.value - props.minContentWidth - 10),
  ),
);
let resizeObserver;
let startX = 0;
let startWidth = 0;

function isMobile() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function clampWidth(value) {
  return Math.round(Math.max(props.minTreeWidth, Math.min(maximumWidth.value, value)));
}

function setWidth(value) {
  const next = clampWidth(value);
  if (next === treeWidth.value) return;
  treeWidth.value = next;
  emit('resize', next);
}

function syncLayoutWidth() {
  layoutWidth.value = layout.value?.clientWidth || 0;
  if (!layoutWidth.value || isMobile()) return;
  if (treeWidth.value == null) {
    setWidth(props.defaultTreeWidth ?? Math.max(200, Math.min(300, layoutWidth.value * 0.24)));
  } else {
    setWidth(treeWidth.value);
  }
}

function moveDrag(event) {
  setWidth(startWidth + event.clientX - startX);
}

function stopDrag() {
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', stopDrag);
  window.removeEventListener('pointercancel', stopDrag);
  document.body.classList.remove('jcc-tree-table-resizing');
}

function startDrag(event) {
  if (event.button !== 0 || isMobile()) return;
  event.preventDefault();
  startX = event.clientX;
  startWidth =
    treeWidth.value ??
    layout.value?.querySelector('.jcc-tree-table__tree')?.getBoundingClientRect().width ??
    200;
  document.body.classList.add('jcc-tree-table-resizing');
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
}

function resizeByKeyboard(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  setWidth((treeWidth.value ?? 200) + (event.key === 'ArrowRight' ? 24 : -24));
}

onMounted(() => {
  syncLayoutWidth();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(syncLayoutWidth);
    resizeObserver.observe(layout.value);
  } else {
    window.addEventListener('resize', syncLayoutWidth);
  }
});
onBeforeUnmount(() => {
  stopDrag();
  resizeObserver?.disconnect();
  window.removeEventListener('resize', syncLayoutWidth);
});
</script>

<template>
  <div
    ref="layout"
    class="jcc-tree-table"
    :class="{ 'is-mobile-open': mobileOpen }"
    :style="treeWidth == null ? undefined : { '--jcc-tree-table-width': `${treeWidth}px` }"
  >
    <aside class="jcc-tree-table__tree" :aria-label="treeLabel">
      <header v-if="$slots['tree-header']" class="jcc-tree-table__tree-header">
        <slot name="tree-header" />
      </header>
      <div class="jcc-tree-table__tree-body"><slot name="tree" /></div>
    </aside>
    <div
      class="jcc-tree-table__resizer"
      role="separator"
      :aria-label="separatorLabel"
      aria-orientation="vertical"
      :aria-valuemin="minTreeWidth"
      :aria-valuemax="maximumWidth"
      :aria-valuenow="treeWidth ?? undefined"
      tabindex="0"
      :title="`${separatorLabel}：拖动或按左右方向键`"
      @pointerdown="startDrag"
      @keydown="resizeByKeyboard"
    >
      <span aria-hidden="true">↔</span>
    </div>
    <section class="jcc-tree-table__content">
      <header v-if="$slots['content-header']" class="jcc-tree-table__content-header">
        <slot name="content-header" />
      </header>
      <slot name="toolbar" />
      <slot />
    </section>
  </div>
</template>
