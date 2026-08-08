import React, { useEffect, useContext, useRef, useState, useCallback } from "react";
import styled from "styled-components";
import { useParams, useNavigate } from "react-router-dom";
import { FiHeart, FiMessageCircle, FiMoreHorizontal } from "react-icons/fi";
import { toast } from "sonner";
import Topbar from "../Topbar";
import Modal from "../UI/Modal";
import ShowPost from "../ShowPost";
import { AuthContext } from "../../contexts/AuthContext/AuthContext";
import api, { resolveApiUrl } from "../../api";

function Profile(props) {
  const navigate = useNavigate();
  const userId = useParams().userId;
  const { user: currentUser } = useContext(AuthContext);
  const [posts, setPosts] = useState([]);
  const [profileUser, setProfileUser] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedPostIndex, setSelectedPostIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [activePostActionId, setActivePostActionId] = useState(null);
  const [connectionsModalType, setConnectionsModalType] = useState(null);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connections, setConnections] = useState([]);
  const followRequestLockRef = useRef(false);

  const COLORS = ["#0095f6", "#e1306c", "#fd5949", "#fcaf45", "#405de6"];
  const avatarColor = (u) => COLORS[(u || "").charCodeAt(0) % COLORS.length];
  const resolveImg = (url) => {
    return resolveApiUrl(url);
  };

  const fetchProfile = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) {
        setLoading(true);
      }

      const userRes = await api.get(`/v1/users/${userId}`);
      const profile = userRes.data?.user || userRes.data;
      setProfileUser(profile);
      setIsFollowing(Boolean(profile?.currentUserFollows));

      const postsRes = await api.get(`/v1/posts/user/${userId}?limit=50`);
      const postsArray = Array.isArray(postsRes.data) ? postsRes.data : (postsRes.data?.posts || []);
      setPosts(postsArray);
    } catch (err) {
      if (!isRefresh) {
        toast.error("Failed to load profile");
        navigate("/");
      }
    } finally {
      if (!isRefresh) {
        setLoading(false);
      }
    }
  }, [userId, navigate]);

  useEffect(() => {
    if (userId) {
      fetchProfile();
    }
  }, [userId, fetchProfile]);

  useEffect(() => {
    if (props.rerenderFeed === 1 && userId) {
      fetchProfile(true);
      props.onChange(0);
    }
  }, [props.rerenderFeed, props, userId, fetchProfile]);

  const handleFollow = async () => {
    if (followRequestLockRef.current || isFollowPending) return;

    try {
      followRequestLockRef.current = true;
      setIsFollowPending(true);

      if (isFollowing) {
        await api.delete(`/v1/users/${userId}/follow`);
        setIsFollowing(false);
        setProfileUser((prev) => {
          if (!prev) return prev;
          const currentFollowers = prev.stats?.followers || 0;
          return {
            ...prev,
            stats: {
              ...prev.stats,
              followers: Math.max(0, currentFollowers - 1),
            },
          };
        });
      } else {
        await api.post(`/v1/users/${userId}/follow`);
        setIsFollowing(true);
        setProfileUser((prev) => {
          if (!prev) return prev;
          const currentFollowers = prev.stats?.followers || 0;
          return {
            ...prev,
            stats: {
              ...prev.stats,
              followers: currentFollowers + 1,
            },
          };
        });
      }
    } catch (err) {
      const status = err?.response?.status;

      // Keep client state in sync when request races with existing relationship state.
      if (!isFollowing && status === 409) {
        setIsFollowing(true);
        return;
      }

      if (isFollowing && status === 404) {
        setIsFollowing(false);
        return;
      }

      toast.error("Follow action failed");
    } finally {
      followRequestLockRef.current = false;
      setIsFollowPending(false);
    }
  };

  const handleDeletePost = async (postId) => {
    try {
      setDeletingPostId(postId);
      await api.delete(`/v1/posts/${postId}`);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
      setProfileUser((prev) => {
        if (!prev) return prev;
        const postCount = prev.stats?.posts || 0;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            posts: Math.max(0, postCount - 1),
          },
        };
      });
      toast.success("Post deleted");
    } catch {
      toast.error("Could not delete post");
    } finally {
      setDeletingPostId(null);
      setActivePostActionId(null);
    }
  };

  const openConnectionsModal = async (type) => {
    try {
      setConnectionsModalType(type);
      setConnectionsLoading(true);
      setConnections([]);

      const res = await api.get(`/v1/users/${userId}/${type}`);
      const payload =
        type === "followers"
          ? (res.data?.followers || [])
          : (res.data?.following || []);
      setConnections(Array.isArray(payload) ? payload : []);
    } catch {
      toast.error(`Failed to load ${type}`);
      setConnectionsModalType(null);
    } finally {
      setConnectionsLoading(false);
    }
  };

  const closeConnectionsModal = () => {
    setConnectionsModalType(null);
    setConnections([]);
  };

  if (loading) return <div>Loading...</div>;
  if (!profileUser) return <div>User not found</div>;

  const isOwnProfile = currentUser?.id === userId;

  return (
    <>
      {showPost && (
        <Modal onClose={() => setShowPost(false)} className="modal--post">
          <ShowPost
            post={posts[selectedPostIndex] || selectedPost}
            postList={posts}
            currentPostIndex={selectedPostIndex}
            onNavigatePost={(nextIndex) => setSelectedPostIndex(nextIndex)}
            onClose={() => {
              setShowPost(false);
              setSelectedPostIndex(null);
            }}
            onPostDeleted={(deletedId) => {
              setShowPost(false);
              setSelectedPostIndex(null);
              setPosts((prev) => prev.filter((post) => post.id !== deletedId));
              setProfileUser((prev) => {
                if (!prev) return prev;
                const postCount = prev.stats?.posts || 0;
                return {
                  ...prev,
                  stats: {
                    ...prev.stats,
                    posts: Math.max(0, postCount - 1),
                  },
                };
              });
            }}
            onNewComment={() => {}}
          />
        </Modal>
      )}

      {connectionsModalType && (
        <Modal onClose={closeConnectionsModal}>
          <ConnectionsModal>
            <div className="connectionsHeader">
              <h3>{connectionsModalType === "followers" ? "Followers" : "Following"}</h3>
              <button type="button" onClick={closeConnectionsModal} aria-label="Close">
                x
              </button>
            </div>

            <div className="connectionsBody">
              {connectionsLoading && <p className="connectionsState">Loading...</p>}

              {!connectionsLoading && connections.length === 0 && (
                <p className="connectionsState">No users to show</p>
              )}

              {!connectionsLoading && connections.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="connectionItem"
                  onClick={() => {
                    closeConnectionsModal();
                    navigate(`/profile/${person.id}`);
                  }}
                >
                  <div
                    className="connectionAvatar"
                    style={{ backgroundColor: avatarColor(person.username) }}
                  >
                    {(person.username || "?")[0].toUpperCase()}
                  </div>
                  <div className="connectionMeta">
                    <span className="connectionUsername">{person.username}</span>
                    {person.email && <span className="connectionEmail">{person.email}</span>}
                  </div>
                </button>
              ))}
            </div>
          </ConnectionsModal>
        </Modal>
      )}

      <Topbar onChange={props.onChange} />
      <ProfileContainer>
        <div className="profileHeader">
          <div className="profilePicture">
            <div
              className="avatar"
              style={{ backgroundColor: avatarColor(profileUser.username) }}
            >
              {(profileUser.username || "?")[0].toUpperCase()}
            </div>
          </div>
          <div className="profileInfo">
            <div className="profileTop">
              <h2>{profileUser.username}</h2>
              {!isOwnProfile && (
                <button
                  className="followButton"
                  onClick={handleFollow}
                  disabled={isFollowPending}
                >
                  {isFollowing ? "Unfollow" : "Follow"}
                </button>
              )}
            </div>
            <p className="email">{profileUser.email}</p>
            <div className="stats">
              <div className="stat">
                <span className="statNumber">
                  {profileUser.stats?.posts || 0}
                </span>
                <span className="statLabel">Posts</span>
              </div>
              <div className="stat">
                <span className="statNumber">
                  {profileUser.stats?.followers || 0}
                </span>
                <button
                  type="button"
                  className="statLabel statAction"
                  onClick={() => openConnectionsModal("followers")}
                >
                  Followers
                </button>
              </div>
              <div className="stat">
                <span className="statNumber">
                  {profileUser.stats?.following || 0}
                </span>
                <button
                  type="button"
                  className="statLabel statAction"
                  onClick={() => openConnectionsModal("following")}
                >
                  Following
                </button>
              </div>
            </div>
          </div>
        </div>

        <hr className="divider" />

        <div className="postsGrid">
          {posts.length === 0 ? (
            <p className="noPosts">No posts yet</p>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className="postThumbnail"
                onClick={() => {
                  const index = posts.findIndex((p) => p.id === post.id);
                  setSelectedPost(post);
                  setSelectedPostIndex(index >= 0 ? index : null);
                  setShowPost(true);
                }}
              >
                  {isOwnProfile && (
                    <div className="postActionWrap">
                      <button
                        type="button"
                        className="postMenuButton"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePostActionId(post.id);
                        }}
                      >
                        <FiMoreHorizontal />
                      </button>
                    </div>
                  )}
                {post.images && post.images[0] && (
                  <img
                    src={resolveImg(post.images[0])}
                    alt={post.title}
                    className="postImage"
                  />
                )}
                <div className="postOverlay">
                  <div className="overlayStat">
                    <FiHeart />
                    <span>{post.stats?.likes || 0}</span>
                  </div>
                  <div className="overlayStat">
                    <FiMessageCircle />
                    <span>{post.stats?.comments || 0}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {activePostActionId && (
          <div className="actionSheetBackdrop" onClick={() => setActivePostActionId(null)}>
            <div className="actionSheet" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="sheetNeutral"
                onClick={() => {
                  const clickedPost = posts.find((p) => p.id === activePostActionId);
                  if (clickedPost) {
                    const index = posts.findIndex((p) => p.id === clickedPost.id);
                    setSelectedPost(clickedPost);
                    setSelectedPostIndex(index >= 0 ? index : null);
                    setShowPost(true);
                  }
                  setActivePostActionId(null);
                }}
              >
                Open Post
              </button>
              <button
                type="button"
                className="sheetDanger"
                disabled={deletingPostId === activePostActionId}
                onClick={() => handleDeletePost(activePostActionId)}
              >
                {deletingPostId === activePostActionId ? "Deleting..." : "Delete Post"}
              </button>
              <button
                type="button"
                className="sheetCancel"
                onClick={() => setActivePostActionId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </ProfileContainer>
    </>
  );
}

const ProfileContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 20px;

  .profileHeader {
    display: flex;
    gap: 50px;
    padding: 20px;
    border-bottom: 1px solid #e5e5e5;

    @media (max-width: 655px) {
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
  }

  .profilePicture {
    display: flex;
    justify-content: center;
  }

  .avatar {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 48px;

    @media (max-width: 655px) {
      width: 100px;
      height: 100px;
      font-size: 32px;
    }
  }

  .profileInfo {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .profileTop {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 10px;

    h2 {
      margin: 0;
      font-size: 28px;
    }
  }

  .followButton {
    padding: 8px 25px;
    background-color: #0095f6;
    color: white;
    border: none;
    border-radius: 5px;
    font-weight: 500;
    cursor: pointer;

    &:hover {
      background-color: #0080d0;
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }

  .email {
    color: #65676b;
    margin: 5px 0;
  }

  .stats {
    display: flex;
    gap: 40px;
    margin-top: 10px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .statNumber {
    font-weight: bold;
    font-size: 18px;
  }

  .statLabel {
    border: none;
    background: transparent;
    color: #65676b;
    font-size: 14px;
  }

  .statAction {
    cursor: pointer;
    padding: 0;
  }

  .statAction:hover {
    color: #262626;
    text-decoration: underline;
  }

  .divider {
    border: none;
    border-top: 1px solid #e5e5e5;
    margin: 20px 0;
  }

  .postsGrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 20px;

    @media (max-width: 780px) {
      grid-template-columns: repeat(2, 1fr);
      gap: 3px;
    }

    @media (max-width: 480px) {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  .postThumbnail {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 0;
    cursor: pointer;
    background-color: #f4f4f4;
  }

  .postActionWrap {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 3;
  }

  .postMenuButton {
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 999px;
    background: rgba(20, 20, 20, 0.55);
    color: #fff;
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    cursor: pointer;
    z-index: 2;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .postThumbnail:hover .postMenuButton {
    opacity: 1;
    transform: translateY(0);
  }

  .postMenuButton:hover {
    background: rgba(20, 20, 20, 0.72);
  }

  .postImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.28s ease;
  }

  .postThumbnail:hover .postImage {
    transform: scale(1.03);
  }

  .postOverlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.34);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 26px;
    color: white;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.2px;
    opacity: 0;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 1;
    }
  }

  .postThumbnail:hover .postOverlay {
    opacity: 1;
  }

  .overlayStat {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .overlayStat svg {
    font-size: 18px;
    stroke-width: 2.2;
  }

  .noPosts {
    grid-column: 1 / -1;
    text-align: center;
    color: #65676b;
    padding: 40px;
  }

  .actionSheetBackdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.52);
    z-index: 200;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }

  .actionSheet {
    width: min(420px, 100%);
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    border: 1px solid #ededed;
  }

  .actionSheet button {
    border: none;
    background: #fff;
    padding: 14px 12px;
    font-size: 15px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }

  .actionSheet button:last-child {
    border-bottom: none;
  }

  .sheetNeutral {
    font-weight: 600;
    color: #262626;
  }

  .sheetDanger {
    color: #ed4956;
    font-weight: 700;
  }

  .sheetDanger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sheetCancel {
    font-weight: 600;
    color: #262626;
  }

  @media (max-width: 780px) {
    .postMenuButton {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const ConnectionsModal = styled.div`
  width: 100%;
  max-width: 100%;
  max-height: 70vh;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #ececec;
  display: flex;
  flex-direction: column;

  .connectionsHeader {
    height: 52px;
    border-bottom: 1px solid #efefef;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
  }

  .connectionsHeader h3 {
    margin: 0;
    font-size: 16px;
    color: #262626;
  }

  .connectionsHeader button {
    border: none;
    background: transparent;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    font-size: 18px;
    cursor: pointer;
    color: #6b7280;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .connectionsHeader button:hover {
    background: #f4f4f4;
    color: #374151;
  }

  .connectionsBody {
    overflow-y: auto;
    padding: 6px;
  }

  .connectionsState {
    text-align: center;
    color: #6b7280;
    font-size: 14px;
    margin: 22px 0;
  }

  .connectionItem {
    width: 100%;
    border: none;
    background: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
  }

  .connectionItem:hover {
    background: #f7f7f7;
  }

  .connectionAvatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .connectionMeta {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .connectionUsername {
    font-size: 14px;
    font-weight: 700;
    color: #262626;
  }

  .connectionEmail {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }
`;

export default Profile;
