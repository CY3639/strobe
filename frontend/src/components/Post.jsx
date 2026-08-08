import { useState, useContext } from "react";
import styled from "styled-components";
import { FiMoreVertical } from "react-icons/fi";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Link } from "react-router-dom";
import { format } from "timeago.js";
import { toast } from "sonner";
import { AuthContext } from "../contexts/AuthContext/AuthContext";
import api, { resolveApiUrl } from "../api";
import Modal from "./UI/Modal";
import Backdrop from "./UI/Backdrop";
import ShowPost from "./ShowPost";

const COLORS = ["#0095f6","#e1306c","#fd5949","#fcaf45","#405de6"];
const avatarColor = u => COLORS[(u||"").charCodeAt(0) % COLORS.length];
const resolveImg = (url) => resolveApiUrl(url);

function Post({ post, onChange, onOpenPost }) {
  const { user } = useContext(AuthContext);
  const [likes, setLikes] = useState(post.stats?.likes ?? 0);
  const [isLiked, setIsLiked] = useState(post.currentUserLiked ?? false);
  const [commentCount, setCommentCount] = useState(post.stats?.comments ?? 0);
  const [showPost, setShowPost] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const isOwner = user?.id === post.userId;
  const isModerator = user?.role === "moderator";
  const authorUsername = post.author?.username ?? "Unknown";
  const authorId = post.author?.id ?? post.userId;
  const postImages = Array.isArray(post.images) ? post.images : [];
  const imageCount = postImages.length;
  const imageUrl = resolveImg(postImages[activeImageIndex]);

  const likeHandler = async () => {
    try {
      if (isLiked) { await api.delete("/v1/posts/" + post.id + "/like"); setLikes(l => l - 1); }
      else { await api.post("/v1/posts/" + post.id + "/like"); setLikes(l => l + 1); }
      setIsLiked(!isLiked);
    } catch {}
  };

  const deleteHandler = async () => {
    try {
      await api.delete("/v1/posts/" + post.id);
      toast.success("Post deleted");
      onChange(1);
    } catch {
      toast.error("Could not delete post");
    }
    setShowMenu(false);
  };

  const hideHandler = async () => {
    try {
      await api.post(`/v1/posts/${post.id}/hide`);
      toast.success("Post hidden");
      onChange(1);
    } catch {
      toast.error("Could not hide post");
    }
    setShowMenu(false);
  };

  const goPrevImage = (e) => {
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev - 1 + imageCount) % imageCount);
  };

  const goNextImage = (e) => {
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev + 1) % imageCount);
  };

  const openPostViewer = () => {
    if (onOpenPost) {
      onOpenPost();
      return;
    }
    setShowPost(true);
  };

  return (
    <>
      {showMenu && <Backdrop onClose={() => setShowMenu(false)} />}
      {!onOpenPost && showPost && (
        <Modal onClose={() => setShowPost(false)} className="modal--post">
          <ShowPost
            post={post}
            onClose={() => setShowPost(false)}
            onPostDeleted={() => {
              setShowPost(false);
              onChange(1);
            }}
            onNewComment={() => setCommentCount((c) => c + 1)}
          />
        </Modal>
      )}
      <PostContainer>
        <div className="postTop">
          <div className="postTopLeft">
            <Link to={"/profile/" + authorId} style={{ textDecoration:"none" }}>
              <div className="postAvatar" style={{ backgroundColor: avatarColor(authorUsername) }}>{authorUsername[0]?.toUpperCase()}</div>
            </Link>
            <Link style={{ textDecoration:"none", color:"#262626" }} to={"/profile/" + authorId}>
              <span className="postUsername">{authorUsername}</span>
            </Link>
            <span className="postDate">{format(post.createdAt)}</span>
          </div>
          {(isOwner || isModerator) && (
            <div className="postTopright">
              <FiMoreVertical className="moreIcon" onClick={() => setShowMenu(!showMenu)} />
              {showMenu && (
                <div className="topRightPanelWrap">
                  {isModerator && !isOwner && <div className="topRightPanel" onClick={hideHandler}>Hide</div>}
                  {isOwner && <div className="topRightPanel" onClick={deleteHandler}>Delete</div>}
                </div>
              )}
            </div>
          )}
        </div>
        <hr className="hrh" />
        <div className="postCenter">
          {post.title && <p className="postText">{post.title}</p>}
          {imageUrl && (
            <div className="postImgWrapper">
              <img src={imageUrl} alt="" className="postImg" />

              {imageCount > 1 && (
                <>
                  <button type="button" className="imgNav prev" onClick={goPrevImage} aria-label="Previous image">
                    <MdChevronLeft />
                  </button>
                  <button type="button" className="imgNav next" onClick={goNextImage} aria-label="Next image">
                    <MdChevronRight />
                  </button>

                  <div className="imageDots" onClick={(e) => e.stopPropagation()}>
                    {postImages.map((_, idx) => (
                      <button
                        key={`${post.id}-dot-${idx}`}
                        type="button"
                        className={idx === activeImageIndex ? "dot active" : "dot"}
                        aria-label={`Go to image ${idx + 1}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIndex(idx);
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <hr className="hrh" />
        <div className="postBottom">
          <div className="postBottomLeft" onClick={openPostViewer}>
            {isLiked
              ? <AiFillHeart className="likeIcon" color="#ed4956" onClick={e => { e.stopPropagation(); likeHandler(); }} />
              : <AiOutlineHeart className="likeIcon" onClick={e => { e.stopPropagation(); likeHandler(); }} />}
            <span className="postLikeCounter">{likes} likes · {commentCount} comments</span>
          </div>
        </div>
      </PostContainer>
    </>
  );
}

const PostContainer = styled.div`
  width: 100%;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
  margin-top: 14px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-card);
  overflow: hidden;

  .postTop {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
  }

  .postTopLeft {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .postAvatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 13px;
    flex-shrink: 0;
    box-shadow: 0 5px 14px rgba(26, 71, 130, 0.2);
  }

  .postUsername {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }

  .postDate {
    font-size: 12px;
    color: #94a3b8;
  }

  .postTopright {
    position: relative;
  }

  .moreIcon {
    cursor: pointer;
    color: #64748b;
    font-size: 18px;
  }

  .topRightPanelWrap {
    position: absolute;
    right: 0;
    top: 24px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.15);
    z-index: 60;
    overflow: hidden;
  }

  .topRightPanel {
    padding: 10px 16px;
    font-size: 13px;
    color: #e11d48;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;

    &:hover {
      background: #fff1f2;
    }
  }

  .postCenter {
    display: flex;
    flex-direction: column;
  }

  .postText {
    padding: 2px 14px 12px;
    font-size: 14px;
    line-height: 1.45;
    font-weight: 500;
    color: #1f2937;
  }

  .postImgWrapper {
    position: relative;
    width: 100%;
    background: #f8f9fc;
  }

  .postImg {
    width: 100%;
    max-height: 700px;
    object-fit: cover;
    display: block;
  }

  .imgNav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: none;
    background: rgba(0, 0, 0, 0.42);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    cursor: pointer;
  }

  .imgNav.prev {
    left: 10px;
  }

  .imgNav.next {
    right: 10px;
  }

  .imageDots {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    border: none;
    background: rgba(255, 255, 255, 0.65);
    padding: 0;
    cursor: pointer;
  }

  .dot.active {
    background: #0095f6;
  }

  .hrh {
    opacity: 1;
    border: none;
    border-top: 1px solid #edf1f7;
    margin: 0;
  }

  .postBottom {
    padding: 10px 14px 12px;
  }

  .postBottomLeft {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .likeIcon {
    font-size: 25px;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .likeIcon:hover {
    transform: scale(1.07);
  }

  .postLikeCounter {
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
  }
`;

export default Post;
