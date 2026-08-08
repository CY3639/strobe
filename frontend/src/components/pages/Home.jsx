import Topbar from "../Topbar";
import Feed from "../Feed";
import Rightbar from "../Rightbar";
import Moments from "../Moments";
import styled from "styled-components";

function Home({ rerenderFeed, onChange }) {
  return (
    <>
      <Topbar onChange={onChange} />
      <HomeContainer>
        <div className="feedColumn">
          <Moments />
          <Feed rerenderFeed={rerenderFeed} onChange={onChange} />
        </div>
        <Rightbar />
      </HomeContainer>
    </>
  );
}

const HomeContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 26px 20px 18px;
  gap: 28px;
  max-width: 1140px;
  margin: 0 auto;

  .feedColumn {
    flex: 1;
    min-width: 0;
    max-width: 640px;
  }

  @media (max-width: 780px) {
    gap: 0;
    padding: 14px 10px;

    .feedColumn {
      max-width: 100%;
    }
  }
`;

export default Home;
