import { createContext, useEffect, useReducer } from "react";

const INITIAL_STATE = {
  user: JSON.parse(localStorage.getItem("strobe_user") || "null"),
  token: localStorage.getItem("strobe_token") || null,
};

const AuthReducer = (state, action) => {
  switch (action.type) {
    case "LOGIN_SUCCESS":
      return { user: action.payload.user, token: action.payload.token };
    case "LOGOUT":
      return { user: null, token: null };
    default:
      return state;
  }
};

export const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [state, dispatch] = useReducer(AuthReducer, INITIAL_STATE);

  useEffect(() => {
    if (state.user) {
      localStorage.setItem("strobe_user", JSON.stringify(state.user));
      localStorage.setItem("strobe_token", state.token);
    } else {
      localStorage.removeItem("strobe_user");
      localStorage.removeItem("strobe_token");
    }
  }, [state.user, state.token]);

  return (
    <AuthContext.Provider value={{ user: state.user, token: state.token, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
};
