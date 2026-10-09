import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { useOnlineModuleEnabled } from "../../lib/online-module";
import { CollapsibleSettingsSection } from "./CollapsibleSettingsSection";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Bagian lipat untuk fitur online — hanya tampil jika modul online diaktifkan. */
export function OnlineModuleSection({ children, className }: Props) {
  const onlineEnabled = useOnlineModuleEnabled();
  if (!onlineEnabled) return null;

  return (
    <CollapsibleSettingsSection
      title="Modul online (opsional)"
      subtitle="Petugas lapangan & portal krama"
      icon={Globe}
      className={className}
    >
      {children}
    </CollapsibleSettingsSection>
  );
}
