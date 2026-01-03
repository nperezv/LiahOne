import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { apiRequest } from "./queryClient";
import { getDeviceId, refreshAccessToken, setAccessToken } from "./auth-tokens";

interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl?: string | null;
  role: string;
  organizationId?: string;
  requireEmailOtp?: boolean;
  requirePasswordChange?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: { username: string; password: string; rememberDevice: boolean }) => Promise<{ requiresEmailCode?: boolean; otpId?: string; email?: string }>;
  verifyLogin: (payload: { otpId: string; code: string; rememberDevice: boolean }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          return;
        }

        const response = await fetch("/api/me", {
          credentials: "include",
          headers: { Authorization: `Bearer ${refreshed}` },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (payload: { username: string; password: string; rememberDevice: boolean }) => {
    try {
      const response = await apiRequest("POST", "/api/login", {
        username: payload.username,
        password: payload.password,
        rememberDevice: payload.rememberDevice,
        deviceId: getDeviceId(),
      });

      if (response?.requiresEmailCode) {
        return {
          requiresEmailCode: true,
          otpId: response.otpId,
          email: response.email,
        };
      }

      if (response?.accessToken) {
        setAccessToken(response.accessToken);
        const meResponse = await fetch("/api/me", {
          credentials: "include",
          headers: { Authorization: `Bearer ${response.accessToken}` },
        });
        if (meResponse.ok) {
          const userData = await meResponse.json();
          setUser(userData);
        } else if (response?.user) {
          setUser(response.user);
        }
      } else if (response?.user) {
        setUser(response.user);
      }

      return {};
    } catch (error) {
      throw new Error("Login failed");
    }
  };

  const verifyLogin = async (payload: { otpId: string; code: string; rememberDevice: boolean }) => {
    try {
      const response = await apiRequest("POST", "/api/login/verify", {
        otpId: payload.otpId,
        code: payload.code,
        rememberDevice: payload.rememberDevice,
        deviceId: getDeviceId(),
      });

      if (response?.accessToken) {
        setAccessToken(response.accessToken);
        const meResponse = await fetch("/api/me", {
          credentials: "include",
          headers: { Authorization: `Bearer ${response.accessToken}` },
        });
        if (meResponse.ok) {
          const userData = await meResponse.json();
          setUser(userData);
        } else if (response?.user) {
          setUser(response.user);
        }
      } else if (response?.user) {
        setUser(response.user);
      }
    } catch (error) {
      throw new Error("Login failed");
    }
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/logout", {});
      setAccessToken(null);
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        verifyLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
