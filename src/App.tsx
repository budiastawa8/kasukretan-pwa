import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { canAccessPath, defaultHomePath } from "./lib/auth-roles";
import { ForceChangePasswordPage } from "./pages/ForceChangePasswordPage";
import { KramaFormGuardProvider } from "./context/KramaFormGuardContext";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { KramaMipilListPage } from "./pages/KramaMipilListPage";
import { KramaPemasihListPage } from "./pages/KramaPemasihListPage";
import { PemasihPerhatianPage } from "./pages/PemasihPerhatianPage";
import { KramaDetailPage } from "./pages/KramaDetailPage";
import { KramaNewPage, KramaPemasihNewRoute } from "./pages/KramaNewPage";
import { KramaEditPage, KramaPemasihEditRoute } from "./pages/KramaEditPage";
import { MasterPage } from "./pages/MasterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { KeuanganPage } from "./pages/KeuanganPage";
import { PaturunanPage } from "./pages/PaturunanPage";
import { DudukanPage } from "./pages/DudukanPage";
import { PengumpulanPage } from "./pages/PengumpulanPage";
import { PengumpulanRekapPage } from "./pages/PengumpulanRekapPage";
import { PetugasStrukPreviewPage } from "./pages/petugas/PetugasStrukPreviewPage";
import { PETUGAS_STRUK_PREVIEW_PATH } from "./lib/petugas-struk-preview";
import { LaporanHubPage } from "./pages/laporan/LaporanHubPage";
import { LaporanPaturunanPage } from "./pages/laporan/LaporanPaturunanPage";
import { LaporanPuniaPage } from "./pages/laporan/LaporanPuniaPage";
import { LaporanCapaianPaturunanTempekPage } from "./pages/laporan/LaporanCapaianPaturunanTempekPage";
import { LaporanDudukanPage } from "./pages/laporan/LaporanDudukanPage";
import { LaporanMipilPage } from "./pages/laporan/LaporanMipilPage";
import { LaporanPemasihPage } from "./pages/laporan/LaporanPemasihPage";
import { LaporanTunggakanPaturunanPage } from "./pages/laporan/LaporanTunggakanPaturunanPage";
import { LaporanTunggakanDudukanPage } from "./pages/laporan/LaporanTunggakanDudukanPage";
import { SuratPenagihanDudukanPage } from "./pages/laporan/SuratPenagihanDudukanPage";
import { SuratKeteranganKramaPage } from "./pages/laporan/SuratKeteranganKramaPage";
import { SuratKeteranganPindahPage } from "./pages/laporan/SuratKeteranganPindahPage";
import { SuratMautsahaAdatPage } from "./pages/laporan/SuratMautsahaAdatPage";
import { LembagaBadanPage } from "./pages/LembagaBadanPage";
import { LaporanKeringananDudukanPage } from "./pages/laporan/LaporanKeringananDudukanPage";
import { LaporanPertimbanganKeringananDudukanPage } from "./pages/laporan/LaporanPertimbanganKeringananDudukanPage";
import { LaporanBukuKasPage } from "./pages/laporan/LaporanBukuKasPage";
import { LaporanRekapPenerimaanPaturunanPage } from "./pages/laporan/LaporanRekapPenerimaanPaturunanPage";
import { LaporanRekapPenerimaanDudukanPage } from "./pages/laporan/LaporanRekapPenerimaanDudukanPage";
import { LaporanPlafonDanaDudukanPage } from "./pages/laporan/LaporanPlafonDanaDudukanPage";
import { LaporanEksekutifPage } from "./pages/laporan/LaporanEksekutifPage";
import { LaporanRekapKramaPage } from "./pages/laporan/LaporanRekapKramaPage";
import { LaporanPdfPreviewPage } from "./pages/laporan/LaporanPdfPreviewPage";
import { PipilPrintPage } from "./pages/PipilPrintPage";
import { KartuKramaPrintPage } from "./pages/KartuKramaPrintPage";
import { KartuKramaTamiuPrintPage } from "./pages/KartuKramaTamiuPrintPage";
import { KartuTamiuPrintPage } from "./pages/KartuTamiuPrintPage";
import { KramaTamiuPrintPage } from "./pages/KramaTamiuPrintPage";
import { JadwalDudukanPdfPreviewPage } from "./pages/JadwalDudukanPdfPreviewPage";
import { KartuPaturunanPdfPreviewPage } from "./pages/KartuPaturunanPdfPreviewPage";
import { ModalStackProvider } from "./context/ModalStackContext";

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/ganti-password-wajib" replace />;
  return <>{children}</>;
}

function ForcePasswordOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to={defaultHomePath(user.peran)} replace />;
  return <>{children}</>;
}

