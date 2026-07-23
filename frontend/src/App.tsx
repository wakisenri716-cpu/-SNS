import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireMunicipality from "./components/RequireMunicipality";
import RequireCompany from "./components/RequireCompany";
import RequireAuth from "./components/RequireAuth";
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

function App() {
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
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route
          path="/mypage"
          element={
            <RequireAuth>
              <MyPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
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
      </Route>
    </Routes>
  );
}

export default App;
