import { Card } from "../../components/ui/Card";

type Props = {
  title: string;
  description: string;
};

export function PetugasPlaceholderPage({ title, description }: Props) {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-copper-900">{title}</h1>
      <Card>
        <p className="text-sm text-muted leading-relaxed">{description}</p>
        <p className="text-xs text-muted mt-3 border-t border-copper-100 pt-3">
          Placeholder Langkah 1 — layar ini akan diisi daftar tunggakan dan form bayar setelah API + database
          cloud siap (Langkah 2–3).
        </p>
      </Card>
    </div>
  );
}
