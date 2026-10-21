/**
 * The seller-specific half of the paywall: price, payment instructions, and
 * where a buyer goes to get a key. All of it is build-time configuration so
 * the checkout details can change without touching the gate itself.
 *
 * Every value has a working default, so a deployment that sets none of these
 * still renders a coherent page — it just tells the buyer to get in touch.
 */

export type LicenseSalesInfo = {
  /** What the buyer pays, already formatted for display. */
  priceLabel: string;
  /**
   * WeChat ID, email, or whatever the buyer should contact to pay. Public by
   * design — it is printed on the purchase page — so it carries a real default
   * rather than needing an environment variable set before the page makes
   * sense.
   */
  contact: string;
  /** Path or URL of a payment QR image; empty hides the QR block. */
  payQrUrl: string;
  /** A hosted checkout page, if there is one; empty hides the button. */
  buyUrl: string;
};

function envValue(name: string, fallback: string): string {
  const raw = (import.meta.env?.[name] as string | undefined) ?? "";
  return raw.trim() || fallback;
}

export function licenseSalesInfo(): LicenseSalesInfo {
  return {
    priceLabel: envValue("VITE_LICENSE_PRICE_LABEL", "¥49"),
    contact: envValue("VITE_LICENSE_CONTACT", "el_hazel"),
    payQrUrl: envValue("VITE_LICENSE_PAY_QR", ""),
    buyUrl: envValue("VITE_LICENSE_BUY_URL", ""),
  };
}

/** What the buyer gets for the one-time price. Kept short and concrete. */
export const LICENSE_INCLUDED_FEATURES = [
  "Excel / CSV 达人表格导入导出，数据存在你自己的浏览器里",
  "每日跟进任务清单，按优先级排好序",
  "达人库检索、状态流转、归档与多轮次管理",
  "多角度话术库 + 关系层级语气，按渠道生成英文私信和邮件",
  "拍摄要求与合作条款自动写进 brief，含 FTC 披露条款",
  "多店铺、多产品的 Campaign 配置",
];
