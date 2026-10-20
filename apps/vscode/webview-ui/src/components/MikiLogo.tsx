import { useExtensionImageUrl } from "./hooks/useExtensionImageUrl";

export function MikiLogo({ className }: { className?: string }) {
  const logoUrl = useExtensionImageUrl("miki-logo.png");

  if (!logoUrl) {
    return null;
  }

  return <img src={logoUrl} alt="MIKI" className={className} aria-label="MIKI" />;
}
