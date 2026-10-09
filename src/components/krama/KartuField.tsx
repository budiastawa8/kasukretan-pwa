export function KartuField({
  label,
  value,
  wrap,
  compact,
  indent,
  multiline,
}: {
  label: string;
  value?: string | null;
  wrap?: boolean;
  /** Izinkan hingga 2 baris (field panjang). */
  compact?: boolean;
  /** Geser label ke kanan (mis. Tempek/Banjar di Kartu Krama Adat). */
  indent?: boolean;
  /** Hingga 3 baris (Daerah Asal, Alamat Tinggal di Kartu Tamiu). */
  multiline?: boolean;
}) {
  const text = value?.trim() || "";
  const valueClass = [
    "kartu-field-value",
    wrap || compact ? "kartu-field-value--wrap" : "",
    multiline ? "kartu-field-value--multiline" : "",
    compact ? "kartu-field-value--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const fieldClass = [
    "kartu-field",
    indent ? "kartu-field--indent" : "",
    multiline ? "kartu-field--multiline" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={fieldClass}>
      <span className="kartu-field-label">{label}</span>
      <span className="kartu-field-colon" aria-hidden>
        :
      </span>
      <span className={valueClass}>{text || "\u00A0"}</span>
    </div>
  );
}
