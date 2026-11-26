import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader } from './components/Loader'
import Landing from './pages/Landing'

const Login = lazy(() => import('./pages/Login'))
const Hub = lazy(() => import('./pages/Hub'))
const Tools = lazy(() => import('./pages/Tools'))
const Studio = lazy(() => import('./pages/Studio'))
const Licenses = lazy(() => import('./pages/Licenses'))
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
              <Route path="/app" element={<ProtectedRoute><Hub /></ProtectedRoute>} />
              <Route path="/app/studio" element={<ProtectedRoute><Studio /></ProtectedRoute>} />
              <Route path="/app/tools" element={<ProtectedRoute><Tools /></ProtectedRoute>} />
              <Route path="/app/lisensi" element={<ProtectedRoute><Licenses /></ProtectedRoute>} />
              <Route path="/app/*" element={<Navigate to="/app" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
