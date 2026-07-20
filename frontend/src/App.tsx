import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireMunicipality from "./components/RequireMunicipality";
import RequireAuth from "./components/RequireAuth";
import FeedPage from "./pages/FeedPage";
import LoginPage from "./pages/LoginPage";
import RegisterUserPage from "./pages/RegisterUserPage";
import RegisterMunicipalityPage from "./pages/RegisterMunicipalityPage";
import MunicipalityProfilePage from "./pages/MunicipalityProfilePage";
import DashboardPage from "./pages/DashboardPage";
import SearchPage from "./pages/SearchPage";
import MyPage from "./pages/MyPage";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterUserPage />} />
        <Route path="/register-municipality" element={<RegisterMunicipalityPage />} />
        <Route path="/municipalities/:id" element={<MunicipalityProfilePage />} />
        <Route
          path="/mypage"
          element={
            <RequireAuth>
              <MyPage />
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
      </Route>
    </Routes>
  );
}

export default App;
