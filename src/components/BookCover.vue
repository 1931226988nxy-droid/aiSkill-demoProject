<script setup>
// 文件职责：图书封面：真实 URL 或按书名生成的占位封面。
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
  size: { type: String, default: 'sm' },
})

const palette = [
  'linear-gradient(145deg, #5b8def, #2f67d8)',
  'linear-gradient(145deg, #6ac8c0, #2f9e9a)',
  'linear-gradient(145deg, #9b87f2, #7159d8)',
  'linear-gradient(145deg, #f0b65e, #d9902e)',
  'linear-gradient(145deg, #e88b9c, #c55770)',
]

const initial = computed(() => (props.title || '书').trim().slice(0, 1))
// 用书名做轻量哈希选择占位封面配色，同一本书每次渲染颜色稳定。
const background = computed(() => {
  const text = props.title || ''
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash + text.charCodeAt(index) * (index + 1)) % palette.length
  }
  return palette[hash]
})
</script>

<template>
  <div class="book-cover" :class="`book-cover--${size}`">
    <img v-if="coverUrl" :src="coverUrl" :alt="`${title}封面`" loading="lazy" />
    <div v-else class="book-cover__fallback" :style="{ background }" aria-hidden="true">
      <span>{{ initial }}</span>
      <small>{{ title }}</small>
    </div>
  </div>
</template>

<style scoped>
.book-cover {
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
  background: #e8edf7;
  box-shadow: 0 3px 10px rgb(26 49 86 / 14%);
}
.book-cover img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.book-cover--sm {
  width: 42px;
  height: 58px;
}
.book-cover--md {
  width: 76px;
  height: 104px;
}
.book-cover--lg {
  width: 150px;
  height: 210px;
  border-radius: 10px;
}
.book-cover__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px;
  color: #fff;
  text-align: center;
}
.book-cover__fallback span {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}
.book-cover__fallback small {
  display: -webkit-box;
  overflow: hidden;
  font-size: 8px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.book-cover--md .book-cover__fallback span {
  font-size: 28px;
}
.book-cover--md .book-cover__fallback small {
  font-size: 10px;
}
.book-cover--lg .book-cover__fallback span {
  font-size: 52px;
}
.book-cover--lg .book-cover__fallback small {
  font-size: 14px;
  -webkit-line-clamp: 3;
}
</style>
