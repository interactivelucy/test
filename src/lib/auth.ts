export function clearAuthAndRedirect() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")

  if (window.location.pathname !== "/login") {
    window.location.href = "/login"
  }
}

export function isAuthErrorStatus(status: unknown) {
  return status === 401 || status === 403
}
