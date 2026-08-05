import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Layout from "./components/Layout";
import RequireMunicipality from "./components/RequireMunicipality";
import RequireCompany from "./components/RequireCompany";
import RequireAuth from "./components/RequireAuth";
import RequirePoster from "./components/RequirePoster";
import FeedPage from "./pages/FeedPage";
import LoginPage from "./pages/LoginPage";
import RegisterUserPage from "./pages/RegisterUserPage";
import RegisterMunicipalityPage from "./pages/RegisterMunicipalityPage";
import RegisterCompanyPage from "./pages/RegisterCompanyPage";
import MunicipalityProfilePage from "./pages/MunicipalityProfilePage";
import DashboardPage from "./pages/DashboardPage";
import CompanyDashboardPage from "./pages/CompanyDashboardPage";
import SearchPage from "./pages/SearchPage";
import MyPage from "./pages/MyPage";
import SettingsPage from "./pages/SettingsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import ContactPage from "./pages/ContactPage";
import InsightsPage from "./pages/InsightsPage";
import ReelAccessPage from "./pages/ReelAccessPage";

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
