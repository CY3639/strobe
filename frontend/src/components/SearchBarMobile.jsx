import styled from "styled-components";
import { AiOutlineSearch } from "react-icons/ai";

function SearchBarMobile({ searchHandler, hidebar }) {
  return (
    <MobileSearchContainer>
      <div className="bar">
        <AiOutlineSearch size={20} color="#8e8e8e" />
        <input autoFocus onChange={searchHandler} type="text" className="input" placeholder="Search users" />
        <span className="cancel" onClick={hidebar}>Cancel</span>
      </div>
    </MobileSearchContainer>
  );
}

const MobileSearchContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 66px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
  z-index: 200;
  display: flex;
  align-items: center;
  padding: 0 12px;

  .bar {
    display: flex;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    flex: 1;
    padding: 8px 10px;
    gap: 7px;
  }

  .input {
    border: none;
    background: transparent;
    flex: 1;
    font-size: 14px;

    &:focus {
      outline: none;
    }
  }

  .cancel {
    margin-left: 10px;
    font-size: 13px;
    color: #0b84ff;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
`;

export default SearchBarMobile;
