import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import App from './App.tsx'
import { AdminPage } from './components/admin/AdminPage'

const adminPath = import.meta.env.VITE_ADMIN_PATH ?? '/admin';
const isAdmin = window.location.pathname === adminPath;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <AdminPage />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
