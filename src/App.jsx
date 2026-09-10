import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import PTECTracker from './pages/PTECTracker';
import FirstYearPTRC from './pages/FirstYearPTRC';
import FromYear2PTRC from './pages/FromYear2PTRC';
import ClientDetail from './pages/ClientDetail';
import EmployeeUpload from './pages/EmployeeUpload';
import MasterSheet from './pages/MasterSheet';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
                    <Route path="/employees/upload" element={<ProtectedRoute><EmployeeUpload /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
                    <Route path="/master-sheet" element={<ProtectedRoute><MasterSheet /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/onboard" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/ptec" element={<ProtectedRoute><PTECTracker /></ProtectedRoute>} />
          <Route path="/ptrc/first-year" element={<ProtectedRoute><FirstYearPTRC /></ProtectedRoute>} />
          <Route path="/ptrc/from-year-2" element={<ProtectedRoute><FromYear2PTRC /></ProtectedRoute>} />
          <Route path="/client/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;