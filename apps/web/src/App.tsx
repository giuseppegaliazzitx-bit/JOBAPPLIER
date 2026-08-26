import { Route, Routes } from "react-router-dom";
import { Shell } from "./layout/Shell.tsx";
import { ApplicationsPage } from "./pages/ApplicationsPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { JobsPage } from "./pages/JobsPage.tsx";
import { MetricsPage } from "./pages/MetricsPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { QuestionsPage } from "./pages/QuestionsPage.tsx";
import { RecipesPage } from "./pages/RecipesPage.tsx";
import { RunsPage } from "./pages/RunsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/questions" element={<QuestionsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
