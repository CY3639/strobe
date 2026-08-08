import { useContext, useState, useEffect } from "react";
import styled from "styled-components";
import { AuthContext } from "../contexts/AuthContext/AuthContext";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../api";

function Rightbar() {
  const { user } = useContext(AuthContext);
  const [followings, setFollowings] = useState([]);
  const [followers, setFollowers] = useState([]);

  const COLORS = ["#0095f6", "#e1306c", "#fd5949", "#fcaf45", "#405de6"];
  const avatarColor = (u) => COLORS[(u || "").charCodeAt(0) % COLORS.length];

  useEffect(() => {
    const fetchRelationships = async () => {
      try {
        const [followingRes, followersRes] = await Promise.all([
          api.get(`/v1/users/${user.id}/following`),
          api.get(`/v1/users/${user.id}/followers`),
        ]);

        const followingData = Array.isArray(followingRes.data)
          ? followingRes.data
          : (followingRes.data?.following || []);
        const followersData = Array.isArray(followersRes.data)
          ? followersRes.data
          : (followersRes.data?.followers || []);

        setFollowings(followingData);
        setFollowers(followersData);
      } catch (err) {
      }
    };

    if (user?.id) fetchRelationships();
  }, [user?.id]);

  const handleUnfollow = async (targetId) => {
    try {
      await api.delete(`/v1/users/${targetId}/follow`);
      setFollowings((prev) => prev.filter((u) => u.id !== targetId));
      toast.success("Unfollowed");
    } catch (err) {
      toast.error("Failed to unfollow");
    }
  };

  const handleFollowBack = async (targetId) => {
    try {
      await api.post(`/v1/users/${targetId}/follow`);
      toast.success("Followed");
      const updated = await api.get(`/v1/users/${user.id}/following`);
      const data = Array.isArray(updated.data) ? updated.data : (updated.data?.following || []);
      setFollowings(data);
    } catch (err) {
      toast.error("Failed to follow");
    }
  };

  const followingIds = new Set(followings.map((u) => u.id));

  return (
    <RightbarContainer>
      <div className="rightbarWrapper">
        <span className="rightbarFollowingTitle">Following</span>
        <div className="rightbarFollowings">
          {followings.map((u) => (
            <div key={u.id} className="rightbarFollowing">
              <div className="rightbarfollowingLeft">
                <Link
                  style={{ textDecoration: "none", color: "#000000" }}
                  to={`/profile/${u.id}`}
                >
                  <div
                    className="avatar"
                    style={{ backgroundColor: avatarColor(u.username) }}
                  >
                    {(u.username || "?")[0].toUpperCase()}
                  </div>
                </Link>
                <span className="rightbarFollowingName">{u.username}</span>
              </div>
              <div className="rightbarfollowingRight">
                <span
                  className="rightbarFollowingAction"
                  onClick={() => handleUnfollow(u.id)}
                >
                  Unfollow
                </span>
              </div>
            </div>
          ))}
        </div>

        <span className="rightbarFollowingTitle followersTitle">Followers</span>
        <div className="rightbarFollowings">
          {followers.map((u) => (
            <div key={u.id} className="rightbarFollowing">
              <div className="rightbarfollowingLeft">
                <Link
                  style={{ textDecoration: "none", color: "#000000" }}
                  to={`/profile/${u.id}`}
                >
                  <div
                    className="avatar"
                    style={{ backgroundColor: avatarColor(u.username) }}
                  >
                    {(u.username || "?")[0].toUpperCase()}
                  </div>
                </Link>
                <span className="rightbarFollowingName">{u.username}</span>
              </div>
              <div className="rightbarfollowingRight">
                {!followingIds.has(u.id) && u.id !== user?.id && (
                  <span
                    className="rightbarFollowingAction"
                    onClick={() => handleFollowBack(u.id)}
                  >
                    Follow back
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </RightbarContainer>
  );
}

const RightbarContainer = styled.div`
  width: 318px;
  height: calc(100vh - 78px);
  overflow-y: auto;
  position: sticky;
  top: 72px;
  padding-left: 6px;
  scrollbar-width: thin;
  scrollbar-color: #cfd8ea transparent;

  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-track {
    background-color: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background-color: #cfd8ea;
    border-radius: 99px;
  }

  .rightbarWrapper {
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow-soft);
  }

  .rightbarFollowingTitle {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.01em;
    display: block;
    margin-bottom: 10px;
    color: #1e293b;
  }

  .rightbarFollowings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .followersTitle {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid #eef2f8;
  }

  .rightbarFollowing {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 8px;
    border-bottom: 1px solid #f3f5fa;
  }

  .rightbarfollowingLeft {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 13px;
    flex-shrink: 0;
    box-shadow: 0 4px 10px rgba(21, 48, 86, 0.2);
  }

  .rightbarFollowingName {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rightbarfollowingRight {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: 6px;
  }

  .rightbarFollowingAction {
    font-size: 14px;
    color: #0095f6;
    cursor: pointer;
    text-decoration: none;
    font-weight: 700;
    padding: 0;
    background: transparent;

    &:hover {
      color: #1877f2;
    }
  }

  @media (max-width: 780px) {
    display: none;
  }
`;

export default Rightbar;
