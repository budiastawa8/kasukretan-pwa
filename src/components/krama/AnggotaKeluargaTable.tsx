import { Pencil, Trash2, LogOut } from "lucide-react";
import type { KlasifikasiKode } from "../../lib/types";
import {
  formatStatusKeluarga,
  formatStatusKeluargaAnggota,
  gelarKepalaLabel,
  statusKeluargaOptionsAnggota,
} from "../../lib/status-keluarga";
import { AnggotaPemasihStatusSelect } from "./AnggotaPemasihStatusSelect";
import { Select } from "../ui/Input";
import { Button } from "../ui/Button";
import {
  LIST_BODY_ROW,
  LIST_HEAD_ROW,
  LIST_TABLE_ELEMENT,
} from "../ui/list-compact";
import { formatStatusKawin } from "../../lib/status-kawin";
import { formatTanggalLahir } from "../../lib/utils";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";

export interface AnggotaTableRow {
  key: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  status_keluarga: string;
  status_kawin?: string | null;
  tempat_lahir?: string | null;
  tanggal_lahir?: string | null;
  pekerjaan?: string | null;
  nik_atau_nika?: string | null;
  nika?: string | null;
  nrkt?: string | null;
  nrt?: string | null;
  /** Ditandai sebagai Pengarep/Pengajeg tanpa mengubah status keluarga di kolom */
  isKepala?: boolean;
}

function nomorIdentitas(a: AnggotaTableRow) {
  return a.nika ?? a.nrkt ?? a.nrt ?? "—";
}

function StatusKeluargaCell({
  a,
  klasifikasi,
  canEdit,
  draftMode,
  usesKepalaField,
  gelarLabel,
  kramaId,
  onStatusChange,
  onRefresh,
}: {
  a: AnggotaTableRow;
  klasifikasi: KlasifikasiKode;
  canEdit?: boolean;
  draftMode?: boolean;
  usesKepalaField: boolean;
  gelarLabel: string;
  kramaId?: string;
  onStatusChange?: (key: string, status: string) => void;
  onRefresh?: () => void;
}) {
  if (canEdit && !usesKepalaField && draftMode && onStatusChange) {
    return (
      <Select
        value={formatStatusKeluarga(a.status_keluarga, klasifikasi)}
        onChange={(e) => onStatusChange(a.key, e.target.value)}
        className="min-h-10 text-sm py-2 md:min-h-7 md:py-1 md:text-xs"
      >
        {statusKeluargaOptionsAnggota(klasifikasi).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    );
  }
  if (canEdit && !usesKepalaField && kramaId && onRefresh) {
    return (
      <AnggotaPemasihStatusSelect
        kramaId={kramaId}
        anggotaId={a.key}
        status={a.status_keluarga}
        klasifikasi={klasifikasi}
        onUpdated={onRefresh}
      />
    );
  }
  return (
    <span>
      {formatStatusKeluargaAnggota(a.status_keluarga, klasifikasi)}
      {usesKepalaField && a.isKepala && (
        <span className="font-medium text-copper-600"> · {gelarLabel}</span>
      )}
    </span>
  );
}

function AnggotaActions({
  a,
  isPipil,
  onSkpAnggota,
  onEdit,
  onDelete,
  stacked,
}: {
  a: AnggotaTableRow;
  isPipil: boolean;
  onSkpAnggota?: (key: string) => void;
  onEdit?: (key: string) => void;
  onDelete?: (key: string) => void;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {onEdit && (
          <Button
            type="button"
            variant="secondary"
            icon={Pencil}
            className="h-10 justify-center text-xs"
            onClick={() => onEdit(a.key)}
          >
            Edit
          </Button>
        )}
        {onDelete && (
          <Button
            type="button"
            variant="secondary"
            icon={Trash2}
            className="h-10 justify-center text-xs text-red-700 border-red-200 hover:bg-red-50"
            onClick={() => onDelete(a.key)}
          >
            Hapus
          </Button>
        )}
        {onSkpAnggota && isPipil && !a.isKepala && (
          <Button
            type="button"
            variant="secondary"
            icon={LogOut}
            className="col-span-2 h-10 justify-center text-xs"
            onClick={() => onSkpAnggota(a.key)}
          >
            Keluar Pipil
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-0.5">
      {onSkpAnggota && isPipil && !a.isKepala && (
        <Button
          type="button"
          variant="ghost"
          icon={LogOut}
          iconOnly
          title="Keluar Pipil (intra desa)"
          aria-label="Keluar Pipil intra desa"
          onClick={() => onSkpAnggota(a.key)}
        />
      )}
      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          icon={Pencil}
          iconOnly
          title="Edit anggota"
          aria-label="Edit anggota"
          onClick={() => onEdit(a.key)}
        />
      )}
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          icon={Trash2}
          iconOnly
          title="Hapus anggota"
          aria-label="Hapus anggota"
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => onDelete(a.key)}
        />
      )}
    </div>
  );
}

