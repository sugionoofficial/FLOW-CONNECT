import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader } from './components/Loader'
import Landing from './pages/Landing'

const Login = lazy(() => import('./pages/Login'))
const Tools = lazy(() => import('./pages/Tools'))
const Licenses = lazy(() => import('./pages/Licenses'))
const Admin = lazy(() => import('./pages/Admin'))
const Examples = lazy(() => import('./pages/Examples'))
const DownloadPage = lazy(() => import('./pages/Download'))
const NotFound = lazy(() => import('./pages/NotFound'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<Loader full />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/masuk" element={<Login />} />
              <Route path="/contoh" element={<Examples />} />
              <Route path="/unduh" element={<DownloadPage />} />
              <Route path="/app" element={<Navigate to="/app/lisensi" replace />} />
              <Route path="/app/tools" element={<ProtectedRoute><Tools /></ProtectedRoute>} />
              <Route path="/app/lisensi" element={<ProtectedRoute><Licenses /></ProtectedRoute>} />
              <Route path="/app/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/app/*" element={<Navigate to="/app/lisensi" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
