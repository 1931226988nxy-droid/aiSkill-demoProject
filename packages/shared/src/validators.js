/** 前端格式校验；业务和服务端仍需验证真实数据。 */
export const patterns = Object.freeze({
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  mobileCN: /^1[3-9]\d{9}$/,
  positiveInteger: /^[1-9]\d*$/,
});

export function isEmail(value) {
  return patterns.email.test(String(value ?? '').trim());
}

export function isMobileCN(value) {
  return patterns.mobileCN.test(String(value ?? '').trim());
}

export function isPositiveInteger(value) {
  return patterns.positiveInteger.test(String(value ?? '').trim());
}
