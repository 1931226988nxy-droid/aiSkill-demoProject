<template>
  <div class="auth-page">
    <section class="auth-brand" aria-label="图书馆介绍">
      <div class="auth-brand__mark" aria-hidden="true">书</div>
      <p class="auth-brand__eyebrow">YUNLAN LIBRARY</p>
      <h1>图书管理系统</h1>
      <p class="auth-brand__lead">馆藏、借阅、预约与管理在一处完成。</p>
      <ul class="auth-brand__features">
        <li>实时馆藏检索与预约排队</li>
        <li>借还、续借与逾期费用闭环</li>
        <li>角色权限与完整审计记录</li>
      </ul>
    </section>
    <section class="auth-panel">
      <div class="auth-panel__inner">
        <div class="auth-mobile-brand">
          <span class="auth-brand__mark" aria-hidden="true">书</span>
          <strong>图书管理系统</strong>
        </div>
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.auth-page {
  display: grid;
  grid-template-columns: minmax(380px, 0.9fr) minmax(440px, 1.1fr);
  height: 100vh;
  min-height: 100vh;
  overflow-y: auto;
  background: #f2f5fb;
}
.auth-brand {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 64px max(6vw, 56px);
  color: #fff;
  background:
    radial-gradient(circle at 85% 20%, rgb(255 255 255 / 18%), transparent 34%),
    radial-gradient(circle at 10% 90%, rgb(7 158 245 / 35%), transparent 32%),
    linear-gradient(140deg, #1f5fd7 0%, #1677e8 48%, #08a8c9 100%);
}
.auth-brand::after {
  content: '';
  position: absolute;
  right: -80px;
  bottom: -120px;
  width: 380px;
  height: 380px;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 50%;
  box-shadow: 0 0 0 48px rgb(255 255 255 / 4%), 0 0 0 96px rgb(255 255 255 / 3%);
}
.auth-brand__mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 3px double rgb(255 255 255 / 90%);
  border-radius: 50%;
  font-size: 23px;
  font-weight: 700;
}
.auth-brand__eyebrow {
  margin: 28px 0 6px;
  font-size: 11px;
  letter-spacing: 0.26em;
  opacity: 0.8;
}
.auth-brand h1 {
  margin: 0;
  font-size: clamp(34px, 4vw, 48px);
  line-height: 1.15;
  letter-spacing: 0.04em;
}
.auth-brand__lead {
  max-width: 24em;
  margin-top: 16px !important;
  font-size: 16px;
  line-height: 1.8;
  opacity: 0.9;
}
.auth-brand__features {
  margin: 38px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
  font-size: 14px;
  opacity: 0.94;
}
.auth-brand__features li::before {
  content: '·';
  margin-right: 10px;
  font-size: 22px;
  line-height: 0;
  vertical-align: -2px;
}
.auth-panel {
  display: grid;
  place-items: center;
  padding: 40px 24px;
}
.auth-panel__inner {
  width: min(440px, 100%);
  padding: 38px 36px 32px;
  background: #fff;
  border: 1px solid var(--color-border-soft);
  border-radius: 20px;
  box-shadow: 0 22px 60px rgb(36 62 112 / 10%);
}
.auth-mobile-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
}
.auth-mobile-brand .auth-brand__mark {
  width: 38px;
  height: 38px;
  color: #fff;
  background: var(--color-primary);
  font-size: 18px;
}
@media (max-width: 900px) {
  .auth-page {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
    min-height: 100vh;
    overflow-y: visible;
  }
  .auth-brand {
    display: none;
  }
  .auth-mobile-brand {
    display: flex;
  }
  .auth-panel {
    padding: 24px 16px;
    align-items: start;
  }
  .auth-panel__inner {
    margin-top: 5vh;
    padding: 28px 22px;
  }
}
</style>
