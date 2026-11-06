<script setup>
// 登录和注册共用应用级品牌配置。
import { siteConfig } from '@/site-config'
</script>

<!-- 文件职责：登录/注册页共用的品牌展示与响应式双栏卡片。 -->
<template>
  <div class="auth-page">
    <div class="auth-card">
      <section class="auth-brand" aria-label="图书馆介绍">
        <div class="auth-brand__identity">
          <span class="auth-brand__mark" aria-hidden="true">{{ siteConfig.brandMark }}</span>
          <span class="auth-brand__name">
            <strong>{{ siteConfig.shortName }}</strong>
            <small>{{ siteConfig.englishName }}</small>
          </span>
        </div>

        <div class="auth-brand__message">
          <h1>{{ siteConfig.title }}</h1>
          <span class="auth-brand__rule" aria-hidden="true"></span>
          <p>馆藏、借阅与管理，一站式办理。</p>
        </div>
      </section>

      <main class="auth-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: grid;
  place-items: center;
  height: 100vh;
  min-height: 100vh;
  padding: 28px 24px;
  overflow-y: auto;
  background: var(--color-page);
}

.auth-card {
  display: grid;
  grid-template-columns: minmax(0, 42%) minmax(0, 58%);
  width: min(980px, 100%);
  min-height: 550px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: 0 18px 44px rgb(37 52 86 / 11%);
}

.auth-brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  padding: 50px 46px 62px;
  overflow: hidden;
  color: var(--color-header-text);
  background: linear-gradient(
    135deg,
    var(--header-start) 0%,
    var(--header-mid) 60%,
    var(--header-end) 100%
  );
}

.auth-brand::before,
.auth-brand::after {
  content: '';
  position: absolute;
  pointer-events: none;
  background: rgb(255 255 255 / 7%);
  transform: rotate(-22deg);
}

.auth-brand::before {
  top: -90px;
  right: -130px;
  width: 270px;
  height: 260px;
  border-radius: 38px;
}

.auth-brand::after {
  right: -105px;
  bottom: -190px;
  width: 360px;
  height: 280px;
  border-radius: 48px;
}

.auth-brand__identity,
.auth-brand__message {
  position: relative;
  z-index: 1;
}

.auth-brand__identity {
  display: flex;
  align-items: center;
  gap: 16px;
}

.auth-brand__mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 54px;
  height: 54px;
  border: 3px double rgb(255 255 255 / 95%);
  border-radius: 50%;
  font-size: 25px;
  font-weight: 700;
}

.auth-brand__name {
  display: grid;
  gap: 3px;
}

.auth-brand__name strong {
  font-size: 23px;
  font-weight: 650;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.auth-brand__name small {
  font-size: 11px;
  letter-spacing: 0.13em;
  opacity: 0.9;
}

.auth-brand__message h1 {
  margin: 0;
  color: #fff;
  font-size: clamp(30px, 3.2vw, 40px);
  font-weight: 650;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.auth-brand__rule {
  display: block;
  width: 54px;
  height: 4px;
  margin: 24px 0 21px;
  border-radius: 2px;
  background: rgb(255 255 255 / 70%);
}

.auth-brand__message p {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
}

.auth-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 46px clamp(36px, 4vw, 58px);
}

@media (max-width: 760px) {
  .auth-page {
    display: block;
    padding: 16px;
  }

  .auth-card {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .auth-brand {
    gap: 36px;
    padding: 24px 26px 28px;
  }

  .auth-brand__mark {
    width: 40px;
    height: 40px;
    font-size: 19px;
  }

  .auth-brand__name strong {
    font-size: 18px;
  }

  .auth-brand__name small {
    font-size: 9px;
  }

  .auth-brand__message h1 {
    font-size: 24px;
  }

  .auth-brand__rule {
    width: 36px;
    height: 3px;
    margin: 12px 0 10px;
  }

  .auth-brand__message p {
    font-size: 12px;
  }

  .auth-content {
    padding: 28px 24px 32px;
  }
}

@media (max-width: 380px) {
  .auth-page {
    padding: 10px;
  }

  .auth-brand {
    padding-inline: 20px;
  }

  .auth-content {
    padding-inline: 20px;
  }
}
</style>
