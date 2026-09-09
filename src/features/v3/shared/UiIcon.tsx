type IconName = "home" | "deck" | "tree" | "more" | "search" | "user";

export function UiIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "home")
    return <svg {...common}><path d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.7 9.2v10.5h12.6V9.2"/><path d="M9.5 19.7v-6.1h5v6.1"/></svg>;
  if (name === "deck")
    return <svg {...common}><rect x="4" y="5.2" width="12.8" height="14" rx="2"/><path d="m8.1 5.2 2-2h7.7A2.2 2.2 0 0 1 20 5.4v10.3l-3.2 3.5"/><path d="M7.7 9h5.5M7.7 12.3h5.5"/></svg>;
  if (name === "tree")
    return <svg {...common}><circle cx="12" cy="5" r="2.3"/><circle cx="6" cy="18.5" r="2.3"/><circle cx="18" cy="18.5" r="2.3"/><path d="M12 7.3v4.2M6 16.2v-2.4h12v2.4"/></svg>;
  if (name === "search")
    return <svg {...common}><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4 4"/></svg>;
  if (name === "user")
    return <svg {...common}><circle cx="12" cy="8" r="3.4"/><path d="M5.2 20c.7-4 3-6 6.8-6s6.1 2 6.8 6"/></svg>;
  return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>;
}
