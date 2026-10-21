/**
 * What each platform means to the rest of the tool.
 *
 * The app began as TikTok-only and every campaign saved before this module
 * existed is a TikTok campaign. So nothing reads `campaign.platform`
 * directly — `platformOf` supplies the default, and an old campaign keeps
 * behaving exactly as it did.
 *
 * The point of collecting this here is that adding a platform should be one
 * entry in `PLATFORM_SPECS`, not a hunt through the message generator. What
 * genuinely differs between platforms is narrow: which channels can reach a
 * creator, and what "attach the product link" means when a campaign has not
 * written its own requirement.
 */
import type { Campaign, Channel, Platform } from "./types";

/**
 * The platform every campaign saved before this field existed was running on.
 * Used once, by the load-time migration in `campaignData`, to write that fact
 * down — not as a running default. A campaign created from here on either has
 * a platform because someone chose one, or has none and says so.
 */
export const LEGACY_PLATFORM: Platform = "tiktok";

/**
 * Channels that do not belong to any platform. What is left when a campaign
 * has not said where its creators are — enough to keep working, without
 * pretending to know.
 */
const PLATFORM_NEUTRAL_CHANNELS: Channel[] = ["Email", "WhatsApp"];

export type PlatformSpec = {
  id: Platform;
  /** Shown in pickers and on badges. */
  label: string;
  /** Channels a creator on this platform can actually be reached on. */
  channels: Channel[];
  /**
   * The brief's link requirement when the campaign leaves it blank. These are
   * not interchangeable: TikTok Shop puts a product card on the video itself,
   * Instagram has no in-post link and needs a Stories sticker, and Facebook
   * takes a plain link in the post body.
   */
  productLinkFallbackEn: string;
  productLinkFallbackZh: string;
  /**
   * Whether the platform runs a shop/affiliate programme. The affiliate-link
   * collaboration model and the ad-ready statuses both assume one.
   */
  hasShop: boolean;
  /** What asking a creator to let you boost their post is called here. */
  adAuthorizationEn: string;
  adAuthorizationZh: string;
};

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    id: "tiktok",
    label: "TikTok",
    channels: [
      "TikTok DM",
      "TikTok Shop Affiliate Message",
      "Email",
      "WhatsApp",
    ],
    productLinkFallbackEn: "make sure the TikTok Shop product link is attached",
    productLinkFallbackZh: "必须挂 TikTok Shop 产品链接",
    hasShop: true,
    adAuthorizationEn: "Spark Ads authorization / ad code",
    adAuthorizationZh: "Spark Ads 授权或广告码",
  },
  {
    id: "instagram",
    label: "Instagram",
    channels: ["Instagram DM", "Email", "WhatsApp"],
    productLinkFallbackEn:
      "tag the brand account and add the product link with a link sticker in Stories",
    productLinkFallbackZh: "必须 @ 品牌账号，并在 Stories 用链接贴纸放产品链接",
    hasShop: false,
    adAuthorizationEn: "partnership ad authorization for this branded content",
    adAuthorizationZh: "品牌内容广告（Partnership Ads）授权",
  },
  {
    id: "facebook",
    label: "Facebook",
    channels: ["Facebook Messenger", "Email", "WhatsApp"],
    productLinkFallbackEn:
      "tag the brand page and include the product link in the post",
    productLinkFallbackZh: "必须 @ 品牌主页，并在正文里放产品链接",
    hasShop: false,
    adAuthorizationEn: "branded content ad authorization",
    adAuthorizationZh: "品牌内容广告授权",
  },
];

export function isPlatform(value: unknown): value is Platform {
  return PLATFORM_SPECS.some((spec) => spec.id === value);
}

export function platformSpec(platform: Platform): PlatformSpec {
  return (
    PLATFORM_SPECS.find((spec) => spec.id === platform) ?? PLATFORM_SPECS[0]
  );
}

/**
 * The platform of a campaign, or `undefined` when nobody has chosen one.
 *
 * Deliberately not defaulted. Assuming TikTok is how an Instagram creator ends
 * up being told to attach a TikTok Shop link — the tool would rather say it
 * does not know and ask.
 */
export function campaignPlatform(
  campaign: Pick<Campaign, "platform"> | undefined | null,
): Platform | undefined {
  const value = campaign?.platform;
  return isPlatform(value) ? value : undefined;
}

export function platformLabel(platform: Platform): string {
  return platformSpec(platform).label;
}

export function channelsForPlatform(platform: Platform | undefined): Channel[] {
  return platform ? platformSpec(platform).channels : PLATFORM_NEUTRAL_CHANNELS;
}

