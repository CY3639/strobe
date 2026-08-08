import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { FiMoreHorizontal, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { AuthContext } from "../contexts/AuthContext/AuthContext";
import api, { resolveApiUrl } from "../api";

function ShowPost(props) {
  const { user } = useContext(AuthContext);
  const [yourComment, setYourComment] = useState("");
  const [comments, setComments] = useState([]);
  const [postDetails, setPostDetails] = useState(props.post);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [isDeletingPost, setIsDeletingPost] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const menuRef = useRef(null);

  const normalizeComments = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.comments)) return payload.comments;
    return [];
  };

  const normalizeComment = (payload) => {
    if (!payload) return null;
    if (payload.comment) return payload.comment;
    return payload;
  };

  const resolveImg = (url) => {
    return resolveApiUrl(url);
  };

  const postList = Array.isArray(props.postList) ? props.postList : [];
  const hasPostNavigation =
    typeof props.currentPostIndex === "number" &&
    props.currentPostIndex >= 0 &&
    postList.length > 1 &&
    typeof props.onNavigatePost === "function";

  const goPrevPost = useCallback(() => {
    if (!hasPostNavigation) return;
    const next = props.currentPostIndex === 0 ? postList.length - 1 : props.currentPostIndex - 1;
    props.onNavigatePost(next);
  }, [hasPostNavigation, postList.length, props]);

  const goNextPost = useCallback(() => {
    if (!hasPostNavigation) return;
    const next = props.currentPostIndex === postList.length - 1 ? 0 : props.currentPostIndex + 1;
    props.onNavigatePost(next);
  }, [hasPostNavigation, postList.length, props]);

  useEffect(() => {
    const fetchPostAndComments = async () => {
      if (!props.post?.id) return;
      try {
        const [postRes, commentsRes] = await Promise.all([
          api.get(`/v1/posts/${props.post.id}`),
          api.get(`/v1/posts/${props.post.id}/comments`),
        ]);
        setPostDetails(postRes.data?.post || props.post);
        setComments(normalizeComments(commentsRes.data));
      } catch {
        setPostDetails(props.post);
        setComments([]);
      }
    };

    fetchPostAndComments();
  }, [props.post]);

  useEffect(() => {
    setActiveImageIndex(0);
    setMenuOpen(false);
    setIsEditingPost(false);
    setDraftTitle(postDetails?.title || "");
  }, [postDetails?.id, postDetails?.title]);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (!menuOpen) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  const postImages = useMemo(() => (Array.isArray(postDetails?.images) ? postDetails.images : []), [postDetails?.images]);
  const imageCount = postImages.length;
  const activeImage = postImages[activeImageIndex] || null;
  const isOwner = user?.id === postDetails?.userId;

  const goPrevImage = useCallback(() => {
    if (imageCount < 2) return;
    setActiveImageIndex((prev) => (prev - 1 + imageCount) % imageCount);
  }, [imageCount]);

  const goNextImage = useCallback(() => {
    if (imageCount < 2) return;
    setActiveImageIndex((prev) => (prev + 1) % imageCount);
  }, [imageCount]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft") goPrevImage();
      if (e.key === "ArrowRight") goNextImage();
      if (e.key === "ArrowUp") goPrevPost();
      if (e.key === "ArrowDown") goNextPost();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goPrevImage, goNextImage, goPrevPost, goNextPost]);

  const handleTouchStart = (e) => {
    const x = e.touches?.[0]?.clientX;
    if (typeof x === "number") {
      setTouchStartX(x);
    }
  };

  const handleTouchEnd = (e) => {
    if (touchStartX === null) return;
    const endX = e.changedTouches?.[0]?.clientX;
    if (typeof endX !== "number") return;

    const delta = endX - touchStartX;
    const threshold = 45;
    if (delta > threshold) {
      goPrevImage();
    } else if (delta < -threshold) {
      goNextImage();
    }
    setTouchStartX(null);
  };

  const submitHandler = async (e) => {
    e.preventDefault();
    if (!yourComment.trim()) return;

    try {
      const res = await api.post(`/v1/posts/${postDetails.id}/comments`, {
        text: yourComment.trim(),
      });
      const createdComment = normalizeComment(res.data);
      if (createdComment) {
        setComments((prev) => [createdComment, ...prev]);
      }
      setYourComment("");
      props.onNewComment?.();
      toast.success("Comment added");
    } catch {
      toast.error("Failed to add comment");
    }
  };

  const savePostEdits = async () => {
    if (!isOwner || isSavingPost) return;

    try {
      setIsSavingPost(true);
      const res = await api.put(`/v1/posts/${postDetails.id}`, {
        title: draftTitle.trim(),
      });
      const updatedPost = res.data?.post || { ...postDetails, title: draftTitle.trim() };
      setPostDetails(updatedPost);
      setIsEditingPost(false);
      setMenuOpen(false);
      toast.success("Post updated");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update post");
    } finally {
      setIsSavingPost(false);
    }
  };

  const handleDeletePost = async () => {
    if (!isOwner || isDeletingPost) return;
    const confirmed = window.confirm("Delete this post?");
    if (!confirmed) return;

    try {
      setIsDeletingPost(true);
      await api.delete(`/v1/posts/${postDetails.id}`);
      toast.success("Post deleted");
      props.onPostDeleted?.(postDetails.id);
      props.onClose?.();
    } catch {
      toast.error("Failed to delete post");
    } finally {
      setIsDeletingPost(false);
      setMenuOpen(false);
    }
  };

  const deleteComment = async (commentId) => {
    try {
      await api.delete(`/v1/posts/${postDetails.id}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success("Comment deleted");
    } catch {
      toast.error("Failed to delete comment");
    }
  };

  const COLORS = ["#0095f6", "#e1306c", "#fd5949", "#fcaf45", "#405de6"];
  const avatarColor = (u) => COLORS[(u || "").charCodeAt(0) % COLORS.length];
  const authorName = postDetails?.author?.username || "unknown";
  const createdLabel = postDetails?.createdAt
    ? new Date(postDetails.createdAt).toLocaleDateString()
    : "";

  return (
    <ShowPostContainer>
      {hasPostNavigation && (
        <>
          <button type="button" className="postSwitch left" onClick={goPrevPost} aria-label="Previous post">
            <MdChevronLeft />
          </button>
          <button type="button" className="postSwitch right" onClick={goNextPost} aria-label="Next post">
            <MdChevronRight />
          </button>
        </>
      )}

      <div className="mediaPanel" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {activeImage ? (
          <img src={resolveImg(activeImage)} alt={postDetails?.title || "Post"} className="mainImage" />
        ) : (
          <div className="noImage">No image available</div>
        )}

        {imageCount > 1 && (
          <>
            <button type="button" className="imgNav prev" onClick={goPrevImage} aria-label="Previous image">
              <MdChevronLeft />
            </button>
            <button type="button" className="imgNav next" onClick={goNextImage} aria-label="Next image">
              <MdChevronRight />
            </button>
            <span className="counter">{activeImageIndex + 1}/{imageCount}</span>
            <div className="dotsRow">
              {postImages.map((_, idx) => (
                <button
                  key={`post-dot-${idx}`}
                  type="button"
                  className={idx === activeImageIndex ? "dot active" : "dot"}
                  onClick={() => setActiveImageIndex(idx)}
                  aria-label={`Go to image ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="sidePanel">
        <div className="sideHeader">
          <div className="authorBlock">
            <div className="avatar" style={{ backgroundColor: avatarColor(authorName) }}>
              {(authorName || "?")[0].toUpperCase()}
            </div>
            <div className="authorMeta">
              <span className="author">{authorName}</span>
              <span className="createdAt">{createdLabel}</span>
            </div>
          </div>

          <div className="headerRight">
            <button type="button" className="closeBtn" onClick={props.onClose} aria-label="Close post viewer">
              <FiX />
            </button>

            {isOwner && (
              <div className="menuWrap" ref={menuRef}>
                <button
                  type="button"
                  className="menuTrigger"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-label="Post actions"
                >
                  <FiMoreHorizontal />
                </button>
                {menuOpen && (
                  <div className="menuList">
                    <button
                      type="button"
                      className="menuItem"
                      onClick={() => {
                        setIsEditingPost(true);
                        setDraftTitle(postDetails?.title || "");
                        setMenuOpen(false);
                      }}
                    >
                      Edit caption
                    </button>
                    <button type="button" className="menuItem danger" onClick={handleDeletePost}>
                      {isDeletingPost ? "Deleting..." : "Delete post"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="captionSection">
          {isEditingPost ? (
            <div className="captionEditor">
              <textarea
                className="captionInput"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={500}
                placeholder="Write a caption"
              />
              <div className="captionActions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setDraftTitle(postDetails?.title || "");
                    setIsEditingPost(false);
                  }}
                  disabled={isSavingPost}
                >
                  Cancel
                </button>
                <button type="button" className="primary" onClick={savePostEdits} disabled={isSavingPost || !draftTitle.trim()}>
                  {isSavingPost ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p className={postDetails?.title ? "caption" : "caption empty"}>
              {postDetails?.title ? (
                <>
                  <span className="captionAuthor">{authorName}</span> {postDetails.title}
                </>
              ) : (
                "No caption"
              )}
            </p>
          )}
        </div>

        <div className="commentsPanel">
          {comments.length === 0 ? (
            <p className="emptyComments">No comments yet</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="commentItem">
                <div className="avatar small" style={{ backgroundColor: avatarColor(comment.author?.username) }}>
                  {(comment.author?.username || "?")[0].toUpperCase()}
                </div>
                <div className="commentBody">
                  <p className="commentLine">
                    <span className="commentAuthor">{comment.author?.username}</span>{" "}
                    <span className="commentText">{comment.text}</span>
                  </p>
                  {comment.author?.id === user?.id && (
                    <button type="button" className="deleteComment" onClick={() => deleteComment(comment.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <form className="composer" onSubmit={submitHandler}>
          <input
            className="composerInput"
            placeholder="Add a comment..."
            type="text"
            value={yourComment}
            onChange={(e) => setYourComment(e.target.value)}
          />
          <button className="composerButton" type="submit" disabled={!yourComment.trim()}>
            Post
          </button>
        </form>
      </div>
    </ShowPostContainer>
  );
}

const ShowPostContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 392px;
  background: #fff;

  .postSwitch {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    border-radius: 999px;
    width: 36px;
    height: 36px;
    padding: 0;
    background: rgba(17, 17, 17, 0.62);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 20;
    font-size: 22px;
  }

  .postSwitch.left {
    left: -52px;
  }

  .postSwitch.right {
    right: -52px;
  }

  .postSwitch:hover {
    background: rgba(17, 17, 17, 0.82);
  }

  .mediaPanel {
    position: relative;
    background: #111;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .mainImage {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .noImage {
    color: #f2f2f2;
    font-size: 14px;
  }

  .imgNav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: none;
    background: rgba(0, 0, 0, 0.44);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
  }

  .imgNav.prev {
    left: 12px;
  }

  .imgNav.next {
    right: 12px;
  }

  .counter {
    position: absolute;
    right: 14px;
    top: 14px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.58);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 9px;
  }

  .dotsRow {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    display: flex;
    gap: 7px;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 999px;
    padding: 5px 8px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.88);
    background: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    padding: 0;
  }

  .dot.active {
    background: #0095f6;
    border-color: #0095f6;
  }

  .sidePanel {
    border-left: 1px solid #dbdbdb;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sideHeader {
    min-height: 58px;
    border-bottom: 1px solid #efefef;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .authorBlock {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 700;
    font-size: 12px;
    flex-shrink: 0;
  }

  .avatar.small {
    width: 28px;
    height: 28px;
    font-size: 11px;
  }

  .authorMeta {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .author {
    font-size: 13px;
    font-weight: 700;
    color: #262626;
  }

  .createdAt {
    font-size: 11px;
    color: #8e8e8e;
  }

  .headerRight {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .closeBtn {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid #e6e6e6;
    background: #fff;
    color: #262626;
    cursor: pointer;
    font-size: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .closeBtn:hover {
    background: #f7f7f7;
  }

  .menuWrap {
    position: relative;
  }

  .menuTrigger {
    border: none;
    background: transparent;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #262626;
    font-size: 18px;
  }

  .menuTrigger:hover {
    background: #f5f5f5;
  }

  .menuList {
    position: absolute;
    right: 0;
    top: 36px;
    min-width: 140px;
    background: #fff;
    border: 1px solid #dbdbdb;
    border-radius: 10px;
    overflow: hidden;
    z-index: 12;
  }

  .menuItem {
    width: 100%;
    border: none;
    background: #fff;
    text-align: left;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #262626;
    cursor: pointer;
  }

  .menuItem:hover {
    background: #fafafa;
  }

  .menuItem.danger {
    color: #d93025;
  }

  .captionSection {
    border-bottom: 1px solid #efefef;
    padding: 10px 12px;
  }

  .caption {
    margin: 0;
    font-size: 13px;
    color: #262626;
    line-height: 1.35;
    word-break: break-word;
  }

  .captionAuthor {
    font-weight: 700;
  }

  .caption.empty {
    color: #8e8e8e;
    font-style: italic;
  }

  .captionEditor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .captionInput {
    width: 100%;
    min-height: 74px;
    resize: vertical;
    border: 1px solid #dbdbdb;
    border-radius: 10px;
    padding: 9px 10px;
    font-size: 14px;
    font-family: inherit;
  }

  .captionInput:focus {
    outline: none;
    border-color: #9fb0cd;
  }

  .captionActions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .ghost,
  .primary {
    border-radius: 9px;
    padding: 7px 11px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .ghost {
    border: 1px solid #d7dbe2;
    background: #fff;
    color: #2f3b52;
  }

  .primary {
    border: 1px solid #0095f6;
    background: #0095f6;
    color: #fff;
  }

  .ghost:disabled,
  .primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .commentsPanel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px;
    scrollbar-width: thin;
  }

  .commentsPanel::-webkit-scrollbar {
    width: 6px;
  }

  .commentsPanel::-webkit-scrollbar-thumb {
    background: #d9d9d9;
    border-radius: 999px;
  }

  .emptyComments {
    font-size: 14px;
    color: #8e8e8e;
    margin: 4px 0;
    text-align: center;
  }

  .commentItem {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .commentBody {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .commentLine {
    margin: 0;
    line-height: 1.35;
  }

  .commentAuthor {
    font-size: 13px;
    font-weight: 700;
    color: #262626;
  }

  .commentText {
    font-size: 13px;
    color: #1f2937;
    line-height: 1.3;
    word-break: break-word;
  }

  .deleteComment {
    margin-top: 3px;
    border: none;
    padding: 0;
    background: transparent;
    color: #d93025;
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .composer {
    border-top: 1px solid #efefef;
    padding: 9px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .composerInput {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 13px;
    padding: 7px 0;
  }

  .composerInput:focus {
    outline: none;
  }

  .composerButton {
    border: none;
    background: transparent;
    color: #0095f6;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }

  .composerButton:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    grid-template-rows: 56vh 1fr;

    .postSwitch {
      width: 34px;
      height: 34px;
      font-size: 20px;
    }

    .postSwitch.left {
      left: 8px;
    }

    .postSwitch.right {
      right: 8px;
    }

    .sidePanel {
      border-left: none;
      border-top: 1px solid #dbdbdb;
    }

    .sideHeader {
      height: auto;
      min-height: 56px;
      flex-wrap: wrap;
    }

    .headerRight {
      width: 100%;
      justify-content: flex-end;
    }

    .commentsPanel {
      max-height: 34vh;
    }
  }
`;

export default ShowPost;
