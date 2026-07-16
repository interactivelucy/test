import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import {
  type Body_login_login_access_token as AccessToken,
  OpenAPI,
  type UserPublic,
  type UserRegister,
} from "@/client"
import { clearAuthAndRedirect, isAuthErrorStatus } from "@/lib/auth"
import { getExperimentRouteSearch } from "@/lib/experimentNavigation"
import { handleError } from "@/utils"
import useCustomToast from "./useCustomToast"

type TokenPair = {
  access_token: string
  refresh_token?: string
}

type CurrentUser = {
  id: string
  email: string
  role?: string
}

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const apiUrl = (path: string) => `${OpenAPI.BASE}${path}`

const apiError = async (response: Response) => {
  if (isAuthErrorStatus(response.status)) {
    clearAuthAndRedirect()
  }

  const body = await response.json().catch(() => ({
    detail: response.statusText || "Something went wrong.",
  }))
  return Object.assign(new Error("API request failed"), {
    body,
    status: response.status,
  })
}

const toUserPublic = (user: CurrentUser): UserPublic => ({
  id: user.id,
  email: user.email,
  full_name: null,
  is_active: true,
  is_superuser: user.role === "admin",
})

const useAuth = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()

  const { data: user } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/v1/auth/me"), {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      })

      if (!response.ok) {
        throw await apiError(response)
      }

      return toUserPublic(await response.json())
    },
    enabled: isLoggedIn(),
  })

  const signUp = async (data: UserRegister) => {
    const response = await fetch(apiUrl("/api/v1/auth/register"), {
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    })

    if (!response.ok) {
      throw await apiError(response)
    }

    return response.json() as Promise<TokenPair>
  }

  const signUpMutation = useMutation({
    mutationFn: signUp,
    onSuccess: () => {
      navigate({ to: "/login" })
    },
    onError: handleError.bind(showErrorToast),
  })

  const login = async (data: AccessToken) => {
    const formData = new URLSearchParams()
    formData.set("username", data.username)
    formData.set("password", data.password)

    const response = await fetch(apiUrl("/api/v1/auth/login"), {
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    })

    if (!response.ok) {
      throw await apiError(response)
    }

    const tokenPair = (await response.json()) as TokenPair
    localStorage.setItem("access_token", tokenPair.access_token)
    if (tokenPair.refresh_token) {
      localStorage.setItem("refresh_token", tokenPair.refresh_token)
    }
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      navigate({ search: getExperimentRouteSearch(), to: "/" })
    },
    onError: handleError.bind(showErrorToast),
  })

  const logout = () => {
    queryClient.clear()
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    navigate({ to: "/login", replace: true })
  }

  return {
    signUpMutation,
    loginMutation,
    logout,
    user,
  }
}

export { isLoggedIn }
export default useAuth