export function AnggotaKeluargaTable({
  klasifikasi,
  rows,
  canEdit,
  draftMode,
  kramaId,
  onStatusChange,
  onEdit,
  onDelete,
  onSkpAnggota,
  onRefresh,
}: {
  klasifikasi: KlasifikasiKode;
  rows: AnggotaTableRow[];
  canEdit?: boolean;
  /** Ubah status lokal (form baru) */
  draftMode?: boolean;
  kramaId?: string;
  onStatusChange?: (key: string, status: string) => void;
  onEdit?: (key: string) => void;
  onDelete?: (key: string) => void;
  /** Terbitkan SKP anggota (Mipil aktif, bukan Pengarep) */
  onSkpAnggota?: (key: string) => void;
  onRefresh?: () => void;
}) {
  const isPhone = useIsPhoneClient();
  const isPipil = klasifikasi === "MIPIL";
  const isKramaTamiu = klasifikasi === "KRAMA_TAMIU";
  const isPemasih = klasifikasi === "KRAMA_TAMIU" || klasifikasi === "TAMIU";
  const usesKepalaField = isPipil || isPemasih;
  const gelarLabel = gelarKepalaLabel(klasifikasi);
  const idLabel = isPipil ? "NIKA" : isKramaTamiu ? "NRKT" : "NRT";

  const statusProps = {
    klasifikasi,
    canEdit,
    draftMode,
    usesKepalaField,
    gelarLabel,
    kramaId,
    onStatusChange,
    onRefresh,
  };

  return (
    <div className="-mx-0.5">
      {/* Kartu — tampilan klien HP (jangan andalkan md: — Chrome situs desktop) */}
      {isPhone ? (
      <ul className="space-y-2">
        {rows.map((a) => {
          const id = nomorIdentitas(a);
          const meta = [
            a.jenis_kelamin,
            formatTanggalLahir(a.tanggal_lahir),
            a.pekerjaan?.trim() || null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={a.key}
              className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug text-copper-950">
                    {a.nama_lengkap}
                    {usesKepalaField && a.isKepala ? (
                      <span className="font-medium text-copper-600"> · {gelarLabel}</span>
                    ) : null}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-copper-600">
                    {idLabel} {id}
                  </span>
                </div>
                <p className="text-xs leading-snug text-muted">{meta || "—"}</p>
                <div className="text-xs leading-snug text-copper-800">
                  <StatusKeluargaCell a={a} {...statusProps} />
                  {isPipil && formatStatusKawin(a.status_kawin) ? (
                    <span className="text-muted"> · {formatStatusKawin(a.status_kawin)}</span>
                  ) : null}
                </div>
                {!isPipil && (
                  <p className="font-mono text-[11px] text-copper-700">
                    NIK/NIKA {a.nik_atau_nika?.trim() || "—"}
                  </p>
                )}
                {!isPipil && a.tempat_lahir?.trim() ? (
                  <p className="text-[11px] text-muted">Lahir: {a.tempat_lahir.trim()}</p>
                ) : null}
              </div>
              {canEdit && (
                <div className="mt-2.5 border-t border-copper-100 pt-2">
                  <AnggotaActions
                    a={a}
                    isPipil={isPipil}
                    onSkpAnggota={onSkpAnggota}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    stacked
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      ) : (
      <div className="overflow-x-auto app-scroll-x">
        <table className={LIST_TABLE_ELEMENT}>
          <thead>
            <tr className={LIST_HEAD_ROW}>
              <th>{idLabel}</th>
              <th>Nama</th>
              {!isPipil && <th>Tempat lahir</th>}
              <th>Tanggal lahir</th>
              <th>L/P</th>
              <th>Pekerjaan</th>
              <th>Status Keluarga</th>
              {isPipil && <th>Status Perkawinan</th>}
              {!isPipil && <th>NIK/NIKA</th>}
              {canEdit && <th className="w-24">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.key} className={LIST_BODY_ROW}>
                <td className="font-mono text-[11px]">
                  {nomorIdentitas(a)}
                </td>
                <td>{a.nama_lengkap}</td>
                {!isPipil && <td>{a.tempat_lahir?.trim() || "—"}</td>}
                <td className="whitespace-nowrap">{formatTanggalLahir(a.tanggal_lahir)}</td>
                <td>{a.jenis_kelamin}</td>
                <td>{a.pekerjaan?.trim() || "—"}</td>
                <td>
                  <StatusKeluargaCell a={a} {...statusProps} />
                </td>
                {isPipil && <td>{formatStatusKawin(a.status_kawin) || "—"}</td>}
                {!isPipil && <td>{a.nik_atau_nika ?? "—"}</td>}
                {canEdit && (
                  <td>
                    <AnggotaActions
                      a={a}
                      isPipil={isPipil}
                      onSkpAnggota={onSkpAnggota}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {!rows.length && (
        <p className="py-6 text-center text-xs text-muted">
          Belum ada anggota. Tambahkan anggota dan tetapkan {gelarLabel}.
        </p>
      )}
      {canEdit && usesKepalaField && (
        <p className="mt-2 text-xs text-copper-600">
          Status keluarga diubah lewat tombol Edit anggota. {gelarLabel} dipilih di field Nama{" "}
          {gelarLabel} pada data utama.
        </p>
      )}
    </div>
  );
}
