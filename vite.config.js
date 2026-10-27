import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import { jccLiveViteConfig } from '@jcc/shared/vite'

const live = jccLiveViteConfig(process.cwd())

export default defineConfig({
  ...live,
  plugins: [
    vue(),
    Components({
      dts: false,
      resolvers: [
        AntDesignVueResolver({
          // Ant Design Vue 4 使用 CSS-in-JS，无需额外引入组件样式
          importStyle: false,
        }),
      ],
    }),
  ],
  resolve: {
    ...live.resolve,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
