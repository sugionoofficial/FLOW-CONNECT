import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader } from './components/Loader'
import Landing from './pages/Landing'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Workspace = lazy(() => import('./pages/Workspace'))
const Tools = lazy(() => import('./pages/Tools'))
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
              <Route path="/app" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/app/tools" element={<ProtectedRoute><Tools /></ProtectedRoute>} />
              <Route path="/app/project/:id" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
