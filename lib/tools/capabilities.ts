import { AdcpCapabilities } from "../types";

export function getAdcpCapabilities(): AdcpCapabilities {
  const publisherDomain = process.env.PUBLISHER_DOMAIN || "salesagent.example.com";
  const agentName = process.env.AGENT_NAME || "Prebid Sales Agent";

  return {
    adcp: {
      major_versions: [3],
      version: "3.0",
    },
    supported_protocols: ["media_buy"],
    adcp_version: "3.0",
    portfolio: {
      description: `Advertising inventory from ${agentName}. Premium digital advertising across display, video, CTV, native, and audio formats.`,
      primary_channels: ["display", "olv", "ctv", "streaming_audio"],
      publisher_domains: [publisherDomain],
      advertising_policies:
        "We accept advertising for most categories. Prohibited categories include: illegal products or services, tobacco, firearms, adult content, and gambling (without prior approval). All creatives subject to review.",
    },
    execution: {
      media_buy: {
        model: "real_time",
      },
    },
    targeting: {
      geo: {
        countries: { supported: true },
        metros: { supported: true },
        postal_areas: { supported: false },
      },
      audience: {
        demographics: true,
        interest: true,
        custom_segments: false,
      },
    },
    features: {
      content_standards: false,
      inline_creative_management: false,
      property_list_filtering: true,
    },
  };
}
