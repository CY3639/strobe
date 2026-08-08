import { useContext, useEffect, useState } from "react";
import styled from "styled-components";
import { AiOutlineSearch } from "react-icons/ai";
import { FiSearch } from "react-icons/fi";
import { BsPlusSquare } from "react-icons/bs";
import { AuthContext } from "../contexts/AuthContext/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import Modal from "../components/UI/Modal";
import Share from "./Share";
import Search from "./Search";
import Backdrop from "./UI/Backdrop";
import SearchBarMobile from "./SearchBarMobile";
import { toast } from "sonner";
import api, { promptForApiBaseUrl } from "../api";

const COLORS = ["#0b6fd8","#b42363","#d94841","#9a6700","#3b4cca"];
const avatarColor = u => COLORS[(u||"").charCodeAt(0) % COLORS.length];

function Topbar(props) {
  const navigate = useNavigate();
  const { user, dispatch } = useContext(AuthContext);
  const [showMenu, setShowMenu] = useState(false);
  const [showAddPost, setShowAddPost] = useState(false);
  const [showSearch, setshowSearch] = useState(false);
  const [showBarSearchMobile, setShowBarSearchMobile] = useState(false);
  const [usersSearch, setusersSearch] = useState([]);
  const [searchquery, setSearchquery] = useState("");

  const logoutHandler = () => { dispatch({ type: "LOGOUT" }); };

  const updateApiBaseUrlHandler = async () => {
    try {
      const updated = await promptForApiBaseUrl();
      if (updated) {
        toast.success("API URL updated. Reloading...");
      }
    } catch (err) {
      toast.error(err.message || "Invalid API URL");
    }
  };

  const deleteAccountHandler = async () => {
    const confirmed = window.confirm("Delete your account? This cannot be undone.");
    if (!confirmed) return;

    try {
      await api.delete(`/v1/users/${user.id}`);
      dispatch({ type: "LOGOUT" });
      toast.success("Account deleted");
      navigate("/register");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete account");
    }
  };

  const searchHandler = (e) => {
    const val = e.target.value;
    setSearchquery(val);
    setshowSearch(val.length >= 1);
  };

  const clearSearch = () => { setshowSearch(false); setSearchquery(""); setusersSearch([]); setShowBarSearchMobile(false); };

  useEffect(() => {
    if (searchquery.length < 1) { setusersSearch([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/v1/users?q=" + searchquery + "&limit=8");
        setusersSearch(res.data.users || []);
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [searchquery]);

  return (
    <>
      {showBarSearchMobile && <SearchBarMobile searchHandler={searchHandler} hidebar={clearSearch} />}
      {showSearch && <Backdrop onClose={clearSearch} />}
      {showAddPost && (
        <Modal onClose={() => setShowAddPost(false)}>
          <Share onChange={props.onChange} />
        </Modal>
      )}
      <TopbarContainer>
        <div className="TopbarLeft">
          <Link to="/" style={{ textDecoration:"none" }}>
            <span className="Logo">Strobe</span>
          </Link>
        </div>
        <div className="TopbarCenter">
          <div className="Searchbar">
            <AiOutlineSearchStyled />
            <input value={searchquery} onChange={searchHandler} type="text" className="SearchInput" placeholder="Search" />
          </div>
          {showSearch && <Search data={usersSearch} hideSearch={clearSearch} />}
        </div>
        <div className="TopbarRight">
          <div className="TopbarIcons">
            <div className="TopbarIconItem"><FiSearchStyled onClick={() => setShowBarSearchMobile(true)} /></div>
            <div className="TopbarIconItem"><BsPlusSquareStyled onClick={() => setShowAddPost(true)} /></div>
            <div className="TopbarAvatar" style={{ backgroundColor: avatarColor(user?.username) }} onClick={() => setShowMenu(!showMenu)}>
              {user?.username?.[0]?.toUpperCase() ?? "?"}
            </div>
            {showMenu && (
              <div className="TopbarMenu">
                <span className="menuItems" onClick={() => { setShowMenu(false); navigate("/profile/" + user.id); }}>Profile</span>
                <span className="menuItems" onClick={() => { setShowMenu(false); updateApiBaseUrlHandler(); }}>Set API URL</span>
                <span className="menuItems deleteItem" onClick={deleteAccountHandler}>Delete account</span>
                <span className="menuItems" onClick={logoutHandler}>Log out</span>
              </div>
            )}
          </div>
        </div>
      </TopbarContainer>
    </>
  );
}

const FiSearchStyled = styled(FiSearch)`font-size:20px; margin-right:10px; display:none; @media(max-width:655px){display:block;}`;
const BsPlusSquareStyled = styled(BsPlusSquare)`font-size:20px; margin-right:10px; cursor:pointer;`;
const AiOutlineSearchStyled = styled(AiOutlineSearch)`font-size:20px; margin-left:10px;`;

const TopbarContainer = styled.div`
  height: 66px;
  width: 100%;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
  background: #fff;
  justify-content: center;
  border-bottom: 1px solid var(--line);

  @media (max-width: 655px) {
    justify-content: space-between;
    padding: 0 10px;
  }

  .TopbarLeft {
    padding-right: 150px;
    display: flex;

    @media (max-width: 655px) {
      padding-right: 0;
    }
  }

  .Logo {
    font-size: 30px;
    padding: 0 14px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #101828;
    cursor: pointer;
    font-family: "Sora", "Manrope", sans-serif;
    text-decoration: none;
  }

  .Searchbar {
    width: 100%;
    height: 38px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    display: flex;
    align-items: center;

    @media (max-width: 655px) {
      display: none;
    }
  }

  .TopbarCenter {
    display: flex;
    width: 350px;
    justify-content: center;
    margin: 0 20px;
    z-index: 2;
    position: relative;
  }

  .SearchInput {
    border: none;
    width: 80%;
    background: var(--surface-2);
    color: #0f172a;
    font-size: 14px;
    padding-left: 8px;

    &::placeholder {
      color: #94a3b8;
    }

    &:focus {
      outline: none;
    }
  }

  .TopbarRight {
    margin-right: 10px;
    padding-left: 150px;
    display: flex;
    align-items: center;

    @media (max-width: 655px) {
      padding-left: 0;
      margin-right: 0;
    }
  }

  .TopbarIcons {
    display: flex;
    align-items: center;
    position: relative;
    gap: 8px;
  }

  .TopbarIconItem {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    color: #3b4456;
    transition: background-color 0.2s ease;

    &:hover {
      background: #f4f4f4;
    }
  }

  .TopbarAvatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
    box-shadow: none;
  }

  .TopbarMenu {
    position: absolute;
    top: 48px;
    right: 0;
    width: 160px;
    background: #fff;
    border: 1px solid #dbdbdb;
    border-radius: 12px;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    z-index: 200;
    overflow: hidden;
  }

  .menuItems {
    padding: 11px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: #1e293b;

    &:hover {
      background: #fafafa;
    }

    &:not(:last-child) {
      border-bottom: 1px solid #f1f4f9;
    }
  }

  .deleteItem {
    color: #e11d48;
  }
`;

export default Topbar;