/**
 * What the brief should say about the product link. Empty when the platform is
 * unknown: leaving the line out is honest, while inventing one risks telling a
 * creator to do something their platform cannot do.
 */
export function linkRequirementFallback(
  platform: Platform | undefined,
): string {
  return platform ? platformSpec(platform).productLinkFallbackEn : "";
}

/**
 * The same requirement in Chinese, for the surfaces the seller reads rather
 * than the creator: the audit checklist, field labels, the explanation under a
 * generated script. These used to say "TikTok Shop" no matter what the
 * campaign was running on, which is how an Instagram campaign ended up with a
 * checklist item nobody could tick.
 */
export function linkRequirementFallbackZh(
  platform: Platform | undefined,
): string {
  return platform ? platformSpec(platform).productLinkFallbackZh : "";
}

/**
 * How the seller-facing copy should name the campaign's commerce setup, e.g.
 * "TikTok Shop affiliate" or "Instagram 品牌合作". Empty when the platform is
 * unknown, so callers leave the clause out rather than guessing.
 */
export function platformCommerceLabel(platform: Platform | undefined): string {
  if (!platform) return "";
  const spec = platformSpec(platform);
  return spec.hasShop
    ? `${spec.label} Shop affiliate`
    : `${spec.label} 品牌合作`;
}

/** Whether a campaign still owes us a platform choice. */
export function needsPlatformChoice(
  campaign: Pick<Campaign, "platform"> | undefined | null,
): boolean {
  return campaignPlatform(campaign) === undefined;
}

/**
 * Keep a chosen channel valid when the platform changes. Switching a campaign
 * from TikTok to Instagram must not leave "TikTok Shop Affiliate Message"
 * selected, which would generate a message nobody can send.
 */
export function resolveChannelForPlatform(
  channel: Channel,
  platform: Platform | undefined,
): Channel {
  const allowed = channelsForPlatform(platform);
  if (allowed.includes(channel)) return channel;

  // Prefer the same kind of channel rather than dropping to the first one.
  const preferred = allowed.find(
    (item) => channelStyle(item) === channelStyle(channel),
  );
  return preferred ?? allowed[0];
}

/**
 * How a message should read, independent of which platform's inbox it lands
 * in. Adding a platform's DM to `Channel` gives it the right tone for free —
 * the generator branches on style, not on channel names.
 */
export type ChannelStyle = "dm" | "affiliate" | "email" | "whatsapp";

export function channelStyle(channel: Channel | string): ChannelStyle {
  if (channel === "Email") return "email";
  if (channel === "WhatsApp") return "whatsapp";
  if (channel === "TikTok Shop Affiliate Message") return "affiliate";
  return "dm";
}

/** Whether this channel is a short, casual direct message. */
export function isDirectMessage(channel: Channel | string): boolean {
  return channelStyle(channel) === "dm";
}

/**
 * Channels that want the compact wording: a DM on any platform, and WhatsApp.
 * The platform inbox and email both get the fuller version.
 */
export function isShortFormChannel(channel: Channel | string): boolean {
  const style = channelStyle(channel);
  return style === "dm" || style === "whatsapp";
}

/**
 * Fields where the campaign's own wording still names a different platform.
 *
 * Switching platform never rewrites this text — it is the seller's own copy,
 * and silently editing it would be worse than leaving it. But saying nothing
 * is worse still: an Instagram campaign whose brief reads "必须挂 TikTok Shop
 * 产品链接" sends a creator an instruction they cannot follow. So the app
 * points at the lines and lets the seller decide.
 */
export function fieldsNamingOtherPlatform(
  campaign: Pick<
    Campaign,
    "requirements" | "tagRequirement" | "keyContentPoints" | "notes"
  > & { productLinkRequirement?: string },
  platform: Platform | undefined,
): string[] {
  const others = PLATFORM_SPECS.filter((spec) => spec.id !== platform);
  if (others.length === PLATFORM_SPECS.length && platform) return [];

  const mentionsOther = (value: string | undefined): boolean =>
    Boolean(value) &&
    others.some((spec) => new RegExp(spec.label, "i").test(value as string));

  const flagged: string[] = [];
  if ((campaign.requirements ?? []).some(mentionsOther))
    flagged.push("拍摄要求");
  if (mentionsOther(campaign.tagRequirement)) flagged.push("Tag 要求");
  if (mentionsOther(campaign.productLinkRequirement))
    flagged.push("挂链接要求");
  if ((campaign.keyContentPoints ?? []).some(mentionsOther)) {
    flagged.push("重点拍摄内容");
  }
  if (mentionsOther(campaign.notes)) flagged.push("备注");

  return flagged;
}
