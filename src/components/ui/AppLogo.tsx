import { cn } from "../../lib/utils";

type Props = {
  size?: number;
  className?: string;
  alt?: string;
};

export function AppLogo({ size = 96, className, alt = "Kasukretan Krama" }: Props) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={cn("object-contain drop-shadow-md", className)}
      draggable={false}
    />
  );
}
