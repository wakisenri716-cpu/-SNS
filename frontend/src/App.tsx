import { lazy, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Layout from "./components/Layout";
import RequireMunicipality from "./components/RequireMunicipality";
import RequireCompany from "./components/RequireCompany";
import RequireAuth from "./components/RequireAuth";
import RequirePoster from "./components/RequirePoster";
import FeedPage from "./pages/FeedPage";

// The feed is the landing page, so it ships in the main bundle; every other
// screen is fetched the first time it's opened (Suspense in Layout).
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterUserPage = lazy(() => import("./pages/RegisterUserPage"));
const RegisterMunicipalityPage = lazy(() => import("./pages/RegisterMunicipalityPage"));
const RegisterCompanyPage = lazy(() => import("./pages/RegisterCompanyPage"));
const MunicipalityProfilePage = lazy(() => import("./pages/MunicipalityProfilePage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const CompanyDashboardPage = lazy(() => import("./pages/CompanyDashboardPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const MyPage = lazy(() => import("./pages/MyPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const ReelAccessPage = lazy(() => import("./pages/ReelAccessPage"));
const ItineraryPage = lazy(() => import("./pages/ItineraryPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));

function App() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = `${t("brand.name")} - ${t("brand.tagline")}`;
  }, [t, i18n.language]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterUserPage />} />
        <Route path="/register-municipality" element={<RegisterMunicipalityPage />} />
        <Route path="/register-company" element={<RegisterCompanyPage />} />
        <Route path="/municipalities/:id" element={<MunicipalityProfilePage />} />
        <Route path="/reels/:id/access" element={<ReelAccessPage />} />
        <Route path="/itinerary" element={<ItineraryPage />} />
        <Route
          path="/notifications"
          element={
            <RequirePoster>
              <NotificationsPage />
            </RequirePoster>
          }
        />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route
          path="/mypage"
          element={
            <RequireAuth>
              <MyPage />
            </RequireAuth>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireMunicipality>
              <DashboardPage />
            </RequireMunicipality>
          }
        />
        <Route
          path="/company-dashboard"
          element={
            <RequireCompany>
              <CompanyDashboardPage />
            </RequireCompany>
          }
        />
        <Route
          path="/insights"
          element={
            <RequirePoster>
              <InsightsPage />
            </RequirePoster>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
