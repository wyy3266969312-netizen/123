import { describe, expect, it } from "vitest";

import {
  LEGACY_PLATFORM,
  PLATFORM_SPECS,
  channelStyle,
  channelsForPlatform,
  fieldsNamingOtherPlatform,
  isDirectMessage,
  isPlatform,
  isShortFormChannel,
  platformLabel,
  campaignPlatform,
  platformSpec,
  resolveChannelForPlatform,
} from "./platforms";
import type { Platform } from "./types";

describe("campaignPlatform", () => {
  it("says it does not know rather than assuming TikTok", () => {
    // Assuming is how an Instagram creator ends up being told to attach a
    // TikTok Shop link. Campaigns saved before the field existed are backfilled
    // once at load; after that, unset means genuinely unchosen.
    expect(campaignPlatform(undefined)).toBeUndefined();
    expect(campaignPlatform(null)).toBeUndefined();
    expect(campaignPlatform({})).toBeUndefined();
    expect(LEGACY_PLATFORM).toBe("tiktok");
  });

  it("reads a platform that was set", () => {
    expect(campaignPlatform({ platform: "instagram" })).toBe("instagram");
    expect(campaignPlatform({ platform: "facebook" })).toBe("facebook");
  });

  it("rejects a stored value it does not recognise", () => {
    // localStorage is user-editable and survives across versions.
    expect(
      campaignPlatform({ platform: "twitter" as Platform }),
    ).toBeUndefined();
    expect(campaignPlatform({ platform: "" as Platform })).toBeUndefined();
  });
});

describe("isPlatform", () => {
  it("accepts exactly the platforms that have a spec", () => {
    for (const spec of PLATFORM_SPECS) expect(isPlatform(spec.id)).toBe(true);
    for (const bad of ["twitter", "", null, undefined, 3, {}]) {
      expect(isPlatform(bad)).toBe(false);
    }
  });
});

describe("platform specs", () => {
  it("gives every platform channels and both link fallbacks", () => {
    for (const spec of PLATFORM_SPECS) {
      expect(spec.channels.length).toBeGreaterThan(0);
      expect(spec.productLinkFallbackEn.trim()).not.toBe("");
      expect(spec.productLinkFallbackZh.trim()).not.toBe("");
      expect(platformLabel(spec.id)).toBe(spec.label);
      expect(platformSpec(spec.id)).toBe(spec);
    }
  });

  it("never offers a channel belonging to another platform", () => {
    // Offering "TikTok Shop Affiliate Message" on an Instagram campaign would
    // compose a message with nowhere to send it.
    const exclusive: Record<string, Platform> = {
      "TikTok DM": "tiktok",
      "TikTok Shop Affiliate Message": "tiktok",
      "Instagram DM": "instagram",
      "Facebook Messenger": "facebook",
    };

    for (const spec of PLATFORM_SPECS) {
      for (const channel of spec.channels) {
        const owner = exclusive[channel];
        if (owner) expect(owner).toBe(spec.id);
      }
    }
  });

  it("only claims a shop where one exists", () => {
    expect(platformSpec("tiktok").hasShop).toBe(true);
    expect(platformSpec("instagram").hasShop).toBe(false);
    expect(platformSpec("facebook").hasShop).toBe(false);
  });

  it("does not tell an Instagram or Facebook creator to attach a TikTok link", () => {
    for (const spec of PLATFORM_SPECS) {
      if (spec.id === "tiktok") continue;
      expect(spec.productLinkFallbackEn).not.toMatch(/tiktok/i);
      expect(spec.productLinkFallbackZh).not.toMatch(/TikTok/);
    }
  });
});

