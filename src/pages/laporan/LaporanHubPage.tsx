import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { LAPORAN_PAGE } from "../../components/laporan/laporan-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";

import {

  AlertTriangle,

  BarChart3,

  Coins,

  FileText,

  Gift,

  HandCoins,

  LayoutDashboard,

  Scale,

  ShieldCheck,

  TableProperties,

  UserCircle,

  Users,

  Wallet,

} from "lucide-react";

import type { LucideIcon } from "lucide-react";



type LaporanItem = {

  to: string;

  icon: LucideIcon;

  title: string;

  desc: string;

};



const dataKramaItems: LaporanItem[] = [

  {

    to: "/laporan/rekap-krama",

    icon: TableProperties,

    title: "Rekap Krama",

    desc: "Matriks krama aktif per klasifikasi, jenis, dan banjar — dengan total keseluruhan.",

  },

  {

    to: "/laporan/mipil",

    icon: Users,

    title: "Laporan Krama Mipil",

    desc: "Statistik jiwa Yowana & Wredha, rekap demografi, dan daftar Pipil per banjar.",

  },

  {

    to: "/laporan/pemasih",

    icon: UserCircle,

    title: "Laporan Pemasih",

    desc: "Status masa berlaku Krama Tamiu & Tamiu — perhatian akan habis / tidak aktif.",

  },

  {

    to: "/laporan/paturunan",

    icon: Coins,

    title: "Laporan Paturunan",

    desc: "Ringkasan per iuran — tagihan, terkumpul wajib, punia, dan sisa per Krama Mipil.",

  },

  {

    to: "/laporan/punia",

    icon: Gift,

    title: "Laporan Punia",

    desc: "Krama Nyada dan krama lain yang sudah mepunia — hanya jumlah punia, tanpa tagihan.",

  },

  {

    to: "/laporan/capaian-paturunan-tempek",

    icon: BarChart3,

    title: "Capaian Paturunan per Tempek",

    desc: "Persentase dibayar & sisa tagihan wajib per tempek — plus jumlah punia.",

  },

  {

    to: "/laporan/dudukan",

    icon: HandCoins,

    title: "Laporan Dudukan",

    desc: "Ringkasan per rentang periode — tagihan, uang masuk, keringanan, dan status per pemasih.",

  },

];



const keuanganItems: LaporanItem[] = [

  {

    to: "/laporan/buku-kas",

    icon: Wallet,

    title: "Laporan Buku Kas",

    desc: "Pemasukan & pengeluaran per akun — paturunan & dudukan per tempek/banjar & petugas/hari.",

  },

  {

    to: "/laporan/rekap-penerimaan-paturunan",

    icon: Coins,

    title: "Rekap Penerimaan Paturunan",

    desc: "Total penerimaan per banjar/tempek/arahan, per bulan bayar, atau per tanggal tempek & petugas.",

  },

  {

    to: "/laporan/rekap-penerimaan-dudukan",

    icon: HandCoins,

    title: "Rekap Penerimaan Dudukan",

    desc: "Realisasi pembayaran per banjar, klasifikasi, dan jenis — per bulan bayar atau per transaksi.",

  },

  {

    to: "/laporan/plafon-dana-dudukan",

    icon: HandCoins,

    title: "Laporan Plafon Dana Dudukan",

    desc: "Pencapaian alokasi plafon pengeluaran per pos — berdasarkan penerimaan dudukan tahun kalender.",

  },

];



const tunggakanItems: LaporanItem[] = [

  {

    to: "/laporan/tunggakan-paturunan",

    icon: AlertTriangle,

    title: "Tunggakan Paturunan",

    desc: "Daftar Krama Mipil belum lunas per iuran — untuk penagihan.",

  },

  {

    to: "/laporan/tunggakan-dudukan",

    icon: AlertTriangle,

    title: "Tunggakan Dudukan",

    desc: "Pemasih dengan sisa tagihan lintas bulan — export ringkas & detail.",

  },

  {

    to: "/laporan/surat-penagihan-dudukan",

    icon: FileText,

    title: "Surat Penagihan Dudukan",

    desc: "Surat resmi untuk Krama Tamiu & Tamiu tunggakan ≥ 3 bulan — nomor SP otomatis.",

  },

];



const suratItems: LaporanItem[] = [

  {

    to: "/laporan/surat-keterangan-krama",

    icon: FileText,

    title: "Surat Keterangan Krama",

    desc: "Arsip SKK — nomor otomatis, cetak ulang dari arsip.",

  },

  {

    to: "/laporan/surat-keterangan-pindah",

    icon: FileText,

    title: "Surat Keterangan Pindah",

    desc: "Arsip SKP keluarga & anggota Mipil — cetak ulang dari arsip.",

  },

  {

    to: "/laporan/surat-mautsaha-adat",

    icon: FileText,

    title: "Surat IPMA (Mautsaha Adat)",

    desc: "Arsip ILIKITA Pemasih Mautsaha Adat — usaha Swasta Komersial di wewidangan desa adat.",

  },

];



