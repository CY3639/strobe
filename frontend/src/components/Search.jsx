import styled from "styled-components";
import { Link } from "react-router-dom";

const COLORS = ["#0b6fd8","#b42363","#d94841","#9a6700","#3b4cca"];
const avatarColor = u => COLORS[(u||"").charCodeAt(0) % COLORS.length];

function Search({ data, hideSearch }) {
  return (
    <SearchContainer>
      <div className="searchWrapper">
        {data.length === 0 && <p className="noResults">No users found</p>}
        {data.map((u) => (
          <Link key={u.id} style={{ textDecoration:"none", display:"block" }} to={"/profile/" + u.id} onClick={hideSearch}>
            <div className="user">
              <div className="searchAvatar" style={{ backgroundColor: avatarColor(u.username) }}>
                {u.username?.[0]?.toUpperCase()}
              </div>
              <span className="searchUsername">{u.username}</span>
            </div>
          </Link>
        ))}
      </div>
    </SearchContainer>
  );
}

const SearchContainer = styled.div`
  position: absolute;
  top: 42px;
  left: 0;
  width: 100%;
  z-index: 300;

  .searchWrapper {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 20px 34px rgba(15, 23, 42, 0.13);
    overflow: hidden;
    padding: 6px 0;
  }

  .noResults {
    padding: 12px 16px;
    font-size: 13px;
    color: #64748b;
  }

  .user {
    display: flex;
    align-items: center;
    min-height: 54px;
    padding: 10px 14px;
    gap: 12px;
    cursor: pointer;

    &:hover {
      background: #f8fbff;
    }
  }

  .searchAvatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    flex-shrink: 0;
    box-shadow: 0 5px 12px rgba(15, 42, 78, 0.2);
  }

  .searchUsername {
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
  }
`;

export default Search;
