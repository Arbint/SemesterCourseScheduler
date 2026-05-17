import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi } from '../api'

interface AuthContextValue {
  isLoggedIn: boolean
  hasUser: boolean
  username: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (username: string, password: string) => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [hasUser, setHasUser] = useState(false)
  const [username, setUsername] = useState<string | null>(null)

  const refreshAuth = async () => {
    const status = await authApi.status()
    setHasUser(status.has_user)
    setIsLoggedIn(status.logged_in)
    setUsername(status.username)
  }

  useEffect(() => { refreshAuth() }, [])

  const login = async (u: string, p: string) => {
    await authApi.login(u, p)
    await refreshAuth()
  }

  const logout = async () => {
    await authApi.logout()
    await refreshAuth()
  }

  const register = async (u: string, p: string) => {
    await authApi.register(u, p)
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, hasUser, username, login, logout, register, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
