import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ember Habits",
    short_name: "Ember",
    description: "A focused daily habit tracker.",
    start_url: "/habits",
    display: "standalone",
    background_color: "#050606",
    theme_color: "#050606",
  };
}
