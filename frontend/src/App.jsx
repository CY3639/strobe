import Home from "./components/pages/Home";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/pages/Login";
import Signup from "./components/pages/Signup";
import Profile from "./components/pages/Profile";
import { useContext, useState, useCallback } from "react";
import { AuthContext } from "./contexts/AuthContext/AuthContext";
import { Toaster } from "sonner";

function App() {
  const { user } = useContext(AuthContext);
  const [rerenderFeed, setRerenderFeed] = useState(0);
  const handleChange = useCallback((val) => { setRerenderFeed(val); }, []);

  return (
    <>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={user ? <Home rerenderFeed={rerenderFeed} onChange={handleChange} /> : <Navigate to="/login" />} />
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Signup />} />
          <Route path="/profile/:userId" element={user ? <Profile rerenderFeed={rerenderFeed} onChange={handleChange} /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
