import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

// The demo deployment resets its database on restart, which can leave a browser
// holding a token that's still cryptographically valid but points at a user that
// no longer exists. The backend reports that as 401. Rather than let it surface as
// a confusing "profile not found" error deep in some form submit, force the user
// back to a clean logged-out state so they see a normal login screen.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  }
);