describe("channelStyle", () => {
  it("maps every platform's direct message onto the same short style", () => {
    // This is what lets a new platform's DM inherit the right tone without
    // adding a branch to the message generator.
    expect(channelStyle("TikTok DM")).toBe("dm");
    expect(channelStyle("Instagram DM")).toBe("dm");
    expect(channelStyle("Facebook Messenger")).toBe("dm");
  });

  it("keeps email, WhatsApp and the platform inbox distinct", () => {
    expect(channelStyle("Email")).toBe("email");
    expect(channelStyle("WhatsApp")).toBe("whatsapp");
    expect(channelStyle("TikTok Shop Affiliate Message")).toBe("affiliate");
  });

  it("classifies short-form and direct-message channels", () => {
    expect(isDirectMessage("Instagram DM")).toBe(true);
    expect(isDirectMessage("WhatsApp")).toBe(false);
    expect(isShortFormChannel("WhatsApp")).toBe(true);
    expect(isShortFormChannel("Facebook Messenger")).toBe(true);
    expect(isShortFormChannel("Email")).toBe(false);
    expect(isShortFormChannel("TikTok Shop Affiliate Message")).toBe(false);
  });
});

describe("resolveChannelForPlatform", () => {
  it("leaves a channel the platform already supports alone", () => {
    expect(resolveChannelForPlatform("Email", "instagram")).toBe("Email");
    expect(resolveChannelForPlatform("TikTok DM", "tiktok")).toBe("TikTok DM");
  });

  it("moves a DM to the new platform's DM rather than to the first option", () => {
    expect(resolveChannelForPlatform("TikTok DM", "instagram")).toBe(
      "Instagram DM",
    );
    expect(resolveChannelForPlatform("Instagram DM", "facebook")).toBe(
      "Facebook Messenger",
    );
    expect(resolveChannelForPlatform("Facebook Messenger", "tiktok")).toBe(
      "TikTok DM",
    );
  });

  it("falls back to a usable channel when nothing matches the style", () => {
    // Instagram has no platform inbox, so the affiliate channel has to go
    // somewhere rather than staying selected and unsendable.
    const resolved = resolveChannelForPlatform(
      "TikTok Shop Affiliate Message",
      "instagram",
    );
    expect(channelsForPlatform("instagram")).toContain(resolved);
    expect(resolved).not.toBe("TikTok Shop Affiliate Message");
  });

  it("always returns something the platform actually offers", () => {
    for (const spec of PLATFORM_SPECS) {
      for (const other of PLATFORM_SPECS) {
        for (const channel of other.channels) {
          expect(spec.channels).toContain(
            resolveChannelForPlatform(channel, spec.id),
          );
        }
      }
    }
  });
});

describe("fieldsNamingOtherPlatform", () => {
  const campaign = {
    requirements: ["每位达人 2 条视频", "必须挂 TikTok Shop 产品链接"],
    tagRequirement: "必须 tag 品牌账号",
    keyContentPoints: ["展示雾化功能"],
    notes: "",
  };

  it("points at the seller's own wording when it names the wrong platform", () => {
    // The text is never rewritten — it is theirs — but an Instagram brief that
    // still says TikTok would send an impossible instruction, so it is named.
    expect(fieldsNamingOtherPlatform(campaign, "instagram")).toEqual([
      "拍摄要求",
    ]);
  });

  it("stays quiet when the wording matches the platform", () => {
    expect(fieldsNamingOtherPlatform(campaign, "tiktok")).toEqual([]);
  });

  it("checks every field a brief is built from", () => {
    expect(
      fieldsNamingOtherPlatform(
        {
          requirements: ["参考 TikTok 上那条"],
          tagRequirement: "tag 我们的 TikTok 账号",
          keyContentPoints: ["和 Facebook 那版一致"],
          notes: "TikTok 那边的对接人是 Amy",
          productLinkRequirement: "挂 TikTok Shop 链接",
        },
        "instagram",
      ),
    ).toEqual(["拍摄要求", "Tag 要求", "挂链接要求", "重点拍摄内容", "备注"]);
  });

  it("does not flag wording that names the platform it is already on", () => {
    expect(
      fieldsNamingOtherPlatform(
        {
          requirements: ["必须挂 TikTok Shop 产品链接"],
          tagRequirement: "",
          keyContentPoints: [],
          notes: "",
        },
        "tiktok",
      ),
    ).toEqual([]);
  });

  it("flags nothing on an empty campaign", () => {
    expect(
      fieldsNamingOtherPlatform(
        {
          requirements: [],
          tagRequirement: "",
          keyContentPoints: [],
          notes: "",
        },
        "instagram",
      ),
    ).toEqual([]);
  });
});