const keringananItems: LaporanItem[] = [

  {

    to: "/laporan/pertimbangan-keringanan",

    icon: Scale,

    title: "Pertimbangan Keringanan",

    desc: "Periode cicil tanpa keputusan keringanan — untuk review sebelum diputuskan.",

  },

  {

    to: "/laporan/keringanan-dudukan",

    icon: ShieldCheck,

    title: "Audit Keringanan",

    desc: "Riwayat keputusan keringanan dudukan — petugas, alasan, dan nominal.",

  },

];



function LaporanSection({

  title,

  items,

  accent = "copper",

  isPhone = false,

}: {

  title: string;

  items: LaporanItem[];

  accent?: "copper" | "emerald" | "amber" | "sky" | "violet";

  isPhone?: boolean;

}) {

  const iconWrap = {

    copper: "bg-copper-100 text-copper-800",

    emerald: "bg-emerald-50 text-emerald-800",

    amber: "bg-amber-50 text-amber-800",

    sky: "bg-sky-50 text-sky-800",

    violet: "bg-violet-50 text-violet-800",

  }[accent];

  const cardBorder = {

    copper: "",

    emerald: "border-emerald-100/80",

    amber: "border-amber-100/80",

    sky: "border-sky-100/80",

    violet: "border-violet-100/80",

  }[accent];



  return (

    <div>

      <h3 className="text-sm font-semibold text-copper-900 mb-1.5">{title}</h3>

      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">

        {items.map(({ to, icon: Icon, title: itemTitle, desc }) => (

          <Link key={to} to={to} className="block group">

            <Card
              className={cn(
                "h-full transition-shadow group-hover:shadow-md",
                cardBorder,
                isPhone && "!p-3 min-h-[3.25rem]"
              )}
            >

              <div className={cn("flex items-start gap-2", isPhone && "gap-3 items-center")}>

                <span className={`rounded-md p-2 shrink-0 ${iconWrap}`}>

                  <Icon size={20} />

                </span>

                <div className="min-w-0">

                  <h4 className="font-semibold text-sm sm:text-base text-copper-900 group-hover:text-copper-700 leading-snug">
                    {itemTitle}
                  </h4>
                  <p className="hidden sm:block text-xs text-muted mt-0.5 leading-snug">{desc}</p>

                </div>

              </div>

            </Card>

          </Link>

        ))}

      </div>

    </div>

  );

}



export function LaporanHubPage() {
  const isPhone = useIsPhoneClient();

  return (

    <div className={cn(LAPORAN_PAGE, "w-full max-w-full", isPhone ? "space-y-4" : "space-y-5")}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold flex items-center gap-1.5">
          <BarChart3 className="text-copper-700 shrink-0" size={22} />
          Laporan
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Demografi, keuangan, tunggakan, surat, dan keringanan.
        </p>
      </div>

      <Link to="/laporan/eksekutif" className="block group">
        <Card
          className={cn(
            "transition-shadow group-hover:shadow-md border-copper-300 bg-gradient-to-r from-copper-50/80 to-white",
            isPhone && "!p-3 min-h-[3.5rem]"
          )}
        >
          <div className={cn("flex items-start gap-2", isPhone && "gap-3 items-center")}>
            <span className="rounded-md bg-copper-200 p-2 text-copper-900 shrink-0">
              <LayoutDashboard size={22} />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-copper-900 group-hover:text-copper-700">
                Ringkasan Eksekutif
              </h3>
              <p className="text-xs text-muted mt-0.5 leading-snug">
                Jumlah Krama Mipil, Krama Tamiu, dan Tamiu beserta rincian per jenis.
              </p>
            </div>
          </div>
        </Card>
      </Link>



      <LaporanSection title="Data krama & iuran" items={dataKramaItems} isPhone={isPhone} />

      <LaporanSection title="Keuangan" items={keuanganItems} accent="emerald" isPhone={isPhone} />

      <LaporanSection title="Tunggakan & penagihan" items={tunggakanItems} accent="amber" isPhone={isPhone} />

      <LaporanSection title="Surat resmi (arsip)" items={suratItems} accent="sky" isPhone={isPhone} />

      <LaporanSection title="Keringanan dudukan" items={keringananItems} accent="violet" isPhone={isPhone} />

    </div>

  );

}


