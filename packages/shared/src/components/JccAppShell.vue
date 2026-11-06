<script setup>
import { computed } from 'vue';
import {
  Avatar,
  Button,
  Layout,
  LayoutContent,
  LayoutSider,
  Menu,
  Tabs,
  TabPane,
} from 'ant-design-vue';
import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined } from '@ant-design/icons-vue';
const props = defineProps({
  activeKey: { type: String, required: true },
  items: { type: Array, default: () => [] },
  collapsed: Boolean,
  brand: { type: String, default: '业务管理平台' },
  shortName: { type: String, default: '业务管理' },
  brandMark: { type: String, default: '综' },
  userName: { type: String, default: '管理员' },
  department: { type: String, default: '' },
  showTabs: { type: Boolean, default: true },
});
const emit = defineEmits(['update:activeKey', 'update:collapsed']);
const title = computed(() => props.items.find((item) => item.key === props.activeKey)?.label || '');
</script>
<template>
  <a class="fs-skip" href="#main-content">跳到主要内容</a>
  <header class="fs-header">
    <div class="fs-brand">
      <slot name="brand">
        <span class="fs-brand-mark" aria-hidden="true">{{ brandMark }}</span>
        <div class="fs-brand-subtitle">
          <strong>{{ shortName }}</strong>
          <div class="fs-brand-en">BUSINESS CENTER</div>
        </div>
        <span class="fs-brand-divider" aria-hidden="true"></span>
        <span class="fs-brand-title">{{ brand }}</span>
      </slot>
    </div>
    <div class="fs-header-tools">
      <slot name="header-actions" />
      <slot name="user" :user-name="userName" :department="department">
        <div class="fs-user">
          <Avatar :size="28">
            <template #icon><UserOutlined /></template>
          </Avatar>
          <span>{{ userName }}</span>
        </div>
      </slot>
    </div>
  </header>
  <Layout class="fs-main-layout">
    <LayoutSider
      class="fs-sidebar"
      :width="'var(--sidebar-width)'"
      :collapsed="collapsed"
      :collapsed-width="'var(--sidebar-collapsed-width)'"
      theme="light"
      :trigger="null"
      collapsible
    >
      <div class="fs-side-top">
        <span v-if="!collapsed">业务导航</span>
        <Button
          type="text"
          :aria-label="collapsed ? '展开导航' : '收起导航'"
          @click="emit('update:collapsed', !collapsed)"
        >
          <MenuUnfoldOutlined v-if="collapsed" />
          <MenuFoldOutlined v-else />
        </Button>
      </div>
      <Menu
        :selected-keys="[activeKey]"
        :items="items"
        mode="inline"
        @click="({ key }) => emit('update:activeKey', key)"
      />
      <div v-if="!collapsed" class="fs-side-bottom">
        <slot name="footer">{{ department }}</slot>
      </div>
    </LayoutSider>
    <LayoutContent class="fs-content">
      <Tabs
        v-if="showTabs"
        :active-key="activeKey"
        class="fs-page-tabs"
        :animated="false"
        aria-label="页面导航"
        @change="emit('update:activeKey', $event)"
      >
        <TabPane v-for="item in items" :key="item.key" :tab="item.label" />
      </Tabs>
      <main id="main-content" class="fs-page-area" :aria-label="title">
        <slot />
      </main>
    </LayoutContent>
  </Layout>
</template>