function RouteGuard() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!canAccessPath(user?.peran, pathname)) {
    return <Navigate to={defaultHomePath(user?.peran)} replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <ModalStackProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/ganti-password-wajib"
            element={
              <ForcePasswordOnly>
                <ForceChangePasswordPage />
              </ForcePasswordOnly>
            }
          />
          <Route
            path="/krama-mipil/:id/cetak"
            element={
              <Protected>
                <PipilPrintPage />
              </Protected>
            }
          />
          <Route
            path="/krama-mipil/:id/cetak-kartu"
            element={
              <Protected>
                <KartuKramaPrintPage />
              </Protected>
            }
          />
          <Route
            path="/krama-pemasih/:id/cetak"
            element={
              <Protected>
                <KramaTamiuPrintPage />
              </Protected>
            }
          />
          <Route
            path="/krama-pemasih/:id/cetak-kartu"
            element={
              <Protected>
                <KartuKramaTamiuPrintPage />
              </Protected>
            }
          />
          <Route
            path="/krama-pemasih/:id/cetak-kartu-tamiu"
            element={
              <Protected>
                <KartuTamiuPrintPage />
              </Protected>
            }
          />
          <Route
            path="/krama-pemasih/:id/cetak-jadwal-dudukan"
            element={
              <Protected>
                <JadwalDudukanPdfPreviewPage />
              </Protected>
            }
          />
          <Route
            path="/krama-mipil/:id/cetak-kartu-paturunan"
            element={
              <Protected>
                <KartuPaturunanPdfPreviewPage />
              </Protected>
            }
          />
          <Route
            path={PETUGAS_STRUK_PREVIEW_PATH}
            element={
              <Protected>
                <PetugasStrukPreviewPage />
              </Protected>
            }
          />
          <Route
            path="/laporan/pdf-preview"
            element={
              <Protected>
                <LaporanPdfPreviewPage />
              </Protected>
            }
          />
          <Route
            element={
              <Protected>
                <KramaFormGuardProvider>
                  <AppShell />
                </KramaFormGuardProvider>
              </Protected>
            }
          >
            <Route element={<RouteGuard />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/krama-mipil" element={<KramaMipilListPage />} />
            <Route path="/paturunan" element={<PaturunanPage />} />
            <Route path="/krama-mipil/baru" element={<KramaNewPage klasifikasi="MIPIL" />} />
            <Route path="/krama-mipil/:id/edit" element={<KramaEditPage klasifikasi="MIPIL" />} />
            <Route path="/krama-mipil/:id" element={<KramaDetailPage />} />
            <Route path="/krama-pemasih" element={<KramaPemasihListPage />} />
            <Route path="/dudukan" element={<DudukanPage />} />
            <Route path="/pengumpulan" element={<PengumpulanPage />} />
            <Route path="/pengumpulan/rekap" element={<PengumpulanRekapPage />} />
            <Route path="/pungut" element={<Navigate to="/pengumpulan" replace />} />
            <Route path="/pungut/rekap" element={<Navigate to="/pengumpulan/rekap" replace />} />
            <Route path="/pungut/struk" element={<Navigate to="/pengumpulan/struk" replace />} />
            <Route path="/laporan" element={<LaporanHubPage />} />
            <Route path="/laporan/eksekutif" element={<LaporanEksekutifPage />} />
            <Route path="/laporan/rekap-krama" element={<LaporanRekapKramaPage />} />
            <Route path="/laporan/buku-kas" element={<LaporanBukuKasPage />} />
            <Route
              path="/laporan/rekap-penerimaan-paturunan"
              element={<LaporanRekapPenerimaanPaturunanPage />}
            />
            <Route
              path="/laporan/rekap-penerimaan-dudukan"
              element={<LaporanRekapPenerimaanDudukanPage />}
            />
            <Route
              path="/laporan/plafon-dana-dudukan"
              element={<LaporanPlafonDanaDudukanPage />}
            />
            <Route path="/laporan/mipil" element={<LaporanMipilPage />} />
            <Route path="/laporan/pemasih" element={<LaporanPemasihPage />} />
            <Route path="/laporan/paturunan" element={<LaporanPaturunanPage />} />
            <Route path="/laporan/punia" element={<LaporanPuniaPage />} />
            <Route
              path="/laporan/capaian-paturunan-tempek"
              element={<LaporanCapaianPaturunanTempekPage />}
            />
            <Route path="/laporan/dudukan" element={<LaporanDudukanPage />} />
            <Route path="/laporan/tunggakan-paturunan" element={<LaporanTunggakanPaturunanPage />} />
            <Route path="/laporan/tunggakan-dudukan" element={<LaporanTunggakanDudukanPage />} />
            <Route path="/laporan/surat-penagihan-dudukan" element={<SuratPenagihanDudukanPage />} />
            <Route path="/laporan/surat-keterangan-krama" element={<SuratKeteranganKramaPage />} />
            <Route path="/laporan/surat-keterangan-pindah" element={<SuratKeteranganPindahPage />} />
            <Route path="/laporan/surat-mautsaha-adat" element={<SuratMautsahaAdatPage />} />
            <Route
              path="/laporan/pertimbangan-keringanan"
              element={<LaporanPertimbanganKeringananDudukanPage />}
            />
            <Route path="/laporan/keringanan-dudukan" element={<LaporanKeringananDudukanPage />} />
            <Route path="/krama-pemasih/perhatian" element={<PemasihPerhatianPage />} />
            <Route path="/krama-pemasih/:jenis/baru" element={<KramaPemasihNewRoute />} />
            <Route path="/krama-pemasih/:id/edit" element={<KramaPemasihEditRoute />} />
            <Route path="/krama-pemasih/:id" element={<KramaDetailPage />} />
            <Route path="/krama" element={<Navigate to="/krama-mipil" replace />} />
            <Route path="/krama/baru" element={<Navigate to="/krama-mipil/baru" replace />} />
            <Route path="/krama/:id" element={<KramaDetailRedirect />} />
            <Route path="/master" element={<MasterPage />} />
            <Route path="/pengaturan" element={<SettingsPage />} />
            <Route path="/keuangan" element={<KeuanganPage />} />
            <Route path="/lembaga-badan" element={<LembagaBadanPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ModalStackProvider>
    </AuthProvider>
  );
}

function KramaDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/krama-mipil/${id ?? ""}`} replace />;
}
