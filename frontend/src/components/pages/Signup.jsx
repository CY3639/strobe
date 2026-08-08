import { useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FiEye, FiEyeOff } from "react-icons/fi";
import api, { clearApiBaseUrlOverride, getApiBaseUrl, hasApiBaseUrlOverride, promptForApiBaseUrl } from "../../api";

function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl());
  const [apiIsOverridden, setApiIsOverridden] = useState(hasApiBaseUrlOverride());
  const [showPassword, setShowPassword] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await api.post("/v1/auth/register", {
        email: normalizedEmail,
        username: normalizedEmail,
        password,
        role,
      });
      toast.success("Account created! Please log in.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.message ?? "Registration failed");
    }
  };

  return (
    <SignupContainer>
      <div className="signupCard">
        <span className="Logo">Strobe</span>
        <p className="tagline">Sign up to see photos from your friends.</p>
        <form onSubmit={handleSubmit} className="signupForm">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required className="signupInput" />
          <div className="passwordField">
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type={showPassword ? "text" : "password"} required minLength={6} className="signupInput passwordInput" />
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
          <select value={role} onChange={e => setRole(e.target.value)} className="signupInput" aria-label="Account role">
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
          </select>
          <button type="submit" className="signupButton">Sign up</button>
        </form>
        <div className="signupFooter">
          <span>Have an account? </span>
          <span className="link" onClick={() => navigate("/login")}>Log in</span>
        </div>
        <div className="apiTools">
          <span className="apiCaption">Connected API</span>
          <span className="apiLabel" title={apiBaseUrl}>{apiBaseUrl}</span>
          <span className="apiSource">{apiIsOverridden ? "Runtime override" : ".env/default"}</span>
          <button type="button" className="apiButton" onClick={changeApiUrl}>Change API URL</button>
          {apiIsOverridden && <button type="button" className="apiButton subtle" onClick={resetApiUrl}>Use .env/default</button>}
        </div>
      </div>
    </SignupContainer>
  );
}

const SignupContainer = styled.div`
  width:100vw; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#fafafa;
  .signupCard { width:360px; max-width:calc(100vw - 32px); border:1px solid #dbdbdb; border-radius:3px; background:#fff; padding:36px 40px 24px; display:flex; flex-direction:column; align-items:center; gap:14px; }
  .Logo { font-family:"Dancing Script",cursive; font-size:52px; font-weight:700; color:#262626; }
  .tagline { font-size:16px; font-weight:600; color:#8e8e8e; text-align:center; line-height:1.4; }
  .signupForm { width:100%; display:flex; flex-direction:column; gap:8px; }
  .signupInput { height:38px; width:100%; border:1px solid #dbdbdb; border-radius:3px; background:#fafafa; font-size:12px; padding:0 10px; &:focus{outline:none;border-color:#a8a8a8;} }
  .passwordField { position:relative; width:100%; }
  .passwordInput { padding-right:42px; }
  .passwordToggle { position:absolute; top:50%; right:6px; transform:translateY(-50%); width:30px; height:30px; border:none; border-radius:6px; background:transparent; color:#64748b; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; &:hover{background:#eef2f7; color:#334155;} }
  .signupButton { margin-top:8px; width:100%; height:32px; background:#0095f6; color:white; border-radius:6px; border:none; font-size:14px; font-weight:600; cursor:pointer; &:hover{background:#1877f2;} }
  .signupFooter { font-size:14px; color:#8e8e8e; }
  .link { color:#0095f6; font-weight:600; cursor:pointer; margin-left:4px; }
  .apiTools { width:100%; border:1px solid #e6ebf2; background:#f8fafc; border-radius:10px; padding:10px; display:flex; flex-direction:column; align-items:flex-start; gap:8px; box-sizing:border-box; }
  .apiCaption { font-size:11px; color:#64748b; font-weight:700; letter-spacing:0.02em; text-transform:uppercase; }
  .apiLabel { width:100%; font-size:12px; color:#334155; font-family:"Consolas","Courier New",monospace; background:#fff; border:1px solid #dbe3ef; border-radius:7px; padding:6px 8px; box-sizing:border-box; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .apiSource { font-size:11px; color:#64748b; }
  .apiButton { width:100%; border:1px solid #d0dae8; background:#fff; color:#374151; border-radius:6px; height:32px; padding:0 10px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; &:hover{background:#f1f5f9;} }
  .apiButton.subtle { border-color:transparent; background:transparent; color:#64748b; &:hover{background:#eef2f7;} }
`;

export default Signup;
