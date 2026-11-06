<script setup>
import { h, onBeforeUnmount, onMounted, shallowReactive, toHandlerKey, camelize } from 'vue';
import JccModal from '../JccModal.vue';
import { registerModalHost } from '../modalService.js';

const entries = shallowReactive([]);
let unregister;
let nextId = 0;

function remove(entry) {
  const index = entries.indexOf(entry);
  if (index !== -1) entries.splice(index, 1);
}

function open(options) {
  const entry = shallowReactive({
    id: ++nextId,
    options,
    open: true,
    fullscreen: Boolean(options.fullscreen),
  });
  const handle = {
    close() {
      entry.open = false;
    },
    setFullscreen(value) {
      entry.fullscreen = Boolean(value);
    },
  };
  entry.handle = handle;
  entries.push(entry);
  return handle;
}

onMounted(() => {
  unregister = registerModalHost({ open });
});
onBeforeUnmount(() => {
  unregister?.();
  entries.splice(0);
});

function renderContent(entry) {
  const { component, props = {}, on = {}, slots } = entry.options;
  const listeners = Object.fromEntries(
    Object.entries(on).map(([event, callback]) => [toHandlerKey(camelize(event)), callback]),
  );
  return h(component, { ...props, ...listeners }, slots);
}

function renderEntry(entry) {
  const {
    modalProps = {},
    modalSlots = {},
    draggable = true,
    onOk,
    onCancel,
    onFullscreenChange,
  } = entry.options;
  return h(
    JccModal,
    {
      ...modalProps,
      open: entry.open,
      draggable,
      fullscreen: entry.fullscreen,
      'onUpdate:open': (value) => {
        entry.open = value;
      },
      'onUpdate:fullscreen': (value) => {
        entry.fullscreen = value;
        onFullscreenChange?.(value, entry.handle);
      },
      onOk: (event) => (onOk || modalProps.onOk)?.(event, entry.handle),
      onCancel: (event) => (onCancel || modalProps.onCancel)?.(event, entry.handle),
      afterClose: () => {
        modalProps.afterClose?.();
        remove(entry);
      },
    },
    { ...modalSlots, default: () => renderContent(entry) },
  );
}

const EntryView = ({ entry }) => renderEntry(entry);
</script>

<template>
  <EntryView v-for="entry in entries" :key="entry.id" :entry="entry" />
</template>
