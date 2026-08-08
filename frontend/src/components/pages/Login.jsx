import { useContext, useState, useRef } from "react";
import styled from "styled-components";
import { AuthContext } from "../../contexts/AuthContext/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FiEye, FiEyeOff } from "react-icons/fi";
import api, { clearApiBaseUrlOverride, getApiBaseUrl, hasApiBaseUrlOverride, promptForApiBaseUrl } from "../../api";

function Login() {
  const navigate = useNavigate();

  const { dispatch } = useContext(AuthContext);
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl());
  const [apiIsOverridden, setApiIsOverridden] = useState(hasApiBaseUrlOverride());
  const [showPassword, setShowPassword] = useState(false);
  const email = useRef();
  const password = useRef();

  const changeApiUrl = async () => {
    try {
      const updated = await promptForApiBaseUrl();
      if (updated) {
        setApiBaseUrl(updated);
        setApiIsOverridden(true);
      }
    } catch (err) {
      toast.error(err.message || "Invalid API URL");
    }
  };

  const resetApiUrl = () => {
    const defaultUrl = clearApiBaseUrlOverride();
    setApiBaseUrl(defaultUrl);
    setApiIsOverridden(false);
    window.location.reload();
  };

  const HandlerLoginForm = async (e) => {
    e.preventDefault();
    const normalizedEmail = (email.current?.value || "").trim().toLowerCase();
    const passwordValue = password.current?.value || "";

    if (!normalizedEmail || !passwordValue) {
      toast.error("Email and password are required");
      return;
    }

    try {
      const res = await api.post("/v1/auth/login", {
        email: normalizedEmail,
        username: normalizedEmail,
        password: passwordValue,
      });
      const { user, token } = res.data;
      dispatch({ type: "LOGIN_SUCCESS", payload: { user, token } });
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
    }
  };
  return (
    <LoginContainer>
      <div className="loginCard">
        <span className="Logo">Strobe</span>
        <p className="tagline">Welcome back. Log in to continue sharing moments.</p>
        <form className="loginForm" onSubmit={HandlerLoginForm}>
          <input
            placeholder="Email"
            type="email"
            required
            className="loginInput"
            ref={email}
          />
          <div className="passwordField">
            <input
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              required
              minLength="6"
              className="loginInput passwordInput"
              ref={password}
            />
            <button
              type="button"
              className="passwordToggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
          <button className="loginButton">Log in</button>
        </form>
        <div className="loginFooter">
          <span>Don't have an account? </span>
          <span className="link" onClick={() => navigate("/register")}>Sign up</span>
        </div>
        <div className="apiTools">
          <span className="apiCaption">Connected API</span>
          <span className="apiLabel" title={apiBaseUrl}>{apiBaseUrl}</span>
          <span className="apiSource">{apiIsOverridden ? "Runtime override" : ".env/default"}</span>
          <button type="button" className="apiButton" onClick={changeApiUrl}>Change API URL</button>
          {apiIsOverridden && <button type="button" className="apiButton subtle" onClick={resetApiUrl}>Use .env/default</button>}
        </div>
      </div>
    </LoginContainer>
  );
}

const LoginContainer = styled.div`
  width: 100vw;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #fafafa;

  .loginCard {
    width: 360px;
    border: 1px solid #dbdbdb;
    border-radius: 3px;
    background: #fff;
    padding: 36px 40px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .Logo {
    font-family: "Dancing Script", cursive;
    font-size: 52px;
    font-weight: 700;
    color: #262626;
  }

  .tagline {
    font-size: 16px;
    font-weight: 600;
    color: #8e8e8e;
    text-align: center;
    line-height: 1.4;
    margin: 0;
  }

  .loginForm {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .loginInput {
    height: 38px;
    width: 100%;
    border: 1px solid #dbdbdb;
    border-radius: 3px;
    background: #fafafa;
    font-size: 12px;
    padding: 0 10px;

    &:focus {
      outline: none;
      border-color: #a8a8a8;
    }
  }

  .passwordField {
    position: relative;
    width: 100%;
  }

  .passwordInput {
    padding-right: 42px;
  }

  .passwordToggle {
    position: absolute;
    top: 50%;
    right: 6px;
    transform: translateY(-50%);
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;

    &:hover {
      background: #eef2f7;
      color: #334155;
    }
  }

  .loginButton {
    margin-top: 8px;
    width: 100%;
    height: 32px;
    background-color: #0095f6;
    color: white;
    border-radius: 6px;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;

    &:hover {
      background: #1877f2;
    }
  }

  .loginFooter {
    font-size: 14px;
    color: #8e8e8e;
  }

  .link {
    color: #0095f6;
    font-weight: 600;
    cursor: pointer;
    margin-left: 4px;
  }

  .apiTools {
    width: 100%;
    border: 1px solid #e6ebf2;
    background: #f8fafc;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .apiCaption {
    font-size: 11px;
    color: #64748b;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .apiLabel {
    width: 100%;
    font-size: 12px;
    color: #334155;
    font-family: "Consolas", "Courier New", monospace;
    background: #fff;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    padding: 6px 8px;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .apiSource {
    font-size: 11px;
    color: #64748b;
  }

  .apiButton {
    width: 100%;
    border: 1px solid #d0dae8;
    background: #fff;
    color: #374151;
    border-radius: 6px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;

    &:hover {
      background: #f1f5f9;
    }
  }

  .apiButton.subtle {
    border-color: transparent;
    background: transparent;
    color: #64748b;
  }

  .apiButton.subtle:hover {
    background: #eef2f7;
  }
`;

export default Login;
