<script setup>
defineProps({ title: { type: String, default: '' } });
</script>
<template>
  <section class="fs-workspace" :aria-label="title">
    <slot name="breadcrumb" />
    <header v-if="title || $slots.header" class="jcc-panel-header">
      <slot name="header">
        <h1 class="fs-section-title">{{ title }}</h1>
      </slot>
      <slot name="extra" />
    </header>
    <slot />
  </section>
</template>
