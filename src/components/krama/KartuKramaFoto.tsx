function PhotoPlaceholder() {
  return (
    <svg
      className="kartu-photo-placeholder"
      viewBox="0 0 48 64"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="4" width="32" height="20" rx="4" fill="#1a1a1a" />
      <path d="M4 58c4-14 14-22 24-22s20 8 24 22" fill="#1a1a1a" />
      <rect x="14" y="28" width="20" height="26" rx="2" fill="#fff" stroke="#1a1a1a" strokeWidth="1.2" />
      <path d="M18 32h12v4H18z" fill="#1a1a1a" />
    </svg>
  );
}

export function KartuKramaFoto({
  fotoUrl,
  nama,
}: {
  fotoUrl?: string | null;
  nama: string;
}) {
  const foto = fotoUrl?.trim();
  if (!foto || foto.startsWith("file:") || !foto.startsWith("data:image/")) {
    return <PhotoPlaceholder />;
  }

  return (
    <img
      className="kartu-photo-img"
      src={foto}
      data-foto-src={foto}
      alt={`Foto ${nama}`}
      decoding="sync"
      loading="eager"
    />
  );
}
